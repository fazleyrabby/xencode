import chalk from 'chalk';

export async function askApproval(diffText) {
  console.log(chalk.cyan('\n┌─── PATCH PREVIEW ───┐\n'));
  console.log(diffText);
  console.log(chalk.cyan('\n└───────────────────────┘\n'));
  console.log(chalk.gray('  ↑ ↓ navigate  ·  Enter confirm  ·  Ctrl+C cancel\n'));

  let selected = 0;
  const choices = [
    { value: true, label: '✅  Yes — apply changes' },
    { value: false, label: '❌  No — skip' }
  ];

  function render() {
    const lines = choices.map((c, i) => {
      const prefix = i === selected ? chalk.cyan.bold('❯ ') : '  ';
      const text = i === selected ? chalk.white.bold(c.label) : chalk.gray(c.label);
      return prefix + text;
    });
    process.stdout.write('\x1B[?25l');
    process.stdout.write('\x1B[s');
    process.stdout.write('\x1B[2K');
    process.stdout.write(lines.join('\n'));
    process.stdout.write('\x1B[u');
  }

  function cleanup() {
    process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stdout.write('\x1B[?25h');
    process.stdout.write('\n');
  }

  return new Promise((resolve) => {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    render();

    function onKey(data) {
      const key = data.toString();

      if (key === '\u0003') {
        cleanup();
        console.log(chalk.yellow('\n⏎  Cancelled'));
        resolve(false);
        return;
      }

      if (key === '\r' || key === '\n') {
        cleanup();
        resolve(choices[selected].value);
        return;
      }

      if (key === '\u001b[A' || key === 'k') {
        selected = (selected - 1 + choices.length) % choices.length;
        render();
        return;
      }

      if (key === '\u001b[B' || key === 'j') {
        selected = (selected + 1) % choices.length;
        render();
        return;
      }
    }

    process.stdin.on('data', onKey);
  });
}
