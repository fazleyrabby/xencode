import { indexDirectory } from './indexer.js';
import { embedBatchForDb, embedText } from './embedder.js';
import { insertChunks, updateIndexTimestamp, getLastIndexedAt, closeDb } from './db.js';
import { search } from './search.js';
import { formatContext } from './context.js';
import { queryLLM } from './llm.js';
import { Spinner, formatDuration } from './ui.js';

const STALE_THRESHOLD_MS = 30 * 60 * 1000;

const BANNER = `
╔═══════════════════════════════════════╗
║         Xencode CLI v0.2.0            ║
║    Local-first Code RAG Assistant     ║
╚═══════════════════════════════════════╝
`;

function printUsage() {
  console.log(`${BANNER}
Usage:
  node src/app.js index <path>    Index a codebase
  node src/app.js ask <query>     Ask a question about indexed code

Examples:
  node src/app.js index ./my-project
  node src/app.js ask "Fix validation bug"
  node src/app.js ask "How does billing work?"
`);
}

async function cmdIndex(targetPath) {
  console.log(`${BANNER}`);
  
  const scanSpinner = new Spinner('Scanning files... ');
  scanSpinner.start();
  
  const scanStart = Date.now();
  const chunks = await indexDirectory(targetPath);
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
      insertChunks(chunksWithEmbeddings);
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
  
  updateIndexTimestamp();
  
  console.log();
  console.log(`✅ Indexed ${chunks.length} chunks successfully`);
}

async function cmdAsk(query) {
  console.log(`${BANNER}`);
  
  const lastIndexed = getLastIndexedAt();
  const now = Date.now();
  
  if (!lastIndexed) {
    console.log('⚠️  No index found. Run: node src/app.js index <path>\n');
  } else if (now - lastIndexed > STALE_THRESHOLD_MS) {
    const mins = Math.round((now - lastIndexed) / 60000);
    console.log(`⚠️  Index may be outdated (${mins}m ago). Run: node src/app.js index\n`);
  }
  
  const searchSpinner = new Spinner('Embedding query... ');
  searchSpinner.start();
  
  const searchStart = Date.now();
  const results = await search(query, 5);
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

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  if (!command) {
    printUsage();
    process.exit(1);
  }
  
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
      case 'ask': {
        const query = args.slice(1).join(' ');
        if (!query) {
          console.error('❌ Error: Please provide a query');
          process.exit(1);
        }
        await cmdAsk(query);
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