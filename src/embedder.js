import { pipeline, env } from '@xenova/transformers';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LOCAL_MODEL_PATH = join(__dirname, '../models/bge-m3/');

env.allowLocalModels = true;
env.allowRemoteModels = false;
env.localModelPath = dirname(LOCAL_MODEL_PATH);

const BATCH_SIZE = 64;
const THROTTLE_BATCH_INTERVAL = 100;
const THROTTLE_DELAY_MS = 10;
const RETRY_ATTEMPTS = 2;

let embedder = null;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
    const modelName = 'bge-m3';
    embedder = await pipeline('feature-extraction', modelName, {
      quantized: true
    });
  }
  return embedder;
}

export async function embedBatchForDb(texts, onBatch) {
  const model = await getEmbedder();
  const batches = chunkArray(texts, BATCH_SIZE);
  const total = texts.length;

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    const processed = Math.min((b + 1) * BATCH_SIZE, total);
    const percent = Math.round((processed / total) * 100);

    process.stdout.write(`\rEmbedding: ${processed} / ${total} (${percent}%)`);

    let batchEmbeddings = null;
    let success = false;

    for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
      try {
        const output = await model(batch, { pooling: 'mean', normalize: false });
        batchEmbeddings = output.tolist();
        success = true;
        break;
      } catch (err) {
        if (attempt === RETRY_ATTEMPTS - 1) {
          console.error(`\nBatch ${b + 1} failed after ${RETRY_ATTEMPTS} attempts: ${err.message}`);
          batchEmbeddings = new Array(batch.length).fill(null);
        }
      }
    }

    const normalizedEmbeddings = batchEmbeddings.map(emb => {
      if (emb === null) return null;
      return normalizeEmbedding(new Float32Array(emb));
    });

    onBatch(normalizedEmbeddings, b);

    if ((b + 1) % THROTTLE_BATCH_INTERVAL === 0) {
      await sleep(THROTTLE_DELAY_MS);
    }
  }

  console.log();
}

export async function embedBatch(texts, batchSize = 32) {
  const model = await getEmbedder();
  const batches = chunkArray(texts, batchSize);
  const embeddings = [];

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    const processed = Math.min((b + 1) * batchSize, texts.length);
    process.stdout.write(`\rEmbedding: ${processed} / ${texts.length}`);

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

    if ((b + 1) % THROTTLE_BATCH_INTERVAL === 0) {
      await sleep(THROTTLE_DELAY_MS);
    }
  }

  console.log();
  return embeddings;
}

export async function embedText(text) {
  const [embedding] = await embedBatch([text], 1);
  return embedding;
}