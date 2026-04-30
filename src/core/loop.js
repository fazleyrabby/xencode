import chalk from 'chalk';
import { planner } from './planner.js';
import { retrieve } from './retriever.js';
import { generate } from './generator.js';
import { critic } from './critic.js';
import { validate } from './validator.js';
import { runCommand } from './executor.js';
import { observe, formatObservations, buildFixContext } from './observer.js';
import { applyDiffPatch, validateBeforeExists } from '../tools/patch.js';
import { formatDiff } from '../agent/diff.js';
import { readFileSync } from 'fs';
import { Spinner } from '../ui.js';

const MAX_ITERATIONS = 5;
const DEFAULT_COMMANDS = ['php artisan test', 'php artisan serve', 'composer dump-autoload', 'php -l'];

export async function runAgentLoop(query, options = {}) {
  const {
    basePath = process.cwd(),
    dbPath,
    enableCritique = true,
    enableExecution = true,
    runCommands = DEFAULT_COMMANDS,
    autoApply = false
  } = options;

  const history = [];
  let iteration = 0;
  let exitRequested = false;

  // Stability tracking
  let lastError = null;
  let errorRepeatCount = 0;
  let lastOutput = null;
  let noProgressCount = 0;

  while (iteration < MAX_ITERATIONS && !exitRequested) {
    iteration++;
    console.log(chalk.bold(`\n${'='.repeat(50)}`));
    console.log(chalk.bold(`ITERATION ${iteration}/${MAX_ITERATIONS}`));
    console.log(chalk.bold('='.repeat(50)));

    // 1. PLAN
    console.log(chalk.bold('\n[PLAN]'));
    const planSpinner = new Spinner('Analyzing task... ');
    planSpinner.start();

    const planResult = await planner(query);
    planSpinner.succeed(`Intent: ${planResult.intent}, Files: ${planResult.files?.length || 0}`);

    if (planResult.files?.length > 0) {
      console.log(chalk.dim(`  Target: ${planResult.files.join(', ')}`));
    }

    // 2. RETRIEVE
    console.log(chalk.bold('\n[RETRIEVE]'));
    const retrieveSpinner = new Spinner('Fetching context... ');
    retrieveSpinner.start();

    const retrievalResult = await retrieve(query, planResult, dbPath);
    retrieveSpinner.succeed(`${retrievalResult.chunks.length} chunks`);

    // 3. CODE (with before/after patch format)
    console.log(chalk.bold('\n[CODE]'));
    const codeSpinner = new Spinner('Generating patch... ');
    codeSpinner.start();

    const genResult = await generate(query, planResult, retrievalResult.context);
    codeSpinner.succeed(`${genResult.file}`);

    const currentFile = genResult.file;
    const currentBefore = genResult.before;
    const currentAfter = genResult.after;

    // 4. CRITIQUE
    let critiqueResult = { issues: [], critiqueClean: true };
    if (enableCritique) {
      console.log(chalk.bold('\n[CRITIQUE]'));
      const critiqueSpinner = new Spinner('Reviewing... ');
      critiqueSpinner.start();

      critiqueResult = await critic(currentAfter, query, planResult);

      if (critiqueResult.critiqueClean) {
        critiqueSpinner.succeed('No issues');
      } else {
        critiqueSpinner.warn(`${critiqueResult.issues.length} issues`);
        console.log(chalk.yellow('  ' + critiqueResult.issues.join('\n  ')));
      }
    }

    // 5. VALIDATION
    console.log(chalk.bold('\n[VALIDATE]'));
    const validateSpinner = new Spinner('Checking... ');
    validateSpinner.start();

    // Check before exists in file before applying
    const beforeCheck = validateBeforeExists(currentFile, currentBefore);
    if (!beforeCheck.valid) {
      validateSpinner.fail('before mismatch');
      console.log(chalk.red(`  ${beforeCheck.error}`));
      console.log(chalk.yellow(`  Searched: ${beforeCheck.searched?.slice(0, 80)}...`));

      // If there's a mismatch, try to continue anyway but warn
      if (iteration > 1) {
        noProgressCount++;
      }
    } else {
      validateSpinner.succeed('before matches');
    }

    // Syntax validation
    const validationResult = await validate(currentAfter, currentFile);
    if (validationResult.valid) {
      console.log(chalk.green('  ✓ Syntax OK'));
    } else {
      console.log(chalk.red(`  ✗ Syntax error: ${validationResult.errors.join('; ')}`));
    }

    // 6. DIFF PREVIEW
    console.log(chalk.bold('\n[DIFF]'));
    if (currentBefore && currentAfter) {
      const diffText = `--- a/${currentFile}\n+++ b/${currentFile}\n${formatLineDiff(currentBefore, currentAfter)}`;
      console.log(formatDiffPreview(diffText));
    } else {
      console.log(chalk.yellow('  (no diff available)'));
    }

    // 7. APPLY
    console.log(chalk.bold('\n[APPLY]'));
    const applyConfirm = autoApply || await confirmApply(currentFile);
    let applyResult = null;

    if (applyConfirm) {
      // Use new patch system with before/after validation
      applyResult = applyDiffPatch(currentFile, currentBefore, currentAfter);

      if (applyResult.success) {
        console.log(chalk.green(`  ✓ Applied to ${currentFile}`));
      } else {
        console.log(chalk.red(`  ✗ ${applyResult.error}`));
        if (applyResult.details) {
          console.log(chalk.yellow(`  Details: ${JSON.stringify(applyResult.details)}`));
        }
      }
    } else {
      console.log(chalk.dim('  Skipped'));
      exitRequested = true;
      break;
    }

    // 8. EXECUTE
    let execResults = [];
    if (enableExecution && applyResult?.success && !exitRequested) {
      console.log(chalk.bold('\n[EXECUTE]'));

      for (const cmd of runCommands) {
        const execSpinner = new Spinner(`${cmd}... `);
        execSpinner.start();

        const execResult = await runCommand(cmd, { cwd: basePath });
        execSpinner.stop();

        if (execResult.success) {
          execSpinner.succeed(`✓ ${cmd}`);
        } else {
          execSpinner.fail(`✗ ${cmd} (exit ${execResult.exitCode})`);
        }

        execResults.push({ command: cmd, result: execResult });

        if (execResult.stdout) {
          console.log(chalk.dim('  ' + execResult.stdout.slice(0, 300)));
        }
        if (execResult.stderr) {
          console.log(chalk.dim('  ' + execResult.stderr.slice(0, 300)));
        }
      }
    }

    // 9. OBSERVE
    let obsResults = [];
    if (execResults.length > 0) {
      console.log(chalk.bold('\n[OBSERVE]'));

      for (const { command, result } of execResults) {
        const obs = await observe(result);
        obsResults.push({ command, observation: obs });

        if (obs.verdict === 'PASS') {
          console.log(chalk.green(`  ✓ ${command}: PASS`));
        } else if (obs.verdict === 'FAIL') {
          console.log(chalk.red(`  ✗ ${command}: FAIL`));
          console.log(chalk.yellow(`    ${obs.suggestion}`));
        } else {
          console.log(chalk.yellow(`  ⚠ ${command}: WARN`));
        }
      }
    }

    // LOG HISTORY
    history.push({
      iteration,
      plan: planResult,
      file: currentFile,
      before: currentBefore,
      after: currentAfter,
      validation: validationResult,
      critique: critiqueResult,
      execResults,
      obsResults
    });

    // --- STOP CONDITIONS ---

    // Check for repeated identical error
    const currentError = obsResults.length > 0
      ? obsResults.map(o => o.observation.errorSummary).join('; ')
      : '';

    if (currentError && currentError === lastError) {
      errorRepeatCount++;
      console.log(chalk.yellow(`\n⚠️  Same error repeated ${errorRepeatCount}x`));
      if (errorRepeatCount >= 2) {
        console.log(chalk.red('\n✗ Stopping: same error repeated twice'));
        break;
      }
    } else {
      errorRepeatCount = 0;
    }
    lastError = currentError;

    // Check for no progress (output unchanged)
    if (lastOutput === currentAfter) {
      noProgressCount++;
      if (noProgressCount >= 2) {
        console.log(chalk.red('\n✗ Stopping: no progress detected (2 iterations)'));
        break;
      }
    }
    lastOutput = currentAfter;

    // Success exit
    const allExecPassed = execResults.length > 0 && execResults.every(r => r.result.success);
    const allObsPassed = obsResults.length > 0 && obsResults.every(o => o.observation.verdict === 'PASS');

    if (allExecPassed && allObsPassed) {
      console.log(chalk.green('\n✓ All checks passed.'));
      break;
    }

    // Max iterations
    if (iteration >= MAX_ITERATIONS) {
      console.log(chalk.yellow('\n⚠ Max iterations reached.'));
      break;
    }

    // Feed structured error back for next iteration
    if (applyResult?.success && !allExecPassed) {
      const fixContext = buildFixContext(obsResults.find(o => o.observation.verdict === 'FAIL')?.observation || {});
      console.log(chalk.yellow('\n↩ Feeding structured error feedback...'));

      query = `Fix errors from previous attempt.

Original task: ${query}

Errors:
${fixContext}

Previous code:
${currentAfter}

Instructions:
- Fix ONLY the errors
- Use minimal changes
- Do NOT reformat unrelated code`;
    }
  }

  return {
    iterations: iteration,
    history,
    finalPatch: { file: currentFile, before: currentBefore, after: currentAfter }
  };
}

function formatLineDiff(before, after) {
  const bLines = before.split('\n');
  const aLines = after.split('\n');
  const diff = [];

  diff.push('@@ -1,' + bLines.length + ' +1,' + aLines.length + ' @@');

  for (const line of bLines) {
    diff.push('- ' + line);
  }
  for (const line of aLines) {
    diff.push('+ ' + line);
  }

  return diff.join('\n');
}

function formatDiffPreview(diffText) {
  const lines = diffText.split('\n');
  const output = [];

  for (const line of lines) {
    if (line.startsWith('+++') || line.startsWith('---')) {
      output.push(chalk.dim(line));
    } else if (line.startsWith('+')) {
      output.push(chalk.green(line));
    } else if (line.startsWith('-')) {
      output.push(chalk.red(line));
    } else if (line.startsWith('@@')) {
      output.push(chalk.cyan(line));
    } else {
      output.push(line);
    }
  }

  return output.join('\n');
}

async function confirmApply(file) {
  const readline = await import('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const { promisify } = await import('util');
  const question = promisify(rl.question).bind(rl);

  return new Promise(resolve => {
    rl.question(`Apply patch to ${file}? [Y/n] `, async answer => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      resolve(trimmed === '' || trimmed === 'y' || trimmed === 'yes');
    });
  });
}
