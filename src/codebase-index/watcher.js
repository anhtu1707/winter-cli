/**
 * ❄ CODEBASE WATCHER ❄
 * Watches project files for changes and triggers re-indexing.
 * Uses fs.watch with debouncing.
 */
import { watch } from 'fs';
import path from 'path';
import { CodebaseIndexer } from './indexer.js';

const DEBOUNCE_MS = 500;
const IGNORED_DIR_PATTERNS = /(^|[\\/])(node_modules|\.git|dist|build|\.winter|\.claude|\.next|\.cache|coverage)([\\/]|$)/;

export class CodebaseWatcher {
  constructor(options = {}) {
    this.projectPath = options.projectPath || process.cwd();
    this.indexer = options.indexer || new CodebaseIndexer(options);
    this.watcher = null;
    this.debounceTimers = new Map();
    this.listeners = new Set();
    this.watching = false;
  }

  /**
   * Start watching the project directory.
   * @param {object} options
   * @param {boolean} options.debounce - Whether to debounce rapid changes (default: true)
   */
  start(options = {}) {
    if (this.watching) return;
    this.watching = true;

    try {
      this.watcher = watch(this.projectPath, { recursive: true }, (eventType, filename) => {
        if (!filename || IGNORED_DIR_PATTERNS.test(filename)) return;
        this._handleChange(filename, options.debounce !== false);
      });
    } catch {
      // fs.watch with recursive may fail on some systems (e.g., Linux with old inotify limits)
      console.warn('[codebase-watcher] recursive watching not available, falling back to on-demand indexing');
      this.watching = false;
    }
  }

  /**
   * Stop watching.
   */
  stop() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    this.watching = false;
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  /**
   * Register a callback for indexing events.
   * @param {function} listener - Called with { filePath, eventType }
   */
  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Get watcher status.
   */
  getStatus() {
    return {
      watching: this.watching,
      projectPath: this.projectPath,
      pendingChanges: this.debounceTimers.size,
    };
  }

  // ── Private ────────────────────────────────────────

  _handleChange(filename, debounce) {
    const normalizedPath = filename.replace(/\\/g, '/');

    if (debounce) {
      if (this.debounceTimers.has(normalizedPath)) {
        clearTimeout(this.debounceTimers.get(normalizedPath));
      }
      this.debounceTimers.set(normalizedPath, setTimeout(() => {
        this.debounceTimers.delete(normalizedPath);
        this._processChange(normalizedPath);
      }, DEBOUNCE_MS));
    } else {
      this._processChange(normalizedPath);
    }
  }

  _processChange(relativePath) {
    const absolutePath = path.resolve(this.projectPath, relativePath);

    // Notify listeners
    for (const listener of this.listeners) {
      try {
        listener({ filePath: relativePath, eventType: 'change' });
      } catch {
        // ignore listener errors
      }
    }

    // Re-index the changed file
    this.indexer.indexFile(absolutePath).catch(() => {
      // If file was deleted, remove from index
      this.indexer.removeFile(absolutePath).catch(() => {});
    });
  }
}

export default CodebaseWatcher;
