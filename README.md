# Xencode

Local-first code-aware RAG assistant for PHP/JS/TS/Vue projects.

## Features

- **Fast embedding** with BGE-M3 ONNX model (local, no API needed)
- **Smart chunking** - extracts functions/classes, avoids vendor noise
- **Cosine similarity search** - finds relevant code context
- **LLM integration** - connects to local LLM (Qwen 9B via MLX, etc.)

## Setup

```bash
npm install
```

## Usage

```bash
# Index a codebase
node src/app.js index ./my-project

# Ask questions
node src/app.js ask "How does billing work?"
```

## Configuration

- `LLM_URL` - LLM endpoint (default: http://127.0.0.1:8080)
- Model path: `models/bge-m3/`

## Tech Stack

- Transformers.js (local ONNX embedding)
- better-sqlite3
- Node.js ESM

## Project Structure

```
src/
  app.js      - CLI entry point
  embedder.js - BGE-M3 embedding pipeline
  indexer.js  - Code scanning & chunking
  search.js   - Cosine similarity search
  context.js  - Result formatting
  llm.js      - LLM client
  db.js       - SQLite storage
```