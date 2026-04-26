import { indexDirectory } from './indexer.js';
import { embedBatchForDb, embedText } from './embedder.js';
import { insertChunks, updateIndexTimestamp, getLastIndexedAt, closeDb } from './db.js';
import { search } from './search.js';
import { formatContext } from './context.js';
import { queryLLM } from './llm.js';
import { Spinner, formatDuration } from './ui.js';
import { runAgent, applyAgentPatch } from './agent/agent.js';
import { askApprovalInline } from './agent/approval.js';
import {
  registerProject,
  setCurrentProject,
  getCurrentProject,
  autoDetectProject,
  listProjects,
  updateProjectMeta,
  getProjectDbPath,
  resolveProjectDb
} from './workspace.js';
import chalk from 'chalk';

const STALE_THRESHOLD_MS = 30 * 60 * 1000;

const BANNER = `
╔═══════════════════════════════════════╗
║         Xencode CLI v0.5.0            ║
║    Local-first Code RAG Assistant     ║
╚═══════════════════════════════════════╝
`;

function printUsage() {
  console.log(`${BANNER}
Usage:
  node src/app.js index <path>          Index a codebase
  node src/app.js ask <query>           Ask a question about indexed code
  node src/app.js agent <query>         Generate and apply code patches
  node src/app.js projects              List indexed projects
  node src/app.js use <project>         Switch to a project

Examples:
  node src/app.js index ./my-project
  node src/app.js ask "How does billing work?"
  node src/app.js agent "Add refund method to PaymentService"
  node src/app.js agent "Create Laravel refund service" --review
  node src/app.js projects
  node src/app.js use my-project
`);
}

async function cmdIndex(targetPath) {
  console.log(`${BANNER}`);

  const resolvedPath = targetPath.startsWith('/') ? targetPath : `${process.cwd()}/${targetPath}`;
  const projectId = registerProject(resolvedPath);
  const dbPath = getProjectDbPath(projectId);

  setCurrentProject(projectId);

  const project = getCurrentProject();
  console.log(chalk.cyan(`\n📁 Project: ${project.name}`));
  console.log(chalk.dim(`   Path: ${project.path}`));
  console.log(chalk.dim(`   ID: ${projectId}\n`));

  const scanSpinner = new Spinner('Scanning files... ');
  scanSpinner.start();

  const scanStart = Date.now();
  const chunks = await indexDirectory(resolvedPath);
  const scanDuration = Date.now() - scanStart;

  scanSpinner.succeed(`Found ${chunks.length} chunks in ${formatDuration(scanDuration)}`);

  console.log();
  const embedSpinner = new Spinner('Generating embeddings... ');
  embedSpinner.start();

  const embedStart = Date.now();
  let chunkIndex = 0;
  let lastProgress = '';

  await embedBatchForDb(
    chunks.map(c => c.code),
    (embeddings) => {
      const batchChunks = chunks.slice(chunkIndex, chunkIndex + embeddings.length);
      const chunksWithEmbeddings = batchChunks.map((chunk, i) => ({
        ...chunk,
        embedding: embeddings[i]
      }));
      insertChunks(chunksWithEmbeddings, dbPath);
      chunkIndex += embeddings.length;

      const elapsed = Date.now() - embedStart;
      const rate = Math.round(chunkIndex / (elapsed / 1000));
      const remaining = chunks.length - chunkIndex;
      const eta = remaining / rate;
      const progress = `${chunkIndex}/${chunks.length} (${rate} chunks/s, ETA: ${Math.round(eta)}s)`;

      if (progress !== lastProgress) {
        embedSpinner.update(progress);
        lastProgress = progress;
      }
    }
  );

  const embedDuration = Date.now() - embedStart;
  embedSpinner.succeed(`${chunks.length} embeddings in ${formatDuration(embedDuration)}`);

  updateIndexTimestamp(dbPath);
  updateProjectMeta(projectId, {
    indexed_at: Date.now(),
    chunk_count: chunks.length
  });

  console.log();
  console.log(`✅ Indexed ${chunks.length} chunks for project "${project.name}"`);
}

function cmdProjects() {
  console.log(`${BANNER}`);

  const projects = listProjects();

  if (projects.length === 0) {
    console.log(chalk.yellow('No indexed projects found.'));
    console.log(chalk.dim('\nIndex a project first:'));
    console.log(chalk.dim('  node src/app.js index ./my-project\n'));
    return;
  }

  console.log(chalk.bold('\nIndexed projects:\n'));
  for (const project of projects) {
    const marker = project.isCurrent ? chalk.green.bold('● ') : chalk.dim('○ ');
    const name = project.isCurrent ? chalk.white.bold(project.name) : chalk.gray(project.name);
    const path = chalk.dim(project.path);
    const indexed = project.indexed_at
      ? chalk.dim(`(indexed ${formatTimestamp(project.indexed_at)}, ${project.chunk_count || '?'} chunks)`)
      : chalk.dim('(not indexed yet)');

    console.log(`  ${marker}${name} ${path}`);
    console.log(`   ${indexed}\n`);
  }
}

function formatTimestamp(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

async function cmdUse(projectId) {
  console.log(`${BANNER}`);

  try {
    setCurrentProject(projectId);
    const project = getCurrentProject();
    console.log(chalk.green(`\n✅ Switched to project: ${chalk.bold(project.name)}`));
    console.log(chalk.dim(`   Path: ${project.path}`));
    if (project.indexed_at) {
      console.log(chalk.dim(`   Indexed: ${formatTimestamp(project.indexed_at)} (${project.chunk_count} chunks)`));
    }
    console.log();
  } catch (err) {
    console.error(chalk.red(`\n❌ ${err.message}`));
    console.log(chalk.dim('\nAvailable projects:\n'));
    const projects = listProjects();
    for (const p of projects) {
      console.log(chalk.dim(`  ${p.id} — ${p.name}`));
    }
    console.log();
  }
}

function requireProject() {
  const resolved = resolveProjectDb();
  if (!resolved) {
    console.log(chalk.yellow('⚠️  No active project. Index or switch to a project first.\n'));
    console.log(chalk.dim('  node src/app.js index ./my-project'));
    console.log(chalk.dim('  node src/app.js projects'));
    console.log(chalk.dim('  node src/app.js use <project>\n'));
    process.exit(1);
  }
  return resolved;
}

async function cmdAsk(query) {
  console.log(`${BANNER}`);

  const { projectId, dbPath, meta } = requireProject();

  console.log(chalk.cyan(`\n📁 Project: ${meta.name}`));
  console.log(chalk.dim(`   ${meta.path}\n`));

  const lastIndexed = getLastIndexedAt(dbPath);
  const now = Date.now();

  if (!lastIndexed) {
    console.log('⚠️  No index found. Run: node src/app.js index <path>\n');
    return;
  } else if (now - lastIndexed > STALE_THRESHOLD_MS) {
    const mins = Math.round((now - lastIndexed) / 60000);
    console.log(`⚠️  Index may be outdated (${mins}m ago). Run: node src/app.js index\n`);
  }

  const searchSpinner = new Spinner('Embedding query... ');
  searchSpinner.start();

  const searchStart = Date.now();
  const results = await search(query, 5, dbPath);
  const searchDuration = Date.now() - searchStart;

  searchSpinner.succeed(`Found ${results.length} relevant chunks in ${searchDuration}ms`);

  if (results.length === 0) {
    console.log('\n⚠️  No relevant code found. Please index a codebase first.');
    return;
  }

  const context = formatContext(results);

  const prompt = `You are a coding assistant.

Use ONLY the provided code context.

If changes are required:
- explain clearly
- provide exact updated code

Context:
${context}

Task:
${query}`;

  console.log();
  const llmSpinner = new Spinner('Querying LLM... ');
  llmSpinner.start();

  try {
    const response = await queryLLM(prompt);
    llmSpinner.succeed('Response received');

    console.log();
    console.log('─'.repeat(50));
    console.log(response);
    console.log('─'.repeat(50));
  } catch (error) {
    llmSpinner.fail(`LLM error: ${error.message}`);
  }
}

async function cmdAgent(query, options = {}) {
  console.log(`${BANNER}`);

  const { projectId, dbPath, meta } = requireProject();

  console.log(chalk.cyan(`\n📁 Project: ${meta.name}`));
  console.log(chalk.dim(`   ${meta.path}\n`));

  const lastIndexed = getLastIndexedAt(dbPath);
  const now = Date.now();

  if (!lastIndexed) {
    console.log('⚠️  No index found. Run: node src/app.js index <path>\n');
    return;
  } else if (now - lastIndexed > STALE_THRESHOLD_MS) {
    const mins = Math.round((now - lastIndexed) / 60000);
    console.log(`⚠️  Index may be outdated (${mins}m ago). Consider reindexing.\n`);
  }

  const agentOptions = {
    ...options,
    dbPath,
    basePath: meta.path
  };

  try {
    const result = await runAgent(query, agentOptions);

    console.log(chalk.bold('\n[APPLY]'));
    console.log(chalk.yellow(`File: ${result.patch.file}`));
    console.log(chalk.yellow(`Action: ${result.patch.action} (${result.patch.patch.type})`));
    console.log(chalk.yellow(`Summary: ${result.patch.summary}`));

    const approval = await askApprovalInline(result.diff, result.patch.file);

    if (approval.action === 'apply') {
      const applySpinner = new Spinner('Applying patch... ');
      applySpinner.start();

      try {
        const applyResult = applyAgentPatch(result.patch);
        applySpinner.succeed(`Patch applied: ${applyResult.action} ${applyResult.file}`);
        console.log(chalk.green('\n✅ Changes applied successfully'));
      } catch (err) {
        applySpinner.fail(`Failed to apply patch: ${err.message}`);
        console.log(chalk.red('\n❌ Patch application failed'));
      }
    } else if (approval.action === 'skip') {
      console.log(chalk.dim('\n❌ Skipped'));
    } else if (approval.action === 'edit') {
      console.log(chalk.yellow('\n✏️  Edit/regenerate — coming soon'));
    } else if (approval.action === 'view') {
      console.log(chalk.yellow('\n📄 View full file — coming soon'));
    }
  } catch (error) {
    console.error(chalk.red(`\n❌ Agent error: ${error.message}`));
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    printUsage();
    process.exit(1);
  }

  const options = {
    enableReview: args.includes('--review'),
    basePath: process.cwd()
  };

  try {
    switch (command) {
      case 'index': {
        const path = args[1];
        if (!path) {
          console.error('❌ Error: Please provide a path to index');
          process.exit(1);
        }
        await cmdIndex(path);
        break;
      }
      case 'projects': {
        cmdProjects();
        break;
      }
      case 'use': {
        const projectId = args[1];
        if (!projectId) {
          console.error('❌ Error: Please provide a project ID or name');
          process.exit(1);
        }
        await cmdUse(projectId);
        break;
      }
      case 'ask': {
        const query = args.slice(1).filter(a => !a.startsWith('--')).join(' ');
        if (!query) {
          console.error('❌ Error: Please provide a query');
          process.exit(1);
        }
        await cmdAsk(query);
        break;
      }
      case 'agent': {
        const query = args.slice(1).filter(a => !a.startsWith('--')).join(' ');
        if (!query) {
          console.error('❌ Error: Please provide a query');
          process.exit(1);
        }
        await cmdAgent(query, options);
        break;
      }
      default:
        console.error(`❌ Unknown command: ${command}`);
        printUsage();
        process.exit(1);
    }
  } finally {
    closeDb();
  }
}

main();
