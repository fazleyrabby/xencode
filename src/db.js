import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS code_chunks (
    id TEXT PRIMARY KEY,
    file TEXT,
    type TEXT,
    name TEXT,
    code TEXT,
    code_full TEXT,
    embedding BLOB
  )
`;

const META_SCHEMA = `
  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT
  )
`;

const connections = new Map();

function initDb(database) {
  database.exec(SCHEMA);
  database.exec(META_SCHEMA);
  try {
    database.exec(`ALTER TABLE code_chunks ADD COLUMN code_full TEXT`);
  } catch {
    // Column already exists
  }
}

export function getDb(dbPath) {
  if (!connections.has(dbPath)) {
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const database = new Database(dbPath);
    initDb(database);
    connections.set(dbPath, database);
  }
  return connections.get(dbPath);
}

export function insertChunks(chunks, dbPath) {
  const database = getDb(dbPath);
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

export function updateIndexTimestamp(dbPath) {
  const database = getDb(dbPath);
  database.prepare(`
    INSERT OR REPLACE INTO meta (key, value)
    VALUES ('last_indexed_at', ?)
  `).run(Date.now().toString());
}

export function getLastIndexedAt(dbPath) {
  const database = getDb(dbPath);
  const result = database.prepare(`
    SELECT value FROM meta WHERE key = 'last_indexed_at'
  `).get();
  return result ? parseInt(result.value, 10) : null;
}

export function getChunkCount(dbPath) {
  const database = getDb(dbPath);
  const result = database.prepare(`SELECT COUNT(*) as count FROM code_chunks`).get();
  return result ? result.count : 0;
}

export function getAllChunks(dbPath) {
  const database = getDb(dbPath);
  const chunks = database.prepare('SELECT * FROM code_chunks').all();

  return chunks.map(chunk => ({
    ...chunk,
    embedding: chunk.embedding
      ? new Float32Array(chunk.embedding.buffer, chunk.embedding.byteOffset, chunk.embedding.length / 4)
      : null
  }));
}

export function closeDb(dbPath) {
  if (dbPath && connections.has(dbPath)) {
    connections.get(dbPath).close();
    connections.delete(dbPath);
  } else {
    for (const [path, database] of connections) {
      database.close();
    }
    connections.clear();
  }
}
