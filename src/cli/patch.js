import readline from 'readline';
import chalk from 'chalk';

export async function showPatchUI(patchResult, diff) {
  console.log(chalk.bold('\n📄 PATCH PREVIEW'));
  console.log(chalk.dim('─'.repeat(40)));
  console.log(chalk.cyan(`File: ${patchResult.file}`));
  console.log(chalk.cyan(`Action: ${patchResult.patch?.type || 'unknown'}`));
  if (patchResult.summary) {
    console.log(chalk.cyan(`Summary: ${patchResult.summary}`));
  }
  console.log(chalk.dim('─'.repeat(40)));
  
  if (diff) {
    console.log(diff);
  }
  
  console.log(chalk.dim('─'.repeat(40)));
  console.log(chalk.bold('Actions:'));
  console.log('  [Enter] apply  [r] regenerate  [e] edit  [s] skip');
  console.log();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (prompt) => new Promise((resolve) => rl.question(prompt, resolve));

  let choice = '';
  while (!['apply', 'regenerate', 'edit', 'skip', 'r', 'e', 's', ''].includes(choice)) {
    choice = await question(chalk.cyan('> '));
    if (choice === '') choice = 'apply';
  }

  rl.close();

  switch (choice) {
    case '':
    case 'apply':
      return 'apply';
    case 'r':
      return 'regenerate';
    case 'e':
      return 'edit';
    case 's':
      return 'skip';
    default:
      return 'skip';
  }
}

export async function confirmApply(patchResult) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (prompt) => new Promise((resolve) => rl.question(prompt, resolve));

  console.log(chalk.yellow(`\n⚠️  About to write to: ${patchResult.file}`));
  const confirm = await question(chalk.cyan('Proceed? [y/N] '));
  rl.close();

  return confirm.toLowerCase() === 'y';
}

export function printDiffPreview(diff, maxLines = 30) {
  if (!diff) {
    console.log(chalk.dim('  (no diff available)'));
    return;
  }

  const lines = diff.split('\n');
  const preview = lines.slice(0, maxLines);
  
  console.log(preview.join('\n'));
  
  if (lines.length > maxLines) {
    console.log(chalk.dim(`\n  ... (${lines.length - maxLines} more lines)`));
  }
}