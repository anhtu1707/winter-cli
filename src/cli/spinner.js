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
    this.lastLines = 0;
    
    // Make sure we're on a clean line
    process.stdout.write('\r\x1b[K');
    
    this.interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
      let timeStr = '';
      if (elapsed >= 5) {
        timeStr = ` (still thinking... ${elapsed}s)`;
      }
      
      const cols = process.stdout.columns || 80;
      let fullStr = `${this.frames[this.frameIndex]} ${this.text}${timeStr}`;
      
      // Clear previous frame
      if (this.lastLines > 0) {
        process.stdout.write(`\r\x1b[${this.lastLines}A\x1b[J`);
      } else {
        process.stdout.write('\r\x1b[K');
      }
      
      const visibleLen = fullStr.replace(/\x1b\[[0-9;]*m/g, '').length;
      this.lastLines = Math.max(0, Math.ceil(visibleLen / cols) - 1);

      process.stdout.write(`${cyan}${fullStr.slice(0, 2)}${reset}${dim}${fullStr.slice(2)}${reset}`);
      this.frameIndex = (this.frameIndex + 1) % this.frames.length;
    }, 80);
  }

  stop(finalText) {
    if (!this.interval) return;
    clearInterval(this.interval);
    this.interval = null;
    
    if (this.lastLines > 0) {
      process.stdout.write(`\r\x1b[${this.lastLines}A\x1b[J`);
    } else {
      process.stdout.write('\r\x1b[K');
    }
    
    if (finalText) {
      process.stdout.write(`${finalText}\n`);
    }
  }

  update(text) {
    this.text = text;
  }
}
