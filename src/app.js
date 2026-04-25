import { indexDirectory } from './indexer.js';
import { embedBatchForDb, embedText } from './embedder.js';
import { insertChunks, closeDb } from './db.js';
import { search } from './search.js';
import { formatContext } from './context.js';
import { queryLLM } from './llm.js';

function printUsage() {
  console.log(`
Xencode - Local-first code-aware RAG assistant

Usage:
  node src/app.js index <path>    Index a codebase
  node src/app.js ask <query>     Ask a question about indexed code

Examples:
  node src/app.js index ./my-project
  node src/app.js ask "Fix validation bug"
`);
}

async function cmdIndex(targetPath) {
  console.log(`Indexing: ${targetPath}`);
  console.log('Scanning files...');

  const chunks = await indexDirectory(targetPath);
  console.log(`Found ${chunks.length} chunks`);
  console.log('Generating embeddings (streaming to DB)...');

  let chunkIndex = 0;

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
    }
  );

  console.log(`Indexed ${chunks.length} chunks successfully`);
}

async function cmdAsk(query) {
  console.log(`Searching for: "${query}"`);

  const results = await search(query, 5);

  if (results.length === 0) {
    console.log('No relevant code found. Please index a codebase first.');
    return;
  }

  console.log(`Found ${results.length} relevant chunks`);

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

  console.log('Querying LLM...');

  try {
    const response = await queryLLM(prompt);

    try {
      const json = JSON.parse(response);
      console.log(JSON.stringify(json, null, 2));
    } catch {
      console.log(response);
    }
  } catch (error) {
    console.error('LLM error:', error.message);
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
          console.error('Error: Please provide a path to index');
          process.exit(1);
        }
        await cmdIndex(path);
        break;
      }
      case 'ask': {
        const query = args.slice(1).join(' ');
        if (!query) {
          console.error('Error: Please provide a query');
          process.exit(1);
        }
        await cmdAsk(query);
        break;
      }
      default:
        console.error(`Unknown command: ${command}`);
        printUsage();
        process.exit(1);
    }
  } finally {
    closeDb();
  }
}

main();