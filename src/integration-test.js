import chalk from 'chalk';
import { resolveProjectDb } from './workspace.js';
import { callModel } from './llm.js';

const BANNER = `
╔═══════════════════════════════════════╗
║    Xencode v0.6 Integration Tests     ║
║    Testing with Qwen3.5-9B (MLX)      ║
╚═══════════════════════════════════════╝
`;

async function testLLMConnection() {
  console.log(chalk.bold('\n📡 Testing LLM Connection...'));
  try {
    const response = await callModel({
      role: 'default',
      prompt: 'Reply with exactly: OK',
      systemPrompt: 'You are a helpful assistant.'
    });
    if (response.includes('OK')) {
      console.log(chalk.green('  ✅ LLM responding correctly'));
      return true;
    } else {
      console.log(chalk.yellow('  ⚠️  LLM gave unexpected response'));
      return false;
    }
  } catch (err) {
    console.log(chalk.red(`  ❌ LLM error: ${err.message}`));
    return false;
  }
}

async function testPlannerWithLLM() {
  console.log(chalk.bold('\n📋 Testing Planner with LLM...'));
  const { planner } = await import('./core/planner.js');
  try {
    const plan = await planner('add refund method to PaymentService');
    console.log(chalk.cyan(`  Intent: ${plan.intent}`));
    console.log(chalk.cyan(`  Targets: ${plan.target_files?.join(', ') || 'none'}`));
    console.log(chalk.green('  ✅ Planner working'));
    return true;
  } catch (err) {
    console.log(chalk.red(`  ❌ Planner error: ${err.message}`));
    return false;
  }
}

async function testGeneratorWithLLM() {
  console.log(chalk.bold('\n💻 Testing Generator with LLM...'));
  const { generate } = await import('./core/generator.js');
  try {
    const result = await generate('create a simple hello world function', {
      intent: 'create',
      target_files: ['test.php'],
      search_queries: []
    }, '<?php\n// context here');
    console.log(chalk.cyan(`  File: ${result.file}`));
    console.log(chalk.cyan(`  Type: ${result.patch?.type}`));
    console.log(chalk.green('  ✅ Generator working'));
    return true;
  } catch (err) {
    console.log(chalk.red(`  ❌ Generator error: ${err.message}`));
    return false;
  }
}

async function testCriticWithLLM() {
  console.log(chalk.bold('\n🔍 Testing Critic with LLM...'));
  const { critic } = await import('./core/critic.js');
  try {
    const result = await critic(
      '<?php\nfunction test() { echo "hello"; }\n',
      'create a hello function',
      { intent: 'create', target_files: [], search_queries: [] }
    );
    console.log(chalk.cyan(`  Issues: ${result.issues?.length || 0}`));
    console.log(chalk.cyan(`  Clean: ${result.critiqueClean}`));
    console.log(chalk.green('  ✅ Critic working'));
    return true;
  } catch (err) {
    console.log(chalk.red(`  ❌ Critic error: ${err.message}`));
    return false;
  }
}

async function testEndToEnd() {
  console.log(chalk.bold('\n🔄 Testing End-to-End Flow...'));
  const { planner } = await import('./core/planner.js');
  const { retrieve } = await import('./core/retriever.js');
  const { generate } = await import('./core/generator.js');
  const { critic } = await import('./core/critic.js');

  const resolved = resolveProjectDb();
  if (!resolved) {
    console.log(chalk.yellow('  ⚠️  Skipping E2E - no project'));
    return false;
  }

  const { dbPath } = resolved;

  try {
    const plan = await planner('add logging to the user controller');
    const retrieval = await retrieve('UserController', plan, dbPath);
    const gen = await generate('add logging', plan, retrieval.context);
    const crit = await critic(gen.patch?.content || '', 'add logging', plan);

    console.log(chalk.green('  ✅ E2E flow completed'));
    return true;
  } catch (err) {
    console.log(chalk.red(`  ❌ E2E error: ${err.message}`));
    return false;
  }
}

async function main() {
  console.log(chalk.bold(BANNER));

  const results = [];
  results.push(await testLLMConnection());
  results.push(await testPlannerWithLLM());
  results.push(await testGeneratorWithLLM());
  results.push(await testCriticWithLLM());
  results.push(await testEndToEnd());

  console.log(chalk.bold('\n' + '═'.repeat(40)));
  const passed = results.filter(Boolean).length;
  console.log(chalk.bold(`\n📊 Integration: ${chalk.green(passed)}/${results.length} passed\n`));

  if (passed < results.length / 2) {
    console.log(chalk.yellow('⚠️  Multiple failures - check LLM server and project indexing'));
  }
}

main().catch(console.error);