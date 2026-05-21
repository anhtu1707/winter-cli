/**
 * ❄️ DIFF VIEW — APPLY/REJECT UI ❄️
 * Provides diff preview and interactive accept/reject/edit workflow.
 * Inspired by Cursor's apply/reject UI.
 */
import { diffLines } from 'diff';
import { promises as fs } from 'fs';
import path from 'path';
import readline from 'readline';
import { spawn } from 'child_process';
import { highlight } from 'cli-highlight';
import { renderBox, terminalWidth, stripAnsi, wrapText, visibleWidth } from './terminal-ui.js';
import { colors } from './snowflake-logo.js';

// Setup background colors if not defined in snowflake-logo
const bgRed = '\x1b[41m';
const bgGreen = '\x1b[42m';
const bgDarkRed = '\x1b[48;5;52m';
const bgDarkGreen = '\x1b[48;5;22m';

export class DiffView {
  constructor(options = {}) {
    this.projectPath = options.projectPath || process.cwd();
    this.backupDir = options.backupDir || path.join(this.projectPath, '.winter', 'diff-backups');
  }

  /**
   * Show a diff preview and prompt user to apply/reject/edit.
   * @param {string} filePath - Path to the file
   * @param {string} oldContent - Original content
   * @param {string} newContent - New content
   * @param {object} options
   * @param {string} options.title - Optional title for the diff box
   * @param {function} options.onApply - Called when user accepts
   * @param {function} options.onReject - Called when user rejects
   * @param {function} options.onEdit - Called when user wants to edit
   * @returns {Promise<{accepted: boolean, edited: boolean}>}
   */
  async promptDiff(filePath, oldContent, newContent, options = {}) {
    const title = options.title || `Edit: ${path.basename(filePath)}`;
    const diff = this.computeDiff(oldContent, newContent);
    const width = terminalWidth(76, 116, 92);

    if (diff.changes === 0) {
      console.log(`${colors.yellow}⚠ No changes to apply${colors.reset}`);
      return { accepted: false, edited: false };
    }

    this._renderDiff(title, diff, width);

    const choice = await this._promptChoice();

    switch (choice) {
      case 'apply':
        await this._createBackup(filePath);
        await fs.writeFile(filePath, newContent, 'utf8');
        if (options.onApply) await options.onApply(filePath, newContent);
        console.log(`\n${colors.green}✓ Applied ${diff.changes} change(s) to ${path.basename(filePath)}${colors.reset}\n`);
        return { accepted: true, edited: false };

      case 'reject':
        if (options.onReject) await options.onReject(filePath);
        console.log(`\n${colors.dim}✖ Rejected changes to ${path.basename(filePath)}${colors.reset}\n`);
        return { accepted: false, edited: false };

      case 'edit': {
        const editedContent = await this.interactiveEdit(filePath, oldContent, newContent, diff, width);
        if (editedContent === null) {
          return { accepted: false, edited: false };
        }
        console.log(`\n${colors.green}✓ Applied edited changes to ${path.basename(filePath)}${colors.reset}\n`);
        if (options.onApply) await options.onApply(filePath, editedContent);
        return { accepted: true, edited: true };
      }

      case 'skip':
      default:
        if (options.onReject) await options.onReject(filePath);
        return { accepted: false, edited: false };
    }
  }

  /**
   * Show diff inline and prompt for a single action.
   * Returns 'y' (yes), 'n' (no), 'e' (edit).
   */
  async promptSimpleDiff(filePath, oldContent, newContent, options = {}) {
    const diff = this.computeDiff(oldContent, newContent);
    const width = terminalWidth(76, 116, 92);
    const title = options.title || `Diff: ${path.basename(filePath)}`;

    if (diff.changes === 0) {
      return 'skip';
    }

    this._renderDiff(title, diff, width);
    return await this._promptSimpleChoice();
  }

  /**
   * Compute diff between two strings.
   */
  computeDiff(oldContent, newContent) {
    const changes = diffLines(oldContent || '', newContent || '');
    const additions = [];
    const removals = [];
    let additionsCount = 0;
    let removalsCount = 0;

    for (const part of changes) {
      const lines = part.value.replace(/\n$/, '').split('\n');
      if (part.added) {
        additions.push(...lines.map(l => ({ text: l, line: additionsCount + removalsCount + 1 })));
        additionsCount += lines.length;
      } else if (part.removed) {
        removals.push(...lines.map(l => ({ text: l, line: additionsCount + removalsCount + 1 })));
        removalsCount += lines.length;
      }
    }

    return {
      changes: additionsCount + removalsCount,
      additions: additionsCount,
      removals: removalsCount,
      additionsList: additions,
      removalsList: removals,
      raw: changes,
    };
  }

  // ── Private Methods ─────────────────────────────────

  _renderDiff(title, diff, width) {
    const innerWidth = Math.max(40, width - 6);
    const header = `${colors.bright} ${title} ${colors.reset} ${colors.dim}— ${diff.additions} additions, ${diff.removals} deletions${colors.reset}`;

    console.log(`\n${colors.magenta}┌${'─'.repeat(width - 2)}┐${colors.reset}`);
    console.log(`${colors.magenta}│${colors.reset} ${header}${''.padEnd(Math.max(0, width - 4 - stripAnsi(header).length))}${colors.magenta}│${colors.reset}`);
    console.log(`${colors.magenta}├${'─'.repeat(width - 2)}┤${colors.reset}`);

    const maxLines = 40;
    let printed = 0;
    let lineNum = 0;
    const contextLines = 2; // lines of context around changes

    // Build display entries with context
    const entries = [];
    for (const part of diff.raw) {
      const lines = part.value.replace(/\n$/, '').split('\n');
      for (const line of lines) {
        lineNum++;
        if (part.added) {
          entries.push({ type: 'add', num: lineNum, text: line });
        } else if (part.removed) {
          entries.push({ type: 'del', num: lineNum, text: line });
        } else {
          entries.push({ type: 'ctx', num: lineNum, text: line });
        }
      }
    }

    // Find which context lines to show (near changes)
    const changeIndices = new Set();
    entries.forEach((e, i) => {
      if (e.type !== 'ctx') {
        for (let j = Math.max(0, i - contextLines); j <= Math.min(entries.length - 1, i + contextLines); j++) {
          changeIndices.add(j);
        }
      }
    });

    let lastPrinted = -1;
    for (let i = 0; i < entries.length && printed < maxLines; i++) {
      const e = entries[i];
      if (e.type === 'ctx' && !changeIndices.has(i)) continue;

      // Show separator if there's a gap
      if (lastPrinted >= 0 && i - lastPrinted > 1) {
        console.log(`${colors.magenta}│${colors.reset} ${colors.dim}${'·'.repeat(Math.min(20, innerWidth))}${colors.reset}`);
      }

      const numStr = String(e.num).padStart(4);
      const maxText = Math.max(10, innerWidth - 8);
      const truncated = e.text.length > maxText ? e.text.slice(0, maxText - 3) + '...' : e.text;

      // Detect language from file extension for highlight
      const ext = path.extname(title).slice(1) || 'javascript';
      const syntaxHighlight = (text) => {
        try {
          return highlight(text, { language: ext, ignoreIllegals: true });
        } catch (e) {
          return text;
        }
      };

      if (e.type === 'add') {
        const lineContent = syntaxHighlight(truncated);
        console.log(`${colors.magenta}│${colors.reset} ${bgDarkGreen}${colors.white}${numStr} + ${lineContent}${' '.repeat(Math.max(0, innerWidth - stripAnsi(truncated).length - 8))}${colors.reset}`);
      } else if (e.type === 'del') {
        const lineContent = syntaxHighlight(truncated);
        console.log(`${colors.magenta}│${colors.reset} ${bgDarkRed}${colors.white}${numStr} - ${lineContent}${' '.repeat(Math.max(0, innerWidth - stripAnsi(truncated).length - 8))}${colors.reset}`);
      } else {
        const lineContent = syntaxHighlight(truncated);
        console.log(`${colors.magenta}│${colors.reset} ${colors.dim}${numStr}   ${colors.reset}${lineContent}`);
      }

      printed++;
      lastPrinted = i;
    }

    if (printed >= maxLines && entries.length > maxLines) {
      const remaining = entries.filter(e => e.type !== 'ctx').length - printed;
      if (remaining > 0) {
        console.log(`${colors.magenta}│${colors.reset} ${colors.dim}  ... and ${remaining} more changes${colors.reset}`);
      }
    }

    console.log(`${colors.magenta}└${'─'.repeat(width - 2)}┘${colors.reset}\n`);
  }

  async _promptChoice() {
    return new Promise(resolve => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      rl.question(
        `${colors.cyan}Apply changes?${colors.reset} ${colors.green}[y]${colors.reset}es / ${colors.red}[n]${colors.reset}o / ${colors.yellow}[e]${colors.reset}dit / ${colors.dim}[s]${colors.reset}kip: `,
        answer => {
          rl.close();
          const ans = (answer || '').trim().toLowerCase();
          if (ans === 'y' || ans === 'yes') resolve('apply');
          else if (ans === 'e' || ans === 'edit') resolve('edit');
          else if (ans === 's' || ans === 'skip') resolve('skip');
          else resolve('reject');
        }
      );
    });
  }

  async _promptSimpleChoice() {
    return new Promise(resolve => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      rl.question(
        `${colors.green}[y]${colors.reset}es / ${colors.red}[n]${colors.reset}o / ${colors.yellow}[e]${colors.reset}dit: `,
        answer => {
          rl.close();
          const ans = (answer || '').trim().toLowerCase();
          if (ans === 'y' || ans === 'yes') resolve('y');
          else if (ans === 'e' || ans === 'edit') resolve('e');
          else resolve('n');
        }
      );
    });
  }

  async interactiveEdit(filePath, oldContent, newContent, diff, width) {
    console.log(`\n${colors.cyan}Interactive Edit Mode${colors.reset}`);
    console.log(`${colors.dim}Current changes for ${path.basename(filePath)}:${colors.reset}\n`);

    this._renderDiff(`Editing: ${path.basename(filePath)}`, diff, width);

    return new Promise(resolve => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const onAnswer = (answer) => {
        const ans = (answer || '').trim().toLowerCase();
        let result = null;
        if (ans === 'a' || ans === 'accept') result = newContent;
        else if (ans === 'r' || ans === 'reject') result = null;
        else if (ans === 'm' || ans === 'manual') {
          rl.close();
          this._openInEditor(filePath, newContent).then(() => {
            // After editor closes, assume they saved; no way to know what they wrote
            console.log(`${colors.green}✓ Editor closed, changes applied${colors.reset}`);
            resolve(newContent);
          }).catch(() => resolve(null));
          return; // don't close rl yet, _openInEditor handles it
        } else {
          result = null; // skip
        }
        rl.close();
        resolve(result);
      };

      rl.question(
        `\n${colors.cyan}Edit Options:${colors.reset}\n` +
        `  ${colors.green}[a]${colors.reset} Accept   — Apply the complete diff\n` +
        `  ${colors.red}[r]${colors.reset} Reject   — Discard these changes\n` +
        `  ${colors.yellow}[m]${colors.reset} Manual   — Open file in $EDITOR to manually resolve\n` +
        `  ${colors.dim}[s]${colors.reset} Skip     — Skip for now\n` +
        `${colors.yellow}👉 Choose [a/r/m/s]: ${colors.reset}`,
        onAnswer
      );


    });
  }

  /**
   * Create a backup of a file before applying changes.
   */
  async backupFile(filePath) {
    return this._createBackup(filePath);
  }

  async _createBackup(filePath) {
    try {
      await fs.mkdir(this.backupDir, { recursive: true });
      const timestamp = Date.now();
      const baseName = path.basename(filePath);
      const backupName = `${timestamp}_${baseName}`;
      const backupPath = path.join(this.backupDir, backupName);
      await fs.copyFile(filePath, backupPath);

      // Update backup manifest
      const metaPath = path.join(this.backupDir, 'meta.json');
      let meta = [];
      try {
        meta = JSON.parse(await fs.readFile(metaPath, 'utf8'));
      } catch {}
      meta.push({ original: filePath, backup: backupPath, time: timestamp });
      await fs.writeFile(metaPath, JSON.stringify(meta), 'utf8');
    } catch {
      // backup is best-effort
    }
  }

  async _openInEditor(filePath, newContent) {
    const editor = process.env.EDITOR || process.env.VISUAL || 'vim';
    const tempPath = path.join(this.backupDir, `_edit_${Date.now()}_${path.basename(filePath)}`);

    try {
      await fs.writeFile(tempPath, newContent, 'utf8');
    } catch {
      return;
    }

    return new Promise(resolve => {
      const child = spawn(editor, [tempPath], {
        stdio: 'inherit',
        shell: true,
      });
      child.on('exit', async () => {
        try {
          const edited = await fs.readFile(tempPath, 'utf8');
          if (edited !== newContent) {
            await fs.writeFile(filePath, edited, 'utf8');
            console.log(`${colors.green}✓ Applied edited changes from ${editor}${colors.reset}`);
          }
        } catch {
          // ignore read errors after editor
        } finally {
          resolve();
        }
      });
      child.on('error', () => resolve());
    });
  }

  /**
   * Get undos: list recent backups for a file.
   */
  async getUndoHistory(filePath) {
    const metaPath = path.join(this.backupDir, 'meta.json');
    try {
      const meta = JSON.parse(await fs.readFile(metaPath, 'utf8'));
      return meta
        .filter(m => m.original === filePath)
        .sort((a, b) => b.time - a.time);
    } catch {
      return [];
    }
  }

  /**
   * Restore a file from a specific backup.
   */
  async restoreFromBackup(backupPath, targetPath) {
    try {
      await fs.copyFile(backupPath, targetPath);
      return true;
    } catch {
      return false;
    }
  }
}

export default DiffView;
