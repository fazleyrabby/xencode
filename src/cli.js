import { startTUI } from './cli/tui.js';
import { resolveProjectDb } from './workspace.js';
import chalk from 'chalk';

export async function runCLI() {
  const resolved = resolveProjectDb();
  
  if (!resolved) {
    console.log(chalk.yellow('⚠️  No active project. Index or switch to a project first.\n'));
    console.log(chalk.dim('  node src/app.js index ./my-project'));
    console.log(chalk.dim('  node src/app.js projects'));
    console.log(chalk.dim('  node src/app.js use <project>\n'));
    process.exit(1);
  }

  const { projectId, dbPath, meta } = resolved;
  
  console.log(chalk.cyan(`\n📁 Project: ${meta.name}`));
  console.log(chalk.dim(`   ${meta.path}\n`));

  await startTUI(dbPath, meta.path);
}