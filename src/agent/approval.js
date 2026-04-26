import readline from 'readline';
import chalk from 'chalk';

export function askApprovalInline(diffText, filePath) {
  return new Promise((resolve) => {
    console.log(chalk.dim('\n────────────────────────────'));
    console.log(chalk.cyan(`📄 ${filePath}\n`));
    console.log(diffText);
    console.log(chalk.dim('\n────────────────────────────'));
    console.log(chalk.green('✔ Proposed patch ready\n'));
    console.log(chalk.gray('[Enter] Apply   [Esc] Skip   [E] Edit   [V] View full file'));
    console.log(chalk.dim('────────────────────────────\n'));

    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);

    let handled = false;

    const cleanup = () => {
      if (process.stdin.isRaw) {
        process.stdin.setRawMode(false);
      }
      process.stdin.removeAllListeners('keypress');
    };

    process.stdin.on('keypress', (_, key) => {
      if (handled) return;
      handled = true;

      if (key.ctrl && key.name === 'c') {
        cleanup();
        process.exit(0);
        return;
      }

      if (key.name === 'return') {
        cleanup();
        resolve({ action: 'apply' });
        return;
      }

      if (key.name === 'escape') {
        cleanup();
        resolve({ action: 'skip' });
        return;
      }

      if (key.name === 'e') {
        cleanup();
        resolve({ action: 'edit' });
        return;
      }

      if (key.name === 'v') {
        cleanup();
        resolve({ action: 'view' });
        return;
      }
    });
  });
}
