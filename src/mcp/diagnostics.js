/**
 * IDE Diagnostics - Real-time code diagnostics for IDE integration.
 * Provides linting, error detection, and fix suggestions.
 */

import { promises as fs } from 'fs';
import path from 'path';

export class DiagnosticEngine {
  constructor(options = {}) {
    this.projectPath = options.projectPath || process.cwd();
    this.diagnostics = new Map(); // file -> diagnostic[]
    this.rules = new Map();
    this._registerDefaultRules();
  }

  /**
   * Run diagnostics on a file.
   */
  async diagnose(filePath) {
    const fullPath = path.resolve(this.projectPath, filePath);
    try {
      const content = await fs.readFile(fullPath, 'utf8');
      const ext = path.extname(filePath).toLowerCase();
      const issues = [];

      for (const [, rule] of this.rules) {
        if (rule.extensions && rule.extensions.length > 0 && !rule.extensions.includes(ext)) continue;
        try {
          const result = await rule.check(content, filePath, fullPath);
          if (result && Array.isArray(result)) {
            issues.push(...result);
          }
        } catch {}
      }

      this.diagnostics.set(filePath, issues);
      return issues;
    } catch (error) {
      return [{ severity: 'error', message: `Failed to read file: ${error.message}`, line: 0 }];
    }
  }

  /**
   * Run diagnostics on all files in the project.
   */
  async diagnoseAll(files) {
    const results = [];
    for (const file of files) {
      const issues = await this.diagnose(file);
      if (issues.length > 0) {
        results.push({ file, issues });
      }
    }
    return results;
  }

  /**
   * Get cached diagnostics for a file.
   */
  getDiagnostics(filePath) {
    return this.diagnostics.get(filePath) || [];
  }

  /**
   * Get fix suggestions for a diagnostic issue.
   */
  getFix(issue) {
    const fixers = {
      'missing-semicolon': () => ({ type: 'insert', position: issue.column, text: ';' }),
      'unused-variable': () => ({ type: 'remove', target: issue.symbol }),
      'missing-import': () => ({ type: 'insert-import', module: issue.symbol }),
    };

    const fixer = fixers[issue.code];
    return fixer ? fixer() : null;
  }

  /**
   * Clear diagnostics for a file.
   */
  clear(filePath) {
    this.diagnostics.delete(filePath);
  }

  /**
   * Clear all diagnostics.
   */
  clearAll() {
    this.diagnostics.clear();
  }

  /**
   * Register a custom diagnostic rule.
   */
  addRule(name, rule) {
    this.rules.set(name, rule);
    return this;
  }

  _registerDefaultRules() {
    this.addRule('long-lines', {
      name: 'Long lines',
      extensions: ['.js', '.ts', '.jsx', '.tsx', '.py', '.go', '.rs'],
      check: (content) => {
        const issues = [];
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].length > 120) {
            issues.push({
              severity: 'warning',
              code: 'long-line',
              message: `Line ${i + 1} exceeds 120 characters (${lines[i].length})`,
              line: i + 1,
              column: 120,
            });
          }
        }
        return issues;
      },
    });

    this.addRule('trailing-spaces', {
      name: 'Trailing spaces',
      extensions: ['.js', '.ts', '.jsx', '.tsx', '.py', '.md'],
      check: (content) => {
        const issues = [];
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (lines[i] !== lines[i].trimEnd()) {
            issues.push({
              severity: 'warning',
              code: 'trailing-space',
              message: `Line ${i + 1} has trailing whitespace`,
              line: i + 1,
              column: lines[i].trimEnd().length + 1,
            });
          }
        }
        return issues;
      },
    });

    this.addRule('todo-comments', {
      name: 'TODO/FIXME comments',
      extensions: ['.js', '.ts', '.jsx', '.tsx', '.py', '.go', '.rs', '.java'],
      check: (content) => {
        const issues = [];
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const todo = lines[i].match(/(TODO|FIXME|HACK|XXX)(?!:.*done)/i);
          if (todo) {
            issues.push({
              severity: 'info',
              code: 'todo-comment',
              message: `${todo[1]} comment on line ${i + 1}`,
              line: i + 1,
              column: lines[i].indexOf(todo[0]) + 1,
              symbol: todo[1],
            });
          }
        }
        return issues;
      },
    });
  }
}

export default DiagnosticEngine;
