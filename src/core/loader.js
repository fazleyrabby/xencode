import chalk from 'chalk';

const STEPS = [
  'Planning',
  'Retrieving',
  'Generating',
  'Reviewing',
  'Validating',
  'Applying',
  'Executing',
  'Observing'
];

export class Loader {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.buffer = '';
    this.cursor = 0;
    this.step = '';
    this.lines = 0;
    this.startTime = Date.now();
  }

  start(step) {
    if (!this.enabled) return;
    this.step = step;
    this.buffer = '';
    this.cursor = 0;
    this.lines = 0;
    this.startTime = Date.now();
    this.render();
  }

  write(token) {
    if (!this.enabled) return;
    this.buffer += token;
    this.cursor++;
    this.render();
  }

  render() {
    if (!this.enabled) return;

    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    const displayStep = this.step ? ` ${this.step}` : '';
    const spinner = this.getSpinner();

    // Estimate lines based on buffer length (rough)
    const estimatedLines = Math.max(1, Math.ceil(this.buffer.length / 80));
    const clearLines = '\r\x1b[2K\x1b[0G'.repeat(this.lines);
    const moveUp = this.lines > 0 ? '\x1b[' + this.lines + 'A' : '';

    const prefix = chalk.bold(`${spinner}${displayStep}`);
    const status = this.buffer.length > 0
      ? chalk.dim(`${elapsed}s`)
      : chalk.dim(`${elapsed}s waiting...`);

    const output = this.buffer.length > 0
      ? ` ${truncate(this.buffer, 120)}`
      : chalk.dim('...');

    const line1 = `\r${prefix}${output} ${status}`;
    const line2 = this.buffer.length > 20 ? chalk.dim('\nType to cancel...') : '';

    process.stdout.write(clearLines + moveUp + line1 + line2);
    this.lines = 1;
  }

  getSpinner() {
    const spinners = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    return spinners[Math.floor(this.cursor / 3) % spinners.length];
  }

  succeed(message = '') {
    if (!this.enabled) return;
    this.clear();
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    process.stdout.write(`\r✅ ${chalk.bold(this.step || 'Done')} ${chalk.dim(`(${elapsed}s)`)}`);
    if (message) {
      process.stdout.write(` ${message}`);
    }
    process.stdout.write('\n');
  }

  fail(message = '') {
    if (!this.enabled) return;
    this.clear();
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    process.stdout.write(`\r❌ ${chalk.bold(this.step || 'Failed')} ${chalk.dim(`(${elapsed}s)`)}`);
    if (message) {
      process.stdout.write(` ${chalk.red(message)}`);
    }
    process.stdout.write('\n');
  }

  warn(message = '') {
    if (!this.enabled) return;
    this.clear();
    process.stdout.write(`\r⚠️  ${chalk.bold(this.step)} ${chalk.yellow(message)}\n`);
  }

  clear() {
    if (!this.enabled) return;
    if (this.lines > 0) {
      process.stdout.write('\r\x1b[2K\x1b[0G'.repeat(this.lines));
    }
  }

  stop() {
    if (!this.enabled) return;
    this.clear();
    this.enabled = false;
  }
}

/**
 * Stream tokens to loader while collecting full text.
 */
export async function streamToLoader(loader, stream) {
  let text = '';
  for await (const token of stream) {
    if (token === null) break;
    text += token;
    loader.write(token);
  }
  loader.succeed();
  return text;
}

function truncate(str, maxLen) {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

/**
 * Multi-step progress display.
 */
export class StepLoader {
  constructor(steps, options = {}) {
    this.steps = steps;
    this.current = 0;
    this.enabled = options.enabled !== false;
    this.results = {};
    this.startTime = Date.now();
  }

  start() {
    if (!this.enabled) return;
    this.render();
  }

  next(stepName, result) {
    if (!this.enabled) return;
    this.results[this.steps[this.current]] = result;
    this.current++;
    this.render();
  }

  render() {
    if (!this.enabled) return;

    const total = this.steps.length;
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);

    const parts = [];
    for (let i = 0; i < total; i++) {
      const name = this.steps[i];
      if (i < this.current) {
        parts.push(chalk.green('✓'));
      } else if (i === this.current) {
        const spinner = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'][Math.floor(Date.now() / 100) % 10];
        parts.push(spinner);
      } else {
        parts.push(chalk.dim('○'));
      }
    }

    const status = ` ${parts.join(' ')} ${chalk.dim(`(${elapsed}s)`)}`;
    process.stdout.write(`\r${status}\x1b[2K\x1b[0G`);
  }

  finish() {
    if (!this.enabled) return;
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    process.stdout.write(`\r✅ All steps complete ${chalk.dim(`(${elapsed}s)`)}\n`);
  }
}
