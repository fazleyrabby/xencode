# Xencode - Architecture & Design

## Overview

Xencode is a local-first code-aware RAG (Retrieval-Augmented Generation) assistant and agentic coding system. It indexes multiple codebases into isolated project workspaces, generates vector embeddings, stores them in per-project SQLite databases, and uses hybrid search (vector + keyword) to find relevant code context for LLM queries. In agent mode, it extends this into a full **plan → retrieve → patch → diff → approve → apply** pipeline.

## Data Flow

### Index Command

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐
│ scanDirectory │ →  │  indexFile() │ →  │ embedBatch() │ →  │ .xencode/projects/│
│  (.php etc)   │    │ chunk code   │    │ bge-m3 ONNX  │    │ {id}/index.db     │
│               │    │ by function  │    │ (256 char)   │    │                   │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────────┘
```

### Ask Command

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ embedText()  │ →  │ hybridSearch │ →  │ formatContext │ →  │  queryLLM()  │
│ bge-m3 embed │    │ vector+kw    │    │ full code     │    │ Qwen 9B/MLX  │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
       ↑                    ↑
   (project db)        (project db)
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
│  Patch   │    │ (inline) │    │  (preview)   │
└──────────┘    └──────────┘    └──────────────┘
     │
     └──→ [Optional: Reviewer → retry loop]
```

## Project Structure

```
src/
  app.js       - CLI entry point (index / ask / agent / projects / use)
  workspace.js - Multi-project workspace manager
  config.js    - LLM_URL, role-based model config (env vars)
  context.js   - Result formatter (uses code_full, agent context)
  db.js        - Per-project SQLite storage (better-sqlite3)
  embedder.js  - BGE-M3 embedding pipeline (Transformers.js)
  indexer.js   - Code scanner & chunker
  llm.js       - LLM API client (role-based routing, JSON retry)
  search.js    - Hybrid search (cosine + keyword, project-scoped)
  ui.js        - Spinner animations, formatters
  agent/
    agent.js   - Orchestrator (pipeline coordination)
    planner.js - Intent parser (create/update/explain)
    coder.js   - Patch generator (create/replace/insert)
    reviewer.js- Validation + retry feedback loop
    tool.js    - String-based patch application
    diff.js    - Unified diff output with chalk coloring
    approval.js- Inline keypress approval UI
.xencode/
  projects/
    {project_id}/
      index.db    - Per-project SQLite database
      meta.json   - Project metadata (name, path, indexed_at)
  current_project.json  - Active project ID
models/
  bge-m3/      - Local ONNX model
```

## Workspace System

### Project Identification

Each project is identified by a hashed path:

```
projectId = "{folder_name}-{sha256(path)[0:16]}"
```

Example: `litepos-tester-11f2c47ecb4a8ce5`

### Project Isolation

- Each project gets its own `index.db` — no data sharing
- `current_project.json` tracks the active project
- Auto-detection matches cwd against registered project paths
- Switching projects is instant — no re-indexing needed

### Database Connection Management

`db.js` uses a Map-based connection pool:

```js
const connections = new Map(); // dbPath → Database instance
```

Connections are created on-demand and closed via `closeDb()`.

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
node src/app.js index /path/to/codebase   # Register and index a project
node src/app.js projects                   # List all indexed projects
node src/app.js use <project>              # Switch active project
node src/app.js ask "your question"        # Query current project
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

Inline keypress interaction using native `readline.emitKeypressEvents`:
- **Enter** → apply patch
- **Esc** → skip
- **E** → edit/regenerate (stub)
- **V** → view full file (stub)
- **Ctrl+C** → clean exit
- Falls back to y/n prompt when stdin is not a TTY

### Tool (Patch Application)

String-based patch application:
- **create**: Write new file (creates directories as needed)
- **replace**: Find target function by name, replace its body (brace-matching)
- **insert**: Find anchor, insert content after the anchor's closing brace

### Reviewer (Optional)

Validates patch against user request. If invalid, feeds back to coder for retry. Max 2 retries.
