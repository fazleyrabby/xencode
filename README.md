# Xencode

Local-first code-aware RAG assistant and agentic coding system for PHP/JS/TS/Vue projects.

## Features

- **Fast embedding** with BGE-M3 ONNX model (local, no API needed)
- **Smart chunking** - extracts functions/classes, avoids vendor noise
- **Hybrid search** - vector + keyword matching
- **Full context** - stores complete code for LLM (no truncation)
- **CLI spinners** - animated progress with ETA
- **Stale index warning** - alerts if index is outdated
- **Agentic coding** - plan → retrieve → patch → diff → approve → apply
- **Interactive approval UI** - keyboard-driven patch review (↑↓ + Enter)

## Quick Start

```bash
# 1. Install
npm install

# 2. Start your LLM server (e.g., MLX, Ollama) on port 8080

# 3. Index your codebase
node src/app.js index ./my-project

# 4. Ask questions
node src/app.js ask "How does billing work?"

# 5. Generate and apply patches
node src/app.js agent "Add refund method to PaymentService"
```

## Usage

```bash
# Index a codebase
node src/app.js index ./my-project

# Ask questions
node src/app.js ask "Show me the Product model"
node src/app.js ask "How does refund payment work?"
node src/app.js ask "Explain the subscription flow"

# Generate patches with interactive approval
node src/app.js agent "Add refund method to PaymentService"
node src/app.js agent "Create Laravel refund service"
node src/app.js agent "Add validation to checkout" --review

# Re-index after code changes
node src/app.js index ./my-project
```

## Configuration

```bash
# LLM endpoint (default: http://127.0.0.1:8080)
export LLM_URL=http://127.0.0.1:8080

# LLM models (optional — role-based routing)
export LLM_MODEL=""
export LLM_MODEL_PLANNER=""    # Fast model for intent parsing
export LLM_MODEL_CODER=""      # Best model for patch generation
export LLM_MODEL_REVIEWER=""   # Strict model for review
```

## Tech Stack

- Transformers.js (local ONNX embedding: BGE-M3)
- better-sqlite3
- Node.js ESM
- OpenAI-compatible LLM API
- diff + chalk for colored diff output
- enquirer for interactive CLI prompts

## Project Structure

```
src/
  app.js          - CLI entry point
  embedder.js     - BGE-M3 embedding (256 char truncation)
  indexer.js      - Code scanning & chunking
  search.js       - Hybrid search (vector + keyword)
  context.js      - Result formatting
  llm.js          - LLM client (role-based routing)
  db.js           - SQLite storage
  ui.js           - Spinner animations
  agent/
    agent.js      - Orchestrator (pipeline)
    planner.js    - Intent parser
    coder.js      - Patch generator
    reviewer.js   - Validation + retry
    tool.js       - Patch application
    diff.js       - Unified diff output
    approval.js   - Interactive approval UI
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
