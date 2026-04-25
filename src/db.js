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
        code_full TEXT,
        embedding BLOB
      )
    `);
    db.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `);
  }
  return db;
}

export function insertChunks(chunks) {
  const database = getDb();
  const stmt = database.prepare(`
    INSERT OR REPLACE INTO code_chunks (id, file, type, name, code, code_full, embedding)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = database.transaction((chunks) => {
    for (const chunk of chunks) {
      const embeddingBuffer = chunk.embedding
        ? Buffer.from(new Float32Array(chunk.embedding).buffer)
        : null;
      stmt.run(
        chunk.id,
        chunk.file,
        chunk.type,
        chunk.name,
        chunk.code,
        chunk.code_full || chunk.code,
        embeddingBuffer
      );
    }
  });

  insertMany(chunks);
}

export function updateIndexTimestamp() {
  const database = getDb();
  database.prepare(`
    INSERT OR REPLACE INTO meta (key, value)
    VALUES ('last_indexed_at', ?)
  `).run(Date.now().toString());
}

export function getLastIndexedAt() {
  const database = getDb();
  const result = database.prepare(`
    SELECT value FROM meta WHERE key = 'last_indexed_at'
  `).get();
  return result ? parseInt(result.value, 10) : null;
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