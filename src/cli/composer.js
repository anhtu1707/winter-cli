/**
 * ❄️ COMPOSER MODE ❄️
 * Multi-file editing orchestration with batch apply/reject.
 * Inspired by Cursor Composer.
 *
 * Usage:
 *   /composer <task>       — Start a composer session
 *   /composer apply        — Apply all pending changes
 *   /composer reject       — Reject all pending changes
 *   /composer list         — Show pending changes
 */

import { promises as fs } from 'fs';
import path from 'path';
import { renderBox, terminalWidth } from './terminal-ui.js';
import { colors } from './snowflake-logo.js';
import { DiffView } from './diff-view.js';

const COMPOSER_STATE_DIR = '.winter/composer';

export class Composer {
  constructor(options = {}) {
    this.repl = options.repl;
    this.projectPath = options.projectPath || process.cwd();
    this.diffView = options.diffView || new DiffView({ projectPath: this.projectPath });
    this.pendingChanges = [];  // { filePath, oldContent, newContent, description, diff }
    this.completedChanges = [];
    this.stateFile = path.join(this.projectPath, COMPOSER_STATE_DIR, 'state.json');
    this.isActive = false;
  }

  /**
   * Start a composer session with a natural language task.
   * AI generates changes across multiple files, user reviews batch.
   */
  async compose(task) {
    this.isActive = true;
    this.pendingChanges = [];
    this.completedChanges = [];

    // Load previous state
    await this._loadState();

    console.log(`\n${colors.cyan}❄ Composer Mode${colors.reset}`);
    console.log(`${colors.dim}Task: ${task}${colors.reset}\n`);

    // Use AI to generate changes
    const changes = await this._generateChanges(task);
    if (!changes || changes.length === 0) {
      console.log(`${colors.yellow}No changes generated.${colors.reset}`);
      this.isActive = false;
      return;
    }

    this.pendingChanges = changes;

    // Show summary of all changes
    this._showSummary();

    // Save state
    await this._saveState();

    // Batch review
    await this._batchReview();
  }

  /**
   * Show summary of all pending changes.
   */
  _showSummary() {
    const width = terminalWidth(76, 116, 92);
    const body = this.pendingChanges.map((c, i) => {
      const added = c.diff?.additions || 0;
      const removed = c.diff?.removals || 0;
      return `  ${colors.cyan}#${i + 1}${colors.reset} ${colors.bright}${c.filePath}${colors.reset}` +
        `\n    ${colors.dim}${c.description || 'No description'}${colors.reset}` +
        `\n    ${colors.green}+${added}${colors.reset} ${colors.red}-${removed}${colors.reset}`;
    });

    console.log(`\n${renderBox({
      title: ` 📋 Composer: ${this.pendingChanges.length} file(s) `,
      width,
      borderColor: colors.magenta,
      titleColor: colors.bright,
      body,
    })}\n`);
  }

  /**
   * Review changes one by one with apply/reject.
   */
  async _batchReview() {
    for (let i = 0; i < this.pendingChanges.length; i++) {
      const change = this.pendingChanges[i];
      const remaining = this.pendingChanges.length - i;

      console.log(`\n${colors.cyan}[${i + 1}/${this.pendingChanges.length}]${colors.reset} Reviewing: ${colors.bright}${change.filePath}${colors.reset}`);
      console.log(`${colors.dim}${change.description || ''}${colors.reset}`);
      console.log(`${colors.dim}${remaining - 1} more file(s) remaining after this${colors.reset}\n`);

      const choice = await this.diffView.promptSimpleDiff(
        change.filePath,
        change.oldContent,
        change.newContent,
        { title: `Composer: ${path.basename(change.filePath)}` }
      );

      switch (choice) {
        case 'y': {
          try {
            await this.diffView.backupFile(change.filePath);
            await fs.mkdir(path.dirname(change.filePath), { recursive: true });
            await fs.writeFile(change.filePath, change.newContent, 'utf8');
            this.completedChanges.push({ ...change, status: 'applied' });
            console.log(`\n${colors.green}✓ Applied${colors.reset}`);
          } catch (err) {
            console.log(`\n${colors.red}✖ Failed to apply: ${err.message}${colors.reset}`);
            this.completedChanges.push({ ...change, status: 'failed', error: err.message });
          }
          break;
        }
        case 'n':
          this.completedChanges.push({ ...change, status: 'rejected' });
          console.log(`\n${colors.dim}✖ Rejected${colors.reset}`);
          break;
        case 'e':
          // Edit mode: let user manually edit
          console.log(`\n${colors.yellow}Opening edit for ${change.filePath}...${colors.reset}`);
          // Backup before editing
          await this.diffView.backupFile(change.filePath);
          const edited = await this.diffView.interactiveEdit(
            change.filePath,
            change.oldContent,
            change.newContent,
            change.diff,
            terminalWidth(76, 116, 92)
          );
          if (edited) {
            try {
              await fs.writeFile(change.filePath, edited, 'utf8');
              this.completedChanges.push({ ...change, status: 'edited' });
              console.log(`${colors.green}✓ Applied edited${colors.reset}`);
            } catch (err) {
              console.log(`${colors.red}✖ Failed: ${err.message}${colors.reset}`);
            }
          } else {
            this.completedChanges.push({ ...change, status: 'rejected' });
            console.log(`${colors.dim}✖ Cancelled${colors.reset}`);
          }
          break;
      }
    }

    this._showResult();
    this.isActive = false;
    await this._saveState();
  }

  /**
   * Show final result after batch review.
   */
  _showResult() {
    const applied = this.completedChanges.filter(c => c.status === 'applied' || c.status === 'edited').length;
    const rejected = this.completedChanges.filter(c => c.status === 'rejected').length;
    const failed = this.completedChanges.filter(c => c.status === 'failed').length;

    console.log(`\n${colors.cyan}=== Composer Result ===${colors.reset}`);
    console.log(`  ${colors.green}✓ Applied: ${applied}${colors.reset}`);
    if (rejected > 0) console.log(`  ${colors.red}✖ Rejected: ${rejected}${colors.reset}`);
    if (failed > 0) console.log(`  ${colors.red}✖ Failed: ${failed}${colors.reset}`);

    // Print summary
    for (const c of this.completedChanges) {
      const icon = c.status === 'applied' || c.status === 'edited' ? '✓' : '✖';
      const color = c.status === 'applied' || c.status === 'edited' ? colors.green : colors.red;
      console.log(`  ${color}${icon}${colors.reset} ${c.filePath} ${colors.dim}(${c.status})${colors.reset}`);
    }
    console.log('');
  }

  /**
   * Use AI to generate multi-file changes for a task.
   * Returns array of { filePath, oldContent, newContent, description, diff }
   */
  async _generateChanges(task) {
    const context = await this.repl.getProjectContext(task);
    const messages = [
      {
        role: 'system',
        content: [
          'You are a Winter Composer agent. Your job is to generate specific file changes.',
          'Analyze the task and decide which files need to be created or modified.',
          'For each file, read the current content first, then determine the new content.',
          '',
          'Output a JSON array of changes. Each change has:',
          '- "filePath": relative path from project root',
          '- "description": brief what this change does',
          '- "newContent": the complete new file content',
          '',
          'Example:',
          '[{"filePath":"src/hello.js","description":"Add greeting function","newContent":"export function hello() {\\n  return \\"Hello\\";\\n}\\n"}]',
          '',
          'IMPORTANT:',
          '- For existing files, read them first, then provide the complete new content',
          '- For new files, provide the complete content',
          '- Use Read tool to check existing files before changing them',
          '- Output ONLY valid JSON array, no other text',
        ].join('\n'),
      },
      {
        role: 'user',
        content: `Task: ${task}\n\nProject: ${this.projectPath}\n${context ? `\nContext:\n${context}` : ''}\n\nRead the relevant files first, then generate the complete new content for each file. Output ONLY a JSON array.`,
      },
    ];

    const tools = this.repl.getAgentTools('general');
    const { finalContent } = await this.repl.runConversation(messages, 'Composer generating changes...', tools);

    if (!finalContent) {
      return [];
    }

    // Parse JSON from response
    const changes = this._parseChanges(finalContent);
    // Compute diffs for each change
    for (const c of changes) {
      if (c.filePath) {
        const resolvedPath = path.resolve(this.projectPath, c.filePath);
        try {
          c.oldContent = await fs.readFile(resolvedPath, 'utf8');
        } catch {
          c.oldContent = '';
        }
        c.diff = this.diffView.computeDiff(c.oldContent, c.newContent || '');
      }
    }
    return changes;
  }

  /**
   * Parse JSON array of changes from AI response.
   */
  _parseChanges(content) {
    let parsed = [];
    try {
      const trimmed = content.trim();
      if (trimmed.startsWith('[')) {
        parsed = JSON.parse(trimmed);
      } else {
        const jsonMatch = trimmed.match(/```(?:json)?\s*\n?(\[[\s\S]*?\])\n?\s*```/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[1]);
        } else {
          const arrayMatch = trimmed.match(/\[[\s\S]*?\]/);
          if (arrayMatch) {
            parsed = JSON.parse(arrayMatch[0]);
          }
        }
      }
    } catch (e) {
      console.log(`${colors.red}Failed to parse changes: ${e.message}${colors.reset}`);
      console.log(`${colors.dim}Raw response:${colors.reset}`);
      console.log(content?.substring(0, 500));
      return [];
    }
    // Validate structure
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(c => c.filePath && c.newContent);
  }

  /**
   * Apply all pending changes at once.
   */
  async applyAll() {
    if (this.pendingChanges.length === 0) {
      console.log(`${colors.yellow}No pending changes.${colors.reset}`);
      return;
    }

    let applied = 0;
    for (const change of this.pendingChanges) {
      try {
        await fs.mkdir(path.dirname(change.filePath), { recursive: true });
        await fs.writeFile(change.filePath, change.newContent, 'utf8');
        this.completedChanges.push({ ...change, status: 'applied' });
        applied++;
      } catch (err) {
        this.completedChanges.push({ ...change, status: 'failed', error: err.message });
      }
    }

    this.pendingChanges = [];
    console.log(`${colors.green}✓ Applied ${applied} change(s)${colors.reset}`);
  }

  /**
   * Reject all pending changes.
   */
  rejectAll() {
    if (this.pendingChanges.length === 0) {
      console.log(`${colors.yellow}No pending changes.${colors.reset}`);
      return;
    }

    for (const change of this.pendingChanges) {
      this.completedChanges.push({ ...change, status: 'rejected' });
    }
    this.pendingChanges = [];
    console.log(`${colors.dim}✖ Rejected all changes${colors.reset}`);
  }

  /**
   * List pending changes.
   */
  /**
   * Save composer state to disk for recovery.
   */
  async _saveState() {
    try {
      await fs.mkdir(path.dirname(this.stateFile), { recursive: true });
      const state = {
        pendingChanges: this.pendingChanges,
        completedChanges: this.completedChanges,
        isActive: this.isActive,
        updatedAt: new Date().toISOString(),
      };
      await fs.writeFile(this.stateFile, JSON.stringify(state, null, 2), 'utf8');
    } catch {
      // best-effort
    }
  }

  /**
   * Load previous composer state from disk.
   */
  async _loadState() {
    try {
      const raw = await fs.readFile(this.stateFile, 'utf8');
      const state = JSON.parse(raw);
      if (state.pendingChanges && state.pendingChanges.length > 0) {
        this.pendingChanges = state.pendingChanges;
        console.log(`${colors.cyan}↻ Restored ${state.pendingChanges.length} pending change(s) from previous session${colors.reset}`);
      }
      if (state.completedChanges) {
        this.completedChanges = state.completedChanges;
      }
    } catch {
      // No saved state
    }
  }

  listChanges() {
    if (this.pendingChanges.length === 0) {
      console.log(`${colors.yellow}No pending changes.${colors.reset}`);
      return;
    }
    this._showSummary();
  }
}

export default Composer;
