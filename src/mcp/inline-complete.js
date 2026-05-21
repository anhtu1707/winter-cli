/**
 * ❄ INLINE COMPLETION — /complete command ❄
 * Provides code completion suggestions based on context.
 * Integrates the existing CompletionProvider into the REPL.
 */

import { CompletionProvider } from './completions.js';
import path from 'path';
import { promises as fs } from 'fs';
import { colors } from '../cli/snowflake-logo.js';
import { renderBox, terminalWidth } from '../cli/terminal-ui.js';

export class InlineComplete {
  constructor(options = {}) {
    this.repl = options.repl;
    this.projectPath = options.projectPath || process.cwd();
    this.provider = new CompletionProvider();
  }

  /**
   * Generate completions for a file at a specific line/column.
   * Usage: /complete <file> [line] [column]
   *   or : /complete <file> --line <n> --col <n>
   */
  async complete(filePath, options = {}) {
    const resolvedPath = path.resolve(this.projectPath, filePath);
    let content;
    try {
      content = await fs.readFile(resolvedPath, 'utf8');
    } catch (err) {
      console.log(`${colors.red}Cannot read file: ${err.message}${colors.reset}`);
      return;
    }

    const lines = content.split('\n');
    const cursorLine = options.line !== undefined
      ? Math.min(Math.max(0, options.line - 1), lines.length - 1)
      : lines.length - 1;
    const cursorColumn = options.column !== undefined
      ? options.column
      : lines[cursorLine]?.length || 0;

    const language = this._detectLanguage(filePath);

    // Show context
    const prefix = lines.slice(Math.max(0, cursorLine - 5), cursorLine).join('\n');
    const currentLine = lines[cursorLine] || '';
    const suffix = lines.slice(cursorLine + 1, cursorLine + 4).join('\n');

    console.log(`\n${colors.cyan}❄ Inline Completion${colors.reset}`);
    console.log(`  ${colors.dim}File: ${filePath}${colors.reset}`);
    console.log(`  ${colors.dim}Line: ${cursorLine + 1}, Col: ${cursorColumn}${colors.reset}`);
    console.log(`  ${colors.dim}Language: ${language}${colors.reset}`);
    if (prefix) {
      console.log(`\n${colors.dim}Context before:${colors.reset}`);
      console.log(`  ${colors.dim}${prefix.replace(/\n/g, '\n  ')}${colors.reset}`);
    }
    console.log(`\n${colors.bright}Cursor:${colors.reset} ${colors.yellow}${currentLine.substring(0, cursorColumn)}│${currentLine.substring(cursorColumn)}${colors.reset}`);

    // Generate completions
    const result = await this.provider.generate({
      filePath,
      content,
      cursorLine,
      cursorColumn,
      language,
    });

    if (!result.completions || result.completions.length === 0) {
      console.log(`\n${colors.yellow}No completions available at this position.${colors.reset}`);
      console.log(`  ${colors.dim}Try moving the cursor to a different position (after a dot, in a new line, etc.)${colors.reset}`);
      return;
    }

    // Display completions
    const width = terminalWidth(76, 116, 92);
    const body = result.completions.map((c, i) => {
      const typeIcon = c.type === 'block-close' ? '}' :
                       c.type === 'import' ? '■' :
                       c.type === 'function' ? 'ƒ' :
                       c.type === 'method' ? '.' :
                       c.type === 'arrow-function' ? '=>' :
                       c.type === 'variable' ? '✕' :
                       c.type === 'keyword' ? '#' :
                       c.type === 'export' ? '^' :
                       c.type === 'import-path' ? '►' :
                       c.type === 'cached' ? 'v' : '•';
      const confidence = (c.confidence * 100).toFixed(0);
      return `  ${colors.cyan}#${i + 1}${colors.reset} ${typeIcon} ${colors.green}${c.text}${colors.reset}` +
        `\n    ${colors.dim}type: ${c.type}, confidence: ${confidence}%${colors.reset}`;
    });

    console.log(`\n${renderBox({
      title: ` ${result.completions.length} completion(s) `,
      width,
      borderColor: colors.magenta,
      titleColor: colors.bright,
      body,
    })}`);

    // Offer to insert one
    await this._promptInsert(result.completions, filePath, cursorLine, cursorColumn, content);
  }

  /**
   * Quick complete: generate a single best completion inline.
   * Returns the best completion or null.
   */
  async quickComplete(filePath, options = {}) {
    const resolvedPath = path.resolve(this.projectPath, filePath);
    let content;
    try {
      content = await fs.readFile(resolvedPath, 'utf8');
    } catch {
      return null;
    }

    const lines = content.split('\n');
    const cursorLine = options.line !== undefined
      ? Math.min(Math.max(0, options.line - 1), lines.length - 1)
      : lines.length - 1;
    const cursorColumn = options.column !== undefined
      ? options.column
      : lines[cursorLine]?.length || 0;

    const result = await this.provider.generate({
      filePath,
      content,
      cursorLine,
      cursorColumn,
      language: this._detectLanguage(filePath),
    });

    if (!result.completions || result.completions.length === 0) return null;
    return result.completions[0];
  }

  /**
   * Prompt user to insert a completion.
   */
  async _promptInsert(completions, filePath, cursorLine, cursorColumn, content) {
    const { default: rl } = await import('readline');
    const rli = rl.createInterface({ input: process.stdin, output: process.stdout });

    return new Promise(resolve => {
      rli.question(
        `\n${colors.cyan}Insert completion #${colors.reset}[1-${completions.length}, Enter=skip]: `,
        async (ans) => {
          rli.close();
          const num = parseInt(ans.trim(), 10);
          if (num >= 1 && num <= completions.length) {
            const completion = completions[num - 1];
            await this._insertCompletion(filePath, cursorLine, cursorColumn, content, completion.text);
            resolve(true);
          } else {
            console.log(`${colors.dim}Skipped${colors.reset}`);
            resolve(false);
          }
        }
      );
    });
  }

  /**
   * Insert a completion text at the cursor position.
   */
  async _insertCompletion(filePath, cursorLine, cursorColumn, content, text) {
    const lines = content.split('\n');
    const line = lines[cursorLine] || '';

    // Insert text at cursor position
    const newLine = line.substring(0, cursorColumn) + text + line.substring(cursorColumn);
    lines[cursorLine] = newLine;
    const newContent = lines.join('\n');

    try {
      await fs.writeFile(filePath, newContent, 'utf8');
      console.log(`\n${colors.green}✓ Inserted completion at ${path.basename(filePath)}:${cursorLine + 1}:${cursorColumn}${colors.reset}`);
      console.log(`  ${colors.dim}Inserted: "${text}"${colors.reset}`);
    } catch (err) {
      console.log(`\n${colors.red}✖ Failed to write: ${err.message}${colors.reset}`);
    }
  }

  /**
   * Detect programming language from file extension.
   */
  _detectLanguage(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const map = {
      '.js': 'js',
      '.jsx': 'jsx',
      '.ts': 'ts',
      '.tsx': 'tsx',
      '.py': 'py',
      '.rb': 'rb',
      '.go': 'go',
      '.java': 'java',
      '.rs': 'rs',
      '.c': 'c',
      '.cpp': 'cpp',
      '.h': 'c',
      '.hpp': 'cpp',
      '.cs': 'cs',
      '.php': 'php',
      '.swift': 'swift',
      '.kt': 'kt',
      '.scala': 'scala',
      '.sql': 'sql',
      '.html': 'html',
      '.css': 'css',
      '.scss': 'scss',
      '.less': 'less',
      '.json': 'json',
      '.xml': 'xml',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.md': 'markdown',
      '.vue': 'vue',
      '.svelte': 'svelte',
    };
    return map[ext] || 'unknown';
  }
}

export default InlineComplete;
