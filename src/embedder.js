import { pipeline, env } from '@xenova/transformers';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

env.allowLocalModels = true;
env.allowRemoteModels = false;
env.localModelPath = join(PROJECT_ROOT, 'models');
env.useBrowserCache = false;

const MAX_INPUT_LENGTH = 256;
const RETRY_ATTEMPTS = 2;
const BATCH_SIZE = 64;

let embedder = null;

function truncateText(text) {
  if (text.length <= MAX_INPUT_LENGTH) return text;
  return text.substring(0, MAX_INPUT_LENGTH);
}

function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

function normalizeEmbedding(embedding) {
  const normalized = new Float32Array(embedding.length);
  let norm = 0;

  for (let i = 0; i < embedding.length; i++) {
    norm += embedding[i] * embedding[i];
  }
  norm = Math.sqrt(norm);

  if (norm > 0) {
    for (let i = 0; i < embedding.length; i++) {
      normalized[i] = embedding[i] / norm;
    }
  }

  return normalized;
}

export async function getEmbedder() {
  if (!embedder) {
    embedder = await pipeline('feature-extraction', 'bge-m3', {
      quantized: true
    });
  }
  return embedder;
}

export async function embedBatchForDb(texts, onBatch) {
  const model = await getEmbedder();
  const truncated = texts.map(truncateText);
  const batchSize = BATCH_SIZE;
  const batches = chunkArray(truncated, batchSize);
  const total = texts.length;
  const startTime = Date.now();

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    let batchEmbeddings = null;

    for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
      try {
        const output = await model(batch, { pooling: 'mean', normalize: false });
        batchEmbeddings = output.tolist();
        break;
      } catch (err) {
        if (attempt === RETRY_ATTEMPTS - 1) {
          console.error(`\nBatch ${b + 1} failed: ${err.message}`);
          batchEmbeddings = new Array(batch.length).fill(null);
        }
      }
    }

    const normalizedEmbeddings = batchEmbeddings.map(emb => {
      if (emb === null) return null;
      return normalizeEmbedding(new Float32Array(emb));
    });

    onBatch(normalizedEmbeddings, b);
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✓ Done: ${total} embeddings in ${totalTime}s (${Math.round(total / parseFloat(totalTime))} chunks/sec)`);
}

export async function embedBatch(texts, batchSize = 32) {
  const model = await getEmbedder();
  const truncated = texts.map(truncateText);
  const batches = chunkArray(truncated, batchSize);
  const embeddings = [];
  const startTime = Date.now();
  const total = texts.length;

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    let output;
    try {
      output = await model(batch, { pooling: 'mean', normalize: false });
    } catch (err) {
      console.error(`\nBatch ${b + 1} failed: ${err.message}`);
      output = { tolist: () => new Array(batch.length).fill(new Array(1024).fill(0)) };
    }

    const batchEmbeddings = output.tolist();
    for (const emb of batchEmbeddings) {
      embeddings.push(normalizeEmbedding(new Float32Array(emb)));
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✓ Done: ${total} embeddings in ${totalTime}s (${Math.round(total / parseFloat(totalTime))} chunks/sec)`);

  return embeddings;
}

export async function embedText(text) {
  const [embedding] = await embedBatch([text], 1);
  return embedding;
}