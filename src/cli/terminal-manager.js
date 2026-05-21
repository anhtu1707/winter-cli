import readline from 'readline';

class TerminalManager {
  constructor() {
    this.isPromptVisible = false;
    this.getLinesCountFn = null;
    this.redrawFn = null;
    this.onHideFn = null;
    this._originalLog = console.log;
    this._originalError = console.error;
    this._isIntercepting = false;
  }

  install() {
    if (this._isIntercepting) return;
    this._isIntercepting = true;

    console.log = (...args) => this._interceptLog(this._originalLog, args);
    console.error = (...args) => this._interceptLog(this._originalError, args);
  }

  uninstall() {
    if (!this._isIntercepting) return;
    this._isIntercepting = false;
    console.log = this._originalLog;
    console.error = this._originalError;
  }

  setPromptState(isVisible, getLinesCountFn = null, redrawFn = null, onHideFn = null) {
    this.isPromptVisible = isVisible;
    this.getLinesCountFn = getLinesCountFn;
    this.redrawFn = redrawFn;
    this.onHideFn = onHideFn;
  }

  hidePrompt() {
    if (!this.isPromptVisible || !process.stdout.isTTY) return;
    
    // Clear the current line first (the readline prompt itself)
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
    
    // If the prompt panel has multiple lines above it, move up and clear
    const linesCount = this.getLinesCountFn ? this.getLinesCountFn() : 0;
    if (linesCount > 1) {
      readline.moveCursor(process.stdout, 0, -(linesCount - 1));
      readline.clearScreenDown(process.stdout);
    }
    
    if (this.onHideFn) {
      this.onHideFn();
    }
  }

  _interceptLog(originalFn, args) {
    if (!this.isPromptVisible) {
      originalFn.apply(console, args);
      return;
    }

    // Hide prompt
    this.hidePrompt();

    // Print the actual log
    originalFn.apply(console, args);

    // Redraw prompt
    if (this.redrawFn) {
      this.redrawFn();
    }
  }
}

export const terminalManager = new TerminalManager();
