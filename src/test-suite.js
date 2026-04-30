import chalk from 'chalk';
import { createSession } from './core/session.js';
import { classify } from './core/mode.js';
import { buildContext, updateSessionContext, addToHistory } from './core/context.js';
import { planner } from './core/planner.js';
import { retrieve } from './core/retriever.js';
import { generate } from './core/generator.js';
import { critic } from './core/critic.js';
import { regenerate } from './core/regenerator.js';
import { validate } from './core/validator.js';
import { score, planCompleteness } from './core/scorer.js';
import { resolveProjectDb } from './workspace.js';

const BANNER = `
╔═══════════════════════════════════════╗
║       Xencode v0.6 Test Suite        ║
║    Testing on litepos-tester         ║
╚═══════════════════════════════════════╝
`;

let testsPassed = 0;
let testsFailed = 0;

async function runTest(name, fn) {
  console.log(chalk.bold(`\n📋 Test: ${name}`));
  console.log(chalk.dim('─'.repeat(40)));
  try {
    await fn();
    console.log(chalk.green('  ✅ PASS'));
    testsPassed++;
  } catch (err) {
    console.log(chalk.red(`  ❌ FAIL: ${err.message}`));
    if (process.env.DEBUG) console.log(chalk.dim(err.stack));
    testsFailed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  console.log(chalk.bold(BANNER));

  const resolved = resolveProjectDb();
  if (!resolved) {
    console.log(chalk.red('❌ No project found. Run: node src/app.js index <path>'));
    process.exit(1);
  }

  const { dbPath, meta } = resolved;
  console.log(chalk.cyan(`\n📁 Project: ${meta.name}`));
  console.log(chalk.dim(`   Path: ${meta.path}\n`));

  const session = createSession();
  session.debug = !!process.env.DEBUG;

  await runTest('1.1 Mode Classification - RETRIEVE', async () => {
    const mode = classify('show me Product model');
    assert(mode === 'RETRIEVE', `Expected RETRIEVE, got ${mode}`);
  });

  await runTest('1.2 Mode Classification - EXPLAIN', async () => {
    const mode = classify('explain checkout flow');
    assert(mode === 'EXPLAIN', `Expected EXPLAIN, got ${mode}`);
  });

  await runTest('1.3 Mode Classification - MODIFY', async () => {
    const mode = classify('add refund method to PaymentService');
    assert(mode === 'MODIFY', `Expected MODIFY, got ${mode}`);
  });

  await runTest('2.1 Session Creation', async () => {
    const s = createSession();
    assert(s.id, 'Session should have ID');
    assert(s.history, 'Session should have history array');
    assert(s.workingFiles instanceof Set, 'Session should have workingFiles Set');
  });

  await runTest('2.2 Session Stats', async () => {
    const { getStats } = await import('./core/session.js');
    const stats = getStats(session);
    assert(stats.sessionId, 'Stats should have sessionId');
    assert(typeof stats.steps === 'number', 'Stats should have steps');
  });

  await runTest('3.1 Retrieval - Find PaymentService', async () => {
    const result = await retrieve('PaymentService', { search_queries: ['PaymentService'], target_files: [] }, dbPath);
    assert(result.chunks.length > 0, 'Should find PaymentService chunks');
    if (process.env.DEBUG) console.log(chalk.dim(`  Found ${result.chunks.length} chunks`));
  });

  await runTest('3.2 Context Building', async () => {
    const result = await retrieve('PaymentService', { search_queries: ['PaymentService'], target_files: [] }, dbPath);
    const ctx = buildContext(session, result.chunks);
    assert(ctx.length > 0, 'Context should not be empty');
    assert(ctx.length <= 16000, 'Context should be within token limit'); // 4000 tokens * 4
  });

  await runTest('3.3 Context Persistence', async () => {
    const result = await retrieve('PaymentService', { search_queries: ['PaymentService'], target_files: [] }, dbPath);
    const ctx = buildContext(session, result.chunks);
    updateSessionContext(session, ctx);
    assert(session.lastContext === ctx, 'Session context should be updated');
  });

  await runTest('4.1 Planning', async () => {
    const plan = await planner('add refund method to PaymentService');
    assert(plan.intent, 'Plan should have intent');
    assert(plan.target_files || plan.search_queries, 'Plan should have targets or queries');
    if (process.env.DEBUG) console.log(chalk.dim(`  Plan: ${JSON.stringify(plan)}`));
  });

  await runTest('5.1 Full Pipeline (dry run - no apply)', async () => {
    const plan = await planner('add refund method to PaymentService');
    session.lastPlan = plan;
    const planScore = planCompleteness(plan);

    const retrievalResult = await retrieve('PaymentService', plan, dbPath);
    const context = buildContext(session, retrievalResult.chunks);

    const genResult = await generate('add refund method', plan, context);
    assert(genResult.file, 'Generated result should have file');

    const critiqueResult = await critic(genResult.patch?.content || '', 'add refund method', plan);

    const validationResult = await validate(genResult.patch?.content || '', genResult.file);

    const confidence = score(retrievalResult.retrievalScore, planScore, validationResult.valid, critiqueResult.critiqueClean);

    if (process.env.DEBUG) {
      console.log(chalk.dim(`  Confidence: ${confidence.total}`));
      console.log(chalk.dim(`  Level: ${confidence.level}`));
    }

    assert(confidence.total >= 0, 'Confidence should be calculated');
  });

  await runTest('6.1 Validation - PHP Syntax Check', async () => {
    const validCode = '<?php\nnamespace App\\Services;\nclass PaymentService {\n    public function refund() { return true; }\n}\n';
    const result = await validate(validCode, 'test.php');
    assert(result.valid, 'Valid PHP should pass validation');
  });

  await runTest('6.2 Validation - Detect Issues', async () => {
    const invalidCode = '<?php\nnamespace App\\Services;\nclass PaymentService {\n    public function refund() { return true; \n}\n'; // missing closing brace
    const result = await validate(invalidCode, 'test.php');
    assert(!result.valid, 'Invalid PHP should fail validation');
    if (process.env.DEBUG) console.log(chalk.dim(`  Errors: ${result.errors.join(', ')}`));
  });

  await runTest('7.1 Working Files Tracking', async () => {
    session.workingFiles.add('/path/to/PaymentService.php');
    assert(session.workingFiles.has('/path/to/PaymentService.php'), 'Should track working files');
  });

  await runTest('7.2 History Recording', async () => {
    addToHistory(session, { action: 'test', input: 'test input' });
    assert(session.history.length > 0, 'History should be recorded');
  });

  console.log(chalk.bold('\n' + '═'.repeat(40)));
  console.log(chalk.bold(`\n📊 Results: ${chalk.green(testsPassed)} passed, ${chalk.red(testsFailed)} failed\n`));

  if (testsFailed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error(chalk.red(`\n❌ Test suite error: ${err.message}`));
  process.exit(1);
});