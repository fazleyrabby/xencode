import { planner } from './planner.js';
import { retrieve } from './retriever.js';
import { generate } from './generator.js';
import { critic } from './critic.js';
import { regenerate } from './regenerator.js';
import { validate } from './validator.js';
import { score, levelLabel, planCompleteness } from './scorer.js';
import { applyPatch } from '../agent/tool.js';
import { generateDiffForPatch, generateFullFileDiff } from '../agent/diff.js';
import { existsSync, readFileSync } from 'fs';
import chalk from 'chalk';
import { Spinner } from '../ui.js';

export async function runQualityLoop(query, options = {}) {
  const { basePath = process.cwd(), dbPath, enableCritique = true } = options;
  
  let stepStatus = {};
  
  console.log(chalk.bold('\n[PLAN]'));
  const planSpinner = new Spinner('Analyzing request... ');
  planSpinner.start();
  
  const planResult = await planner(query);
  const planComplete = planCompleteness(planResult);
  
  planSpinner.succeed('Structured plan generated');
  stepStatus.plan = '✅';
  
  console.log(chalk.dim(`  Intent: ${planResult.intent}`));
  console.log(chalk.dim(`  Targets: ${(planResult.files || planResult.target_files || []).join(', ') || 'auto-detect'}`));
  console.log(chalk.dim(`  Queries: ${(planResult.search_queries || []).join(', ')}`));

  if (planResult.risks?.length > 0) {
    console.log(chalk.yellow(`  Risks: ${planResult.risks.join('; ')}`));
  }
  
  console.log(chalk.bold('\n[RETRIEVAL]'));
  const retrieveSpinner = new Spinner('Retrieving context... ');
  retrieveSpinner.start();
  
  const retrievalResult = await retrieve(query, planResult, dbPath);
  
  retrieveSpinner.succeed(`${retrievalResult.chunks.length} chunks selected`);
  stepStatus.retrieval = '✅';
  
  console.log(chalk.dim(`  Context tokens: ~${Math.ceil(retrievalResult.context.length / 4)}`));
  
  console.log(chalk.bold('\n[GENERATION]'));
  const genSpinner = new Spinner('Generating code... ');
  genSpinner.start();
  
  const genResult = await generate(query, planResult, retrievalResult.context);
  
  genSpinner.succeed(`Code generated for ${genResult.file}`);
  stepStatus.generation = '✅';
  
  let currentCode = genResult.patch?.content || '';
  let currentFile = genResult.file;
  let currentPatch = genResult.patch;
  
  let critiqueResult = { issues: [], critiqueClean: true };
  stepStatus.critique = '➖';
  stepStatus.regeneration = '➖';
  
  if (enableCritique) {
    console.log(chalk.bold('\n[CRITIQUE]'));
    const critiqueSpinner = new Spinner('Reviewing code... ');
    critiqueSpinner.start();
    
    critiqueResult = await critic(currentCode, query, planResult);
    
    if (critiqueResult.critiqueClean) {
      critiqueSpinner.succeed('No issues found');
      stepStatus.critique = '✅';
    } else {
      critiqueSpinner.warn(`${critiqueResult.issues.length} issues found`);
      stepStatus.critique = '⚠️';
      console.log(chalk.yellow('  ' + critiqueResult.issues.join('\n  ')));
      
      console.log(chalk.bold('\n[REGENERATION]'));
      const regenSpinner = new Spinner('Regenerating with fixes... ');
      regenSpinner.start();
      
      const regenResult = await regenerate(currentCode, critiqueResult.issues, query);
      
      currentFile = regenResult.file;
      currentPatch = regenResult.patch;
      currentCode = regenResult.patch?.content || '';
      
      regenSpinner.succeed('Improved code generated');
      stepStatus.regeneration = '✅';
    }
  }
  
  console.log(chalk.bold('\n[VALIDATION]'));
  const validateSpinner = new Spinner('Validating syntax... ');
  validateSpinner.start();
  
  const validationResult = await validate(currentCode, currentFile);
  
  if (validationResult.valid) {
    validateSpinner.succeed('Syntax check passed');
    stepStatus.validation = '✅';
  } else {
    validateSpinner.fail('Validation failed');
    stepStatus.validation = '❌';
    console.log(chalk.red('  Errors: ' + validationResult.errors.join('; ')));
  }
  
  if (validationResult.warnings.length > 0) {
    console.log(chalk.yellow('  Warnings: ' + validationResult.warnings.join('; ')));
  }
  
  const confidence = score(
    retrievalResult.retrievalScore,
    planComplete,
    validationResult.valid,
    critiqueResult.critiqueClean
  );
  
  console.log(chalk.bold('\n[CONFIDENCE]'));
  const confidenceLabel = levelLabel(confidence.level);
  if (confidence.level === 'HIGH') {
    console.log(chalk.green(`  ${confidenceLabel}`));
  } else if (confidence.level === 'MEDIUM') {
    console.log(chalk.yellow(`  ${confidenceLabel} (score: ${confidence.total})`));
  } else {
    console.log(chalk.red(`  ${confidenceLabel} (score: ${confidence.total})`));
  }
  
  stepStatus.confidence = confidenceLabel.split(' ')[0];
  
  console.log(chalk.bold('\n[DIFF]'));
  let diffOutput;
  if (currentPatch?.type === 'create') {
    diffOutput = generateFullFileDiff(currentFile, currentCode);
  } else {
    diffOutput = generateDiffForPatch({ file: currentFile, patch: currentPatch });
  }
  console.log(diffOutput || chalk.yellow('  (no diff available)'));
  
  return {
    plan: planResult,
    retrieval: retrievalResult,
    generated: { file: currentFile, patch: currentPatch, code: currentCode },
    critique: critiqueResult,
    validation: validationResult,
    confidence,
    diff: diffOutput,
    stepStatus
  };
}

export async function applyResult(result) {
  return applyPatch(result.generated);
}