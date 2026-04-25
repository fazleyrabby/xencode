const SPINNERS = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export class Spinner {
  constructor(prefix = '') {
    this.prefix = prefix;
    this.interval = null;
    this.current = 0;
    this.isRunning = false;
  }

  start(message = '') {
    this.isRunning = true;
    this.current = 0;
    process.stdout.write(`\r${SPINNERS[0]} ${this.prefix}${message}    `);
    this.interval = setInterval(() => {
      this.current = (this.current + 1) % SPINNERS.length;
      process.stdout.write(`\r${SPINNERS[this.current]} ${this.prefix}${message}    `);
    }, 80);
  }

  update(message = '') {
    if (this.isRunning) {
      process.stdout.write(`\r${SPINNERS[this.current]} ${this.prefix}${message}    `);
    }
  }

  succeed(message = '') {
    this.stop();
    process.stdout.write(`\r✅ ${this.prefix}${message}\n`);
  }

  fail(message = '') {
    this.stop();
    process.stdout.write(`\r❌ ${this.prefix}${message}\n`);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.isRunning = false;
  }
}

export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}