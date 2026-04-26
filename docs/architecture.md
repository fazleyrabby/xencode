# Xencode - Architecture & Design

## Overview

Xencode is a local-first code-aware RAG (Retrieval-Augmented Generation) assistant and agentic coding system. It indexes a codebase, generates vector embeddings, stores them in SQLite, and uses hybrid search (vector + keyword) to find relevant code context for LLM queries. In agent mode, it extends this into a full **plan → retrieve → patch → diff → approve → apply** pipeline.

## Data Flow

### Index Command

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌─────────┐
│ scanDirectory │ →  │  indexFile() │ →  │ embedBatch() │ →  │ SQLite  │
│  (.php etc)   │    │ chunk code   │    │ bge-m3 ONNX  │    │ BLOB    │
│               │    │ by function  │    │ (256 char)   │    │ storage │
└──────────────┘    └──────────────┘    └──────────────┘    └─────────┘
```

### Ask Command

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ embedText()  │ →  │ hybridSearch │ →  │ formatContext │ →  │  queryLLM()  │
│ bge-m3 embed │    │ vector+kw    │    │ full code     │    │ Qwen 9B/MLX  │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
```

### Agent Command

```
┌──────────┐    ┌──────────┐    ┌──────────────┐    ┌──────────┐
│  User    │ →  │ Planner  │ →  │  Retriever   │ →  │  Coder   │
│  Query   │    │ (intent) │    │ (20-30 chunks│    │ (patch)  │
└──────────┘    └──────────┘    └──────────────┘    └──────────┘
                                                        │
┌──────────┐    ┌──────────┐    ┌──────────────┐        │
│  Apply   │ ←  │ Approval │ ←  │    Diff      │ ←──────┘
│  Patch   │    │  (UI)    │    │  (preview)   │
└──────────┘    └──────────┘    └──────────────┘
     │
     └──→ [Optional: Reviewer → retry loop]
```

## Project Structure

```
src/
  app.js       - CLI entry point (index / ask / agent commands)
  config.js    - LLM_URL, role-based model config (env vars)
  context.js   - Result formatter (uses code_full, agent context)
  db.js        - SQLite storage (better-sqlite3)
  embedder.js  - BGE-M3 embedding pipeline (Transformers.js)
  indexer.js   - Code scanner & chunker
  llm.js       - LLM API client (role-based routing, JSON retry)
  search.js    - Hybrid search (cosine + keyword)
  ui.js        - Spinner animations, formatters
  agent/
    agent.js   - Orchestrator (pipeline coordination)
    planner.js - Intent parser (create/update/explain)
    coder.js   - Patch generator (create/replace/insert)
    reviewer.js- Validation + retry feedback loop
    tool.js    - String-based patch application
    diff.js    - Unified diff output with chalk coloring
    approval.js- Interactive keyboard-driven approval UI
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

## LLM Router

The `llm.js` module routes requests to different models based on role:

| Role | Purpose | Env Var | Default Config |
|------|---------|---------|----------------|
| `planner` | Intent parsing | `LLM_MODEL_PLANNER` | 512 tokens, temp 0.1 |
| `coder` | Patch generation | `LLM_MODEL_CODER` | 4096 tokens, temp 0.2 |
| `reviewer` | Validation | `LLM_MODEL_REVIEWER` | 1024 tokens, temp 0.1 |
| `default` | Q&A (ask mode) | `LLM_MODEL` | 1024 tokens, temp 0.3 |

All roles fall back to `LLM_MODEL` if their specific env var is not set.

## Configuration

- `LLM_URL` - LLM endpoint (default: `http://127.0.0.1:8080`) via env var
- `LLM_MODEL` - Default model (default: empty, uses server's loaded model)
- `LLM_MODEL_PLANNER` - Fast model for intent parsing
- `LLM_MODEL_CODER` - Best model for patch generation
- `LLM_MODEL_REVIEWER` - Strict model for validation

## Commands

```bash
node src/app.js index /path/to/codebase   # Index a project
node src/app.js ask "your question"        # Query indexed code
node src/app.js agent "your task"          # Generate and apply patches
node src/app.js agent "your task" --review # With review loop
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

## Agent Pipeline Details

### Planner

Lightweight intent parser. Outputs strict JSON:

```json
{
  "intent": "create|update|explain",
  "search_queries": ["query1", "query2"],
  "target": "file or concept name"
}
```

### Retriever

Uses existing `search.js` with wider retrieval (top_k = 25). Merges results into semantic blocks at file/function level. Context capped at ~20K tokens.

### Coder

Main intelligence. Generates minimal patches in strict JSON:

```json
{
  "file": "path/to/file",
  "action": "create|patch",
  "patch": {
    "type": "create|replace|insert",
    "target": "function name (if applicable)",
    "content": "code snippet"
  },
  "summary": "short description"
}
```

### Diff Engine

Uses the `diff` package to generate unified diffs with chalk-colored output (+ green, - red, @@ cyan).

### Approval UI

Keyboard-driven selector using raw stdin:
- ↑/↓ or k/j for navigation
- Enter to confirm
- Ctrl+C to cancel
- No heavy TUI framework — lightweight and fast

### Tool (Patch Application)

String-based patch application:
- **create**: Write new file (creates directories as needed)
- **replace**: Find target function by name, replace its body (brace-matching)
- **insert**: Find anchor, insert content after the anchor's closing brace

### Reviewer (Optional)

Validates patch against user request. If invalid, feeds back to coder for retry. Max 2 retries.
