# Xencode

Local-first code-aware RAG assistant for PHP/JS/TS/Vue projects.

## Features

- **Fast embedding** with BGE-M3 ONNX model (local, no API needed)
- **Smart chunking** - extracts functions/classes, avoids vendor noise
- **Hybrid search** - vector + keyword matching
- **Full context** - stores complete code for LLM (no truncation)
- **CLI spinners** - animated progress with ETA
- **Stale index warning** - alerts if index is outdated

## Quick Start

```bash
# 1. Install
npm install

# 2. Start your LLM server (e.g., MLX, Ollama) on port 8080

# 3. Index your codebase
node src/app.js index ./my-project

# 4. Ask questions
node src/app.js ask "How does billing work?"
```

## Usage

```bash
# Index a codebase
node src/app.js index ./my-project

# Ask questions
node src/app.js ask "Show me the Product model"
node src/app.js ask "How does refund payment work?"
node src/app.js ask "Explain the subscription flow"

# Re-index after code changes
node src/app.js index ./my-project
```

## Configuration

```bash
# LLM endpoint (default: http://127.0.0.1:8080)
export LLM_URL=http://127.0.0.1:8080

# LLM model (optional)
export LLM_MODEL=""
```

## Tech Stack

- Transformers.js (local ONNX embedding: BGE-M3)
- better-sqlite3
- Node.js ESM
- OpenAI-compatible LLM API

## Project Structure

```
src/
  app.js          - CLI entry point
  embedder.js     - BGE-M3 embedding (256 char truncation)
  indexer.js      - Code scanning & chunking
  search.js       - Hybrid search (vector + keyword)
  context.js      - Result formatting
  llm.js          - LLM client
  db.js           - SQLite storage
  ui.js           - Spinner animations
docs/
  guide.md        - Full user guide
  architecture.md - System design
  performance.md  - Benchmarks
  troubleshooting.md - Common issues
```

## Documentation

- **[User Guide](docs/guide.md)** - Step-by-step instructions
- **[Architecture](docs/architecture.md)** - System design
- **[Performance](docs/performance.md)** - Benchmarks
- **[Troubleshooting](docs/troubleshooting.md)** - Common issues

## License

MIT