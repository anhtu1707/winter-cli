import readline from 'readline';
import { colors } from './snowflake-logo.js';
import { padVisible, renderBox, terminalWidth } from './terminal-ui.js';
import { buildTuiSnapshot, renderInputPanel } from './tui.js';
import { terminalManager } from './terminal-manager.js';

export class WinterInputController {
  constructor(repl) {
    this.repl = repl;
  }

  showInputPrompt() {
    const repl = this.repl;
    if (!repl.running || repl.readlineClosed) return;
    const panel = this.buildInputPanel();
    
    // Queue indicator
    const queueCount = repl.taskQueue?.length || 0;
    const queueTag = queueCount > 0
      ? `  ${colors.yellow}⧗ ${queueCount} pending${colors.reset}`
      : '';
    
    const lines = [panel.top + queueTag, panel.status, panel.hint].filter(l => l && l.trim() !== '');
    
    const redrawFn = () => {
      // Don't redraw if it shouldn't be visible anymore
      if (!terminalManager.isPromptVisible) return;
      process.stdout.write('\n' + lines.join('\n') + '\n');
      if (typeof repl.rl?.setPrompt === 'function') {
        repl.rl.setPrompt(panel.prompt);
      }
      if (repl.slashMenu?.open) {
        this.renderSlashMenu();
      } else {
        if (repl.running && !repl.readlineClosed) {
          repl.rl?.prompt?.(true);
        }
      }
    };

    const getLinesCountFn = () => {
      let count = lines.length + 2; // empty line + lines + prompt line
      if (repl.slashMenu?.open && repl.slashMenu?.printedLines) {
        count += repl.slashMenu.printedLines;
      }
      return count;
    };

    const onHideFn = () => {
      if (repl.slashMenu) {
        repl.slashMenu.printedLines = 0;
      }
    };

    terminalManager.setPromptState(true, getLinesCountFn, redrawFn, onHideFn);
    redrawFn();
  }

  closeInputBox() {
    const repl = this.repl;
    if (!repl.running || repl.readlineClosed) return;
    
    terminalManager.hidePrompt();
    terminalManager.setPromptState(false);
    
    const panel = this.buildInputPanel();
    process.stdout.write(`${panel.bottom}\n`);
  }

  buildInputPanel() {
    const repl = this.repl;
    return renderInputPanel(buildTuiSnapshot(repl), {
      colors,
      width: terminalWidth(66, 124),
    });
  }

  installSlashSuggestions() {
    const repl = this.repl;
    if (!process.stdin.isTTY) return;

    readline.emitKeypressEvents(process.stdin, repl.rl);

    process.stdin.on('keypress', (str, key = {}) => {
      if (key.ctrl && key.name === 'v') {
        void this.handleDirectClipboardPaste();
        return;
      }

      if (key.name === 'return' && (key.shift || key.meta)) {
        repl.rl.write('\\\n');
        return;
      }

      if (key.ctrl || key.meta) return;

      if (typeof str === 'string' && str.length > 1) {
        return;
      }

      if (repl.slashMenu.open && this.handleSlashMenuKey(key)) {
        return;
      }

      if (key.name === 'escape') {
        if (repl.isProcessing) {
          // Cancel current AI turn
          repl.isCancelled = true;
          if (repl.spinner) repl.spinner.stop();
          console.log(`\n${colors.red}[ Đã nhận lệnh HỦY... AI sẽ kết thúc ở thao tác tiếp theo ]${colors.reset}`);
        } else {
          // Double-ESC to end session
          const now = Date.now();
          if (this._lastEscTime && (now - this._lastEscTime) < 500) {
            console.log(`\n\n${colors.cyan}Cảm ơn đã sử dụng Winter!${colors.reset}`);
            console.log(`${colors.yellow}Tiếp tục phiên làm việc:${colors.reset}`);
            console.log(`${colors.bright}${colors.green}winter --session ${repl.session?.getSessionId?.() || ''}${colors.reset}\n`);
            process.exit(0);
          }
          this._lastEscTime = now;
          console.log(`${colors.dim}Press ESC again to end session${colors.reset}`);
        }
        return;
      }

      queueMicrotask(() => {
        const line = repl.rl?.line || '';
        if (!line.startsWith('/')) {
          this.closeSlashMenu();
          repl.rl?.prompt?.(true);
          return;
        }

        this.openSlashMenu(line);
      });
    });
  }

  async handleDirectClipboardPaste() {
    const repl = this.repl;
    if (repl._handlingDirectClipboardPaste || repl.readlineClosed || !repl.running) return false;
    repl._handlingDirectClipboardPaste = true;
    try {
      const image = await repl.getClipboardImage();
      if (!image) return false;

      const prompt = (repl.rl?.line || '').trim() || 'Analyze this pasted clipboard image.';
      this.closeSlashMenu();
      if (repl.rl?.write) {
        repl.rl.write(null, { ctrl: true, name: 'u' });
      }

      repl.inputQueue = repl.inputQueue
        .then(async () => {
          repl.closeInputBox?.();
          await this.processPastedImageTask(prompt, image);
        })
        .catch((error) => {
          repl.closeInputBox?.();
          console.log(`\n${colors.red}✖ Paste image error: ${error.message}${colors.reset}\n`);
          if (repl.running && !repl.readlineClosed) repl.showInputPrompt?.();
        });
      return true;
    } finally {
      repl._handlingDirectClipboardPaste = false;
    }
  }

  async processPastedImageTask(prompt, image) {
    const repl = this.repl;
    repl.isProcessing = true;
    repl.isCancelled = false;
    repl.currentAbortController = new AbortController();
    try {
      await repl.chat(prompt, [image]);
    } finally {
      repl.isProcessing = false;
      repl.currentAbortController = null;
      if (repl.taskQueue.length > 0) {
        const nextTask = repl.taskQueue.shift();
        setTimeout(() => repl.processInputTask(nextTask), 0);
      } else if (!repl.readlineClosed) {
        repl.showInputPrompt?.();
      }
    }
  }

  openSlashMenu(line) {
    const repl = this.repl;
    const matches = repl.getSlashSuggestions(line);
    if (matches.length === 0) {
      this.closeSlashMenu();
      repl.rl?.prompt?.(true);
      return;
    }
    if (repl.slashMenu.open && repl.slashMenu.line === line) return;

    repl.slashMenu = { open: true, line, items: matches, selected: 0, printedLines: repl.slashMenu?.printedLines || 0 };
    this.renderSlashMenu();
  }

  closeSlashMenu() {
    const repl = this.repl;
    this.clearSlashMenuRender();
    repl.slashMenu = { open: false, line: '', items: [], selected: 0, printedLines: 0 };
  }

  clearSlashMenuRender() {
    const repl = this.repl;
    const printedLines = repl.slashMenu?.printedLines || 0;
    if (!printedLines || !process.stdout.isTTY) return;

    readline.moveCursor(process.stdout, 0, -printedLines);
    readline.clearScreenDown(process.stdout);
    repl.slashMenu.printedLines = 0;
  }

  handleSlashMenuKey(key = {}) {
    const repl = this.repl;
    if (key.name === 'up') {
      this.moveSlashSelection(-1);
      return true;
    }
    if (key.name === 'down') {
      this.moveSlashSelection(1);
      return true;
    }
    if (key.name === 'tab') {
      this.acceptSlashSelection();
      return true;
    }
    if (key.name === 'escape') {
      this.closeSlashMenu();
      repl.rl.prompt(true);
      return true;
    }
    return false;
  }

  moveSlashSelection(delta) {
    const repl = this.repl;
    if (!repl.slashMenu.items.length) return;
    const count = repl.slashMenu.items.length;
    repl.slashMenu.selected = (repl.slashMenu.selected + delta + count) % count;
    this.renderSlashMenu();
  }

  acceptSlashSelection() {
    const repl = this.repl;
    const item = repl.slashMenu.items[repl.slashMenu.selected];
    if (!item) return;

    const currentLine = String(repl.rl?.line ?? repl.slashMenu.line ?? '');
    const slashPrefixMatch = currentLine.match(/^\s*(\/\S*)(.*)$/);
    const prefix = slashPrefixMatch ? slashPrefixMatch[1] : currentLine.trim();
    const suffixText = slashPrefixMatch ? slashPrefixMatch[2] : '';
    const needsSpace = item.usage && suffixText && !/^\s/.test(suffixText);
    const replacement = `${item.cmd}${needsSpace ? ' ' : ''}${suffixText}`.trimEnd();

    this.closeSlashMenu();
    repl.rl.write(null, { ctrl: true, name: 'u' });
    repl.rl.write(replacement || prefix || item.cmd);
    repl.rl.prompt(true);
  }

  renderSlashMenu() {
    const repl = this.repl;
    const matches = repl.slashMenu.items;
    if (!matches.length) return;

    const maxDisplay = 5;
    const displayedMatches = matches.slice(0, maxDisplay);
    const body = [
      `${colors.dim}Tab selects. Esc closes. Enter sends the current line.${colors.reset}`,
      '',
      ...displayedMatches.map((item, index) => {
      const usage = item.usage ? ` ${colors.dim}${item.usage}${colors.reset}` : '';
      const pointer = index === repl.slashMenu.selected ? `${colors.green}>${colors.reset}` : ' ';
        return `${pointer} ${colors.cyan}${padVisible(item.cmd, 16)}${colors.reset} ${colors.dim}${item.desc}${colors.reset}${usage}`;
      }),
    ];

    if (matches.length > maxDisplay) {
      body.push(`  ${colors.dim}... ${matches.length - maxDisplay} more. Keep typing to filter.${colors.reset}`);
    }

    this.clearSlashMenuRender();

    const rendered = renderBox({
      title: 'Command Palette',
      width: terminalWidth(66, 110, 88),
      borderColor: colors.magenta,
      titleColor: colors.cyan,
      body,
    });

    process.stdout.write(`\n${rendered}\n`);

    repl.slashMenu.printedLines = rendered.split('\n').length + 1;
    repl.rl.prompt(true);
  }
}
