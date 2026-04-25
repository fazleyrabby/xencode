import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_PATH = join(__dirname, '..', 'xencode.db');

let db = null;

export function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.exec(`
      CREATE TABLE IF NOT EXISTS code_chunks (
        id TEXT PRIMARY KEY,
        file TEXT,
        type TEXT,
        name TEXT,
        code TEXT,
        embedding BLOB
      )
    `);
  }
  return db;
}

export function insertChunks(chunks) {
  const database = getDb();
  const stmt = database.prepare(`
    INSERT OR REPLACE INTO code_chunks (id, file, type, name, code, embedding)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertMany = database.transaction((chunks) => {
    for (const chunk of chunks) {
      const embeddingBuffer = chunk.embedding
        ? Buffer.from(new Float32Array(chunk.embedding).buffer)
        : null;
      stmt.run(chunk.id, chunk.file, chunk.type, chunk.name, chunk.code, embeddingBuffer);
    }
  });

  insertMany(chunks);
}

export function getAllChunks() {
  const database = getDb();
  const chunks = database.prepare('SELECT * FROM code_chunks').all();
  
  return chunks.map(chunk => ({
    ...chunk,
    embedding: chunk.embedding
      ? new Float32Array(chunk.embedding.buffer, chunk.embedding.byteOffset, chunk.embedding.length / 4)
      : null
  }));
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
