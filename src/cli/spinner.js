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
      process.stdout.write(`\r\x1b[K${cyan}${this.frames[this.frameIndex]}${reset} ${dim}${this.text}${timeStr}${reset}`);
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
