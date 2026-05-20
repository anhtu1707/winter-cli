import readline from 'readline';
import { colors } from './snowflake-logo.js';
import { padVisible, renderBox, terminalWidth, visibleWidth } from './terminal-ui.js';

export class WinterInputController {
  constructor(repl) {
    this.repl = repl;
  }

  showInputPrompt() {
    const repl = this.repl;
    if (!repl.running || repl.readlineClosed) return;
    const panel = this.buildInputPanel();
    process.stdout.write(`\n${panel.top}\n${panel.status}\n${panel.hint}\n`);
    repl.rl.setPrompt(panel.prompt);
    repl.rl.prompt();
  }

  closeInputBox() {
    const repl = this.repl;
    if (!repl.running || repl.readlineClosed) return;
    const panel = this.buildInputPanel();
    process.stdout.write(`${panel.bottom}\n`);
  }

  buildInputPanel() {
    const repl = this.repl;
    const width = Math.max(64, terminalWidth(66, 124) - 2);
    const box = repl.useUnicodeUi
      ? { topLeft: '╭', topRight: '╮', bottomLeft: '╰', bottomRight: '╯', horizontal: '─', vertical: '│' }
      : { topLeft: '+', topRight: '+', bottomLeft: '+', bottomRight: '+', horizontal: '-', vertical: '|' };
    const provider = repl.ai?.getActiveProvider?.() || 'provider';
    const model = repl.ai?.providers?.[provider]?.model || 'model';
    const sessionId = repl.session?.getSessionId?.()?.slice(0, 8) || 'session';
    const projectName = repl.projectPath ? repl.projectPath.split(/[\\/]/).filter(Boolean).pop() : 'project';
    const queueText = repl.taskQueue?.length > 0 ? `queue:${repl.taskQueue.length}` : 'ready';
    const title = ' Winter CLI ';
    const titleWidth = visibleWidth(title);
    const topFill = Math.max(0, width - titleWidth);
    const leftFill = Math.floor(topFill / 2);
    const rightFill = topFill - leftFill;
    const statusText = [
      `model ${provider}/${model}`,
      `project ${projectName}`,
      `session ${sessionId}`,
      queueText,
    ].join('  ');
    const hintText = '@file  @Agent task  !cmd  Ctrl+V image  /context  /doctor full';
    const hintInnerWidth = Math.max(20, width - 2);
    const status = `${colors.magenta}${box.vertical}${colors.reset} ${colors.dim}${padVisible(statusText, hintInnerWidth)}${colors.reset} ${colors.magenta}${box.vertical}${colors.reset}`;
    const hint = `${colors.magenta}${box.vertical}${colors.reset} ${colors.dim}${padVisible(hintText, hintInnerWidth)}${colors.reset} ${colors.magenta}${box.vertical}${colors.reset}`;
    const prompt = `${colors.magenta}${box.vertical}${colors.reset} ${colors.bright}${colors.cyan}winter${colors.reset}${colors.dim} > ${colors.reset}`;
    return {
      top: `${colors.magenta}${box.topLeft}${box.horizontal.repeat(leftFill)}${title}${box.horizontal.repeat(rightFill)}${box.topRight}${colors.reset}`,
      status,
      hint,
      prompt,
      bottom: `${colors.magenta}${box.bottomLeft}${box.horizontal.repeat(width)}${box.bottomRight}${colors.reset}`,
    };
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
      if (key.ctrl || key.meta) return;

      if (typeof str === 'string' && str.length > 1) {
        return;
      }

      if (repl.slashMenu.open && this.handleSlashMenuKey(key)) {
        return;
      }

      if (key.name === 'escape' && repl.isProcessing) {
        repl.isCancelled = true;
        if (repl.spinner) repl.spinner.stop();
        console.log(`\n${colors.red}[ Đã nhận lệnh HỦY... AI sẽ kết thúc ở thao tác tiếp theo ]${colors.reset}`);
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
          this.closeInputBox();
          await this.processPastedImageTask(prompt, image);
        })
        .catch((error) => {
          this.closeInputBox();
          console.log(`\n${colors.red}✖ Paste image error: ${error.message}${colors.reset}\n`);
          if (repl.running && !repl.readlineClosed) this.showInputPrompt();
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
    try {
      await repl.chat(prompt, [image]);
    } finally {
      repl.isProcessing = false;
      if (repl.taskQueue.length > 0) {
        const nextTask = repl.taskQueue.shift();
        setTimeout(() => repl.processInputTask(nextTask), 0);
      } else if (!repl.readlineClosed) {
        this.showInputPrompt();
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
