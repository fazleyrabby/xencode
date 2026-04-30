import chalk from 'chalk';
import readline from 'readline';
import { createSession } from '../core/session.js';
import { classify } from '../core/mode.js';
import { buildContext, updateSessionContext, addToHistory } from '../core/context.js';
import { handleCommand } from './commands.js';
import { showPatchUI } from './patch.js';
import { applyPatch } from '../agent/tool.js';
import { generateDiffForPatch, generateFullFileDiff } from '../agent/diff.js';
import { Spinner } from '../ui.js';

import { planner } from '../core/planner.js';
import { retrieve } from '../core/retriever.js';
import { generate } from '../core/generator.js';
import { critic } from '../core/critic.js';
import { regenerate } from '../core/regenerator.js';
import { validate } from '../core/validator.js';
import { score, levelLabel, planCompleteness } from '../core/scorer.js';

export async function startTUI(dbPath, basePath) {
  const session = createSession();

  const BANNER = `
╔═══════════════════════════════════════╗
║         Xencode TUI v0.6              ║
║    Interactive Coding Assistant      ║
╚═══════════════════════════════════════╝
`;

  console.log(chalk.bold(BANNER));
  console.log(chalk.dim('Type /help for commands, /exit to quit\n'));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    completer: (line) => {
      const commands = ['/exit', '/reset', '/stats', '/files', '/plan', '/context', '/debug', '/help'];
      const hits = commands.filter((c) => c.startsWith(line));
      return [hits.length ? hits : commands, line];
    }
  });

  const question = (prompt) => new Promise((resolve) => rl.question(prompt, resolve));

  while (true) {
    try {
      const input = await question(chalk.cyan('> '));
      
      if (!input || input.trim() === '') continue;

      const startTime = Date.now();

      if (input === '/exit' || input === '/quit') {
        console.log(chalk.dim('\nGoodbye!\n'));
        break;
      }

      if (input.startsWith('/')) {
        const shouldContinue = await handleCommand(session, input);
        if (shouldContinue === false) break;
        continue;
      }

      await runSessionAgent(session, input, dbPath, basePath, { question });

    } catch (err) {
      console.error(chalk.red(`\n❌ Error: ${err.message}`));
      if (session.debug) {
        console.error(err.stack);
      }
    }
  }

  rl.close();
}

async function runSessionAgent(session, input, dbPath, basePath, ui) {
  const mode = classify(input);

  if (session.debug) {
    console.log(chalk.dim(`\n[DEBUG] Mode: ${mode}`));
  }

  if (mode === 'RETRIEVE') {
    await handleRetrieve(session, input, dbPath, ui);
    return;
  }

  if (mode === 'EXPLAIN') {
    await handleExplain(session, input, dbPath, ui);
    return;
  }

  await handleModify(session, input, dbPath, basePath, ui);
}

async function handleRetrieve(session, input, dbPath, ui) {
  console.log(chalk.bold('\n[RETRIEVE]'));
  
  const spinner = new Spinner('Searching... ');
  spinner.start();
  
  const { retrieve } = await import('../core/retriever.js');
  const result = await retrieve(input, { search_queries: [input], target_files: [] }, dbPath);
  
  spinner.succeed(`${result.chunks.length} chunks found`);
  
  if (result.chunks.length > 0) {
    console.log(chalk.dim('\n' + result.context.slice(0, 1000) + '\n'));
  }
  
  session.lastContext = result.context;
}

async function handleExplain(session, input, dbPath, ui) {
  console.log(chalk.bold('\n[EXPLAIN]'));
  
  const spinner = new Spinner('Analyzing... ');
  spinner.start();
  
  const { retrieve } = await import('../core/retriever.js');
  const result = await retrieve(input, { search_queries: [input], target_files: [] }, dbPath);
  
  spinner.succeed('Analysis complete');
  
  session.lastContext = result.context;
  
  if (result.chunks.length > 0) {
    console.log(chalk.dim('\n' + result.context.slice(0, 1500) + '\n'));
  }
}

async function handleModify(session, input, dbPath, basePath, ui) {
  console.log(chalk.bold('\n[PLAN]'));
  const planSpinner = new Spinner('Planning... ');
  planSpinner.start();
  
  const planResult = await planner(input);
  session.lastPlan = planResult;
  const planComplete = planCompleteness(planResult);
  
  planSpinner.succeed('Plan generated');
  if (session.debug) {
    console.log(chalk.dim(JSON.stringify(planResult, null, 2)));
  }
  
  console.log(chalk.dim(`  Intent: ${planResult.intent}`));
  console.log(chalk.dim(`  Targets: ${(planResult.files || planResult.target_files || []).join(', ') || 'auto-detect'}`));
  
  console.log(chalk.bold('\n[RETRIEVAL]'));
  const retrieveSpinner = new Spinner('Retrieving... ');
  retrieveSpinner.start();
  
  const retrievalResult = await retrieve(input, planResult, dbPath);
  
  retrieveSpinner.succeed(`${retrievalResult.chunks.length} chunks`);
  
  const context = buildContext(session, retrievalResult.chunks);
  updateSessionContext(session, context);
  
  for (const chunk of retrievalResult.chunks) {
    session.workingFiles.add(chunk.file);
  }
  
  console.log(chalk.bold('\n[GENERATION]'));
  const genSpinner = new Spinner('Generating... ');
  genSpinner.start();
  
  const genResult = await generate(input, planResult, context);
  
  genSpinner.succeed(`${genResult.file}`);
  
  let currentCode = genResult.patch?.content || '';
  let currentFile = genResult.file;
  let currentPatch = genResult.patch;
  
  console.log(chalk.bold('\n[CRITIQUE]'));
  const critiqueSpinner = new Spinner('Reviewing... ');
  critiqueSpinner.start();
  
  const critiqueResult = await critic(currentCode, input, planResult);
  
  if (critiqueResult.critiqueClean) {
    critiqueSpinner.succeed('No issues');
  } else {
    critiqueSpinner.warn(`${critiqueResult.issues.length} issues found`);
    if (session.debug) {
      critiqueResult.issues.forEach((issue) => console.log(chalk.yellow(`  - ${issue}`)));
    }
    
    console.log(chalk.bold('\n[REGENERATION]'));
    const regenSpinner = new Spinner('Regenerating... ');
    regenSpinner.start();
    
    const regenResult = await regenerate(currentCode, critiqueResult.issues, input);
    currentFile = regenResult.file;
    currentPatch = regenResult.patch;
    currentCode = regenResult.patch?.content || '';
    
    regenSpinner.succeed('Done');
  }
  
  console.log(chalk.bold('\n[VALIDATION]'));
  const validateSpinner = new Spinner('Validating... ');
  validateSpinner.start();
  
  const validationResult = await validate(currentCode, currentFile);
  
  if (validationResult.valid) {
    validateSpinner.succeed('Passed');
  } else {
    validateSpinner.fail('Failed');
    console.log(chalk.red(`  Errors: ${validationResult.errors.join('; ')}`));
  }
  
  if (validationResult.warnings.length > 0) {
    console.log(chalk.yellow(`  Warnings: ${validationResult.warnings.join('; ')}`));
  }
  
  const confidence = score(
    retrievalResult.retrievalScore,
    planComplete,
    validationResult.valid,
    critiqueResult.critiqueClean
  );
  
  console.log(chalk.bold('\n[CONFIDENCE]'));
  console.log(`  ${levelLabel(confidence.level)} (${confidence.total})`);
  
  let diff = '';
  if (currentPatch?.type === 'create') {
    diff = generateFullFileDiff(currentFile, currentCode);
  } else {
    diff = generateDiffForPatch({ file: currentFile, patch: currentPatch });
  }
  
  console.log(chalk.bold('\n[DIFF]'));
  console.log(diff || chalk.yellow('  (no diff)'));
  
  const patchResult = { file: currentFile, patch: currentPatch, summary: genResult.summary };
  
  const action = await showPatchUI(patchResult, diff);
  
  if (action === 'apply') {
    try {
      const result = applyPatch(patchResult);
      session.lastResult = patchResult;
      session.workingFiles.add(currentFile);
      console.log(chalk.green('\n✅ Patch applied'));
      addToHistory(session, { action: 'apply', input, file: currentFile });
    } catch (err) {
      console.log(chalk.red(`\n❌ Apply failed: ${err.message}`));
      addToHistory(session, { action: 'failed', input, error: err.message });
    }
  } else if (action === 'regenerate') {
    console.log(chalk.bold('\n[REGENERATE] Triggered - add regeneration logic'));
  } else {
    console.log(chalk.dim('\n⏭️  Skipped'));
    addToHistory(session, { action: 'skip', input });
  }
}