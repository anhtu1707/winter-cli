export class Spinner {
  constructor(options = {}) {
    const normalized = typeof options === 'string' ? { text: options } : options;
    this.text = normalized.text || '';
    this.colors = normalized.colors || {};
    this.frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    this.interval = null;
    this.frameIndex = 0;
  }

  start() {
    if (this.interval) return;
    const cyan = this.colors.cyan || '';
    const reset = this.colors.reset || '';
    const dim = this.colors.dim || '';
    this.startTime = Date.now();
    this.interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
      let timeStr = '';
      if (elapsed >= 5) {
        timeStr = ` (still thinking... ${elapsed}s)`;
      }
      
      const cols = process.stdout.columns || 80;
      let fullStr = `${this.frames[this.frameIndex]} ${this.text}${timeStr}`;
      
      // Clean ANSI for length calculation (approximate)
      const visibleLen = fullStr.replace(/\x1b\[[0-9;]*m/g, '').length;
      
      if (visibleLen >= cols - 1) {
        // Truncate the text part, leave room for timeStr and frame
        const timeStrLen = timeStr.length;
        const availableSpaceForText = cols - timeStrLen - 6; 
        if (availableSpaceForText > 10) {
          const truncText = this.text.length > availableSpaceForText 
            ? '...' + this.text.slice(-(availableSpaceForText - 3))
            : this.text;
          fullStr = `${this.frames[this.frameIndex]} ${truncText}${timeStr}`;
        } else {
          // Terminal is extremely narrow, just truncate everything
          fullStr = fullStr.slice(0, cols - 4) + '...';
        }
      }

      process.stdout.write(`\r\x1b[K${cyan}${fullStr.slice(0, 2)}${reset}${dim}${fullStr.slice(2)}${reset}`);
      this.frameIndex = (this.frameIndex + 1) % this.frames.length;
    }, 80);
  }

  stop(finalText) {
    if (!this.interval) return;
    clearInterval(this.interval);
    this.interval = null;
    process.stdout.write(`\r\x1b[K${finalText ? `${finalText}\n` : ''}`);
  }

  update(text) {
    this.text = text;
  }
}
