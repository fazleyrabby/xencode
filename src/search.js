import { getAllChunks } from './db.js';
import { embedText } from './embedder.js';

function cosineSimilarity(a, b) {
  let dot = 0;
  
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  
  return dot;
}

export async function search(query, topK = 5, dbPath) {
  const queryEmbedding = await embedText(query);
  const chunks = getAllChunks(dbPath);
  
  const scored = chunks
    .filter(chunk => chunk.embedding)
    .map(chunk => ({
      ...chunk,
      score: cosineSimilarity(queryEmbedding, chunk.embedding)
    }));
  
  scored.sort((a, b) => b.score - a.score);
  
  return scored.slice(0, topK);
}
