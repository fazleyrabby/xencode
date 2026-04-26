import { plan } from './planner.js';
import { generatePatch } from './coder.js';
import { review } from './reviewer.js';
import { applyPatch } from './tool.js';
import { generateDiffForPatch, generateFullFileDiff } from './diff.js';
import { search } from '../search.js';
import { formatAgentContext } from '../context.js';
import { readFileSync, existsSync } from 'fs';
import { Spinner } from '../ui.js';
import chalk from 'chalk';

const RETRIEVAL_TOP_K = 25;

export async function runAgent(query, options = {}) {
  const { enableReview = false, basePath = process.cwd() } = options;

  console.log(chalk.bold('\n[PLAN]'));
  const planSpinner = new Spinner('Planning... ');
  planSpinner.start();
  const planResult = await plan(query);
  planSpinner.succeed(`Intent: ${planResult.intent}, Target: ${planResult.target}`);
  console.log(chalk.dim(`  Search queries: ${planResult.search_queries.join(', ')}`));

  console.log(chalk.bold('\n[CONTEXT]'));
  const searchSpinner = new Spinner('Retrieving context... ');
  searchSpinner.start();

  let allResults = [];
  for (const searchQuery of planResult.search_queries) {
    const results = await search(searchQuery, RETRIEVAL_TOP_K);
    allResults.push(...results);
  }

  const seen = new Set();
  const uniqueResults = allResults.filter(r => {
    const key = `${r.file}:${r.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  uniqueResults.sort((a, b) => b.score - a.score);
  const topResults = uniqueResults.slice(0, RETRIEVAL_TOP_K);
  searchSpinner.succeed(`Retrieved ${topResults.length} relevant chunks`);

  const context = formatAgentContext(topResults);

  let existingFileContent = null;
  if (planResult.target) {
    const potentialPaths = [
      planResult.target,
      `${basePath}/${planResult.target}`,
      ...topResults
        .filter(r => r.file.toLowerCase().includes(planResult.target.toLowerCase()))
        .slice(0, 3)
        .map(r => r.file)
    ];

    for (const path of potentialPaths) {
      if (existsSync(path)) {
        existingFileContent = readFileSync(path, 'utf-8');
        break;
      }
    }
  }

  console.log(chalk.bold('\n[CODE]'));
  const codeSpinner = new Spinner('Generating patch... ');
  codeSpinner.start();
  const patchResult = await generatePatch(query, planResult, context, existingFileContent);
  codeSpinner.succeed(`Patch generated for ${patchResult.file} (${patchResult.patch.type})`);

  console.log(chalk.bold('\n[DIFF]'));
  let diffOutput;
  if (patchResult.patch.type === 'create') {
    diffOutput = generateFullFileDiff(patchResult.file, patchResult.patch.content);
  } else {
    diffOutput = generateDiffForPatch(patchResult);
  }
  console.log(diffOutput || chalk.yellow('  (no diff available)'));

  let finalPatch = patchResult;

  if (enableReview) {
    console.log(chalk.bold('\n[REVIEW]'));
    const reviewSpinner = new Spinner('Reviewing patch... ');
    reviewSpinner.start();
    const reviewResult = await review(query, patchResult, existingFileContent);
    if (reviewResult.valid) {
      reviewSpinner.succeed('Patch validated');
      finalPatch = reviewResult.patch;
    } else {
      reviewSpinner.warn(`Review issues: ${reviewResult.issues.join('; ')}`);
      finalPatch = reviewResult.patch;
    }
  }

  return {
    plan: planResult,
    context,
    patch: finalPatch,
    diff: diffOutput,
    existingFileContent
  };
}

export async function applyAgentPatch(patchResult) {
  const result = applyPatch(patchResult);
  return result;
}
