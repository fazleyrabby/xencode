# Xencode - Architecture & Design

## Overview

Xencode is a local-first code-aware RAG (Retrieval-Augmented Generation) assistant. It indexes a codebase, generates vector embeddings, stores them in SQLite, and uses hybrid search (vector + keyword) to find relevant code context for LLM queries.

## Data Flow

```
INDEX COMMAND:
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌─────────┐
│ scanDirectory │ →  │  indexFile() │ →  │ embedBatch() │ →  │ SQLite  │
│  (.php etc)   │    │ chunk code   │    │ bge-m3 ONNX  │    │ BLOB    │
│               │    │ by function  │    │ (256 char)   │    │ storage │
└──────────────┘    └──────────────┘    └──────────────┘    └─────────┘

ASK COMMAND:
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ embedText()  │ →  │ hybridSearch │ →  │ formatContext │ →  │  queryLLM()  │
│ bge-m3 embed │    │ vector+kw    │    │ full code     │    │ Qwen 9B/MLX  │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
```

## Project Structure

```
src/
  app.js       - CLI entry point (index / ask commands)
  config.js    - LLM_URL, LLM_MODEL config (env vars)
  context.js   - Result formatter (uses code_full)
  db.js        - SQLite storage (better-sqlite3)
  embedder.js  - BGE-M3 embedding pipeline (Transformers.js)
  indexer.js   - Code scanner & chunker
  llm.js       - LLM API client (OpenAI-compatible)
  search.js    - Hybrid search (cosine + keyword)
  ui.js        - Spinner animations, formatters
models/
  bge-m3/      - Local ONNX model
xencode.db     - SQLite database (gitignored)
```

## Model

- **Embedding model**: BGE-M3 (quantized ONNX)
- **Dimensions**: 1024
- **Storage**: Float32Array → Buffer → SQLite BLOB
- **Path**: `models/bge-m3/` (must contain `tokenizer.json`, `config.json`, `onnx/model_quantized.onnx`)
- **Input truncation**: 256 chars for embedding (performance), full code stored in `code_full`

## Configuration

- `LLM_URL` - LLM endpoint (default: `http://127.0.0.1:8080`) via env var
- `LLM_MODEL` - Model path (default: empty, uses server's loaded model)

## Commands

```bash
node src/app.js index /path/to/codebase   # Index a project
node src/app.js ask "your question"        # Query indexed code
```

## Database Schema

```sql
code_chunks (
  id TEXT PRIMARY KEY,
  file TEXT,
  type TEXT,
  name TEXT,
  code TEXT,           -- truncated for embedding
  code_full TEXT,      -- full code for LLM context
  embedding BLOB       -- 1024-dim Float32
)

meta (
  key TEXT PRIMARY KEY,
  value TEXT
)
-- Stores: last_indexed_at (timestamp)
```