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
import { renderBox, terminalWidth, stripAnsi, wrapText, visibleWidth } from './terminal-ui.js';
import { colors } from './snowflake-logo.js';

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
    const body = [];
    const maxLines = Math.min(30, diff.additionsList.length + diff.removalsList.length);
    let added = 0;
    let removed = 0;

    body.push(`  ${colors.dim}${path.basename(title)} — ${diff.additions} additions, ${diff.removals} deletions${colors.reset}`);

    for (const part of diff.raw) {
      if (added + removed >= maxLines) {
        body.push(`  ${colors.dim}... and ${diff.changes - maxLines} more changes${colors.reset}`);
        break;
      }

      const lines = part.value.split('\n').filter(Boolean);
      const isAdded = part.added;
      const isRemoved = part.removed;

      for (const line of lines) {
        if (added + removed >= maxLines) break;
        if (isAdded) {
          added++;
          body.push(`  ${colors.green}+ ${line}${colors.reset}`);
        } else if (isRemoved) {
          removed++;
          body.push(`  ${colors.red}- ${line}${colors.reset}`);
        }
      }
    }

    console.log(`\n${renderBox({
      title: ` ${title} `,
      width,
      borderColor: colors.magenta,
      titleColor: colors.bright,
      body,
    })}\n`);
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
        `\n${colors.cyan}Options:${colors.reset}\n` +
        `  ${colors.green}[a]${colors.reset} — Accept all (apply full diff)\n` +
        `  ${colors.red}[r]${colors.reset} — Reject all\n` +
        `  ${colors.yellow}[m]${colors.reset} — Manual edit (opens file in $EDITOR)\n` +
        `  ${colors.dim}[s]${colors.reset} — Skip\n` +
        `${colors.yellow}Choose [a/r/m/s]: ${colors.reset}`,
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
