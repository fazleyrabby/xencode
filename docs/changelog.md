# Changelog

## [0.6.0] - 2026-04-27

### Quality Loop Upgrade (v0.4 → v0.5)

- **Structured Planner**: JSON schema with intent, target_files, search_queries, required_context, risks, steps
- **Retrieval Upgrade**: Semantic(20) + Keyword(10) merge → rerank → top5 → neighbor expansion → ≤4k tokens
- **Critique Pass**: Mandatory code review checking assumptions, edge cases, Laravel conventions
- **Regeneration**: Max 1 regeneration pass based on critique feedback
- **Validation**: `php -l` syntax check + pattern detection (duplicates, missing imports, invalid syntax)
- **Confidence Scoring**: (retrieval×0.4) + (plan×0.2) + (validation?0.2:0) + (critique_clean?0.2:0)

### Interactive TUI + Stateful Session (v0.6)

- **Session State** (`core/session.js`): Persistent session with history, lastPlan/Context/Result, workingFiles, memory, stats
- **Mode Classification** (`core/mode.js`): RETRIEVE/EXPLAIN/MODIFY/GENERAL routing
- **Context Persistence** (`core/context.js`): Merges previous + current context (≤4k tokens)
- **Interactive Patch UI** (`cli/patch.js`): [Enter] apply / [r] regenerate / [e] edit / [s] skip
- **Command System** (`cli/commands.js`): /stats, /files, /plan, /context, /history, /memory, /debug, /reset
- **TUI Loop** (`cli/tui.js`): Continuous interactive session with mode dispatch

### Core Module Architecture

- **Pure functions**: Each module (planner, retriever, generator, critic, validator, scorer) is stateless
- **No hidden state**: All state managed through session object
- **ES Module compliant**: Full ESM syntax, no CommonJS require()

### New CLI Commands

- `node src/app.js tui` — Start interactive TUI session
- Commands: /exit, /reset, /stats, /files, /plan, /context, /debug, /help

## [0.5.0] - 2026-04-26

### Multi-Project Workspaces (NEW)

- **Workspace manager** (`src/workspace.js`): Project registration, switching, auto-detection
- **Per-project databases**: Each project gets its own `index.db` in `.xencode/projects/{id}/`
- **Project isolation**: No data leakage between projects, no re-indexing on switch
- **Auto-detection**: Running `ask` or `agent` auto-matches project by cwd path
- **CLI commands**:
  - `node src/app.js projects` — list all indexed projects with current marker
  - `node src/app.js use <project>` — switch active project
  - `node src/app.js index <path>` — register and index (auto-sets as current)

### Codex-Style Inline Approval UI

- **Replaced dropdown selector** with inline keypress interaction
- **Single-step**: Show diff → instant keypress → action
- **Key mappings**: Enter=apply, Esc=skip, E=edit(stub), V=view(stub)
- **TTY fallback**: Falls back to y/n prompt when stdin is not a TTY (piped/CI)
- **Removed enquirer dependency** — uses native `readline.emitKeypressEvents`

### Database Refactoring

- **Per-project connections**: `getDb(dbPath)` accepts path parameter instead of global singleton
- **Connection pooling**: Map-based cache for multiple project databases
- **Backward compatible**: All existing functions accept optional dbPath

### Search & Agent Updates

- **search.js**: Now accepts dbPath parameter for project-scoped retrieval
- **agent.js**: Passes dbPath through options for context retrieval
- **Auto-detect project path**: Agent uses indexed project path as basePath for file resolution

### Dependencies

- **Removed**: `enquirer` (replaced with native readline)

## [0.4.0] - 2026-04-26

### Agent System (NEW)

- **Agentic coding pipeline**: plan → retrieve → patch → diff → approve → apply
- **Planner**: Lightweight intent parser (create/update/explain) with JSON output
- **Coder**: Patch generator supporting create/replace/insert operations
- **Reviewer**: Optional validation loop with retry feedback (max 2 retries)
- **Tool**: String-based patch application (brace-matching for replace, anchor-based for insert)
- **Diff engine**: Unified diff output with chalk-colored formatting

### Interactive Approval UI

- **Keyboard-driven selector**: ↑↓/kj navigation, Enter to confirm, Ctrl+C to cancel
- **Raw stdin handling**: No heavy TUI framework — lightweight and fast
- **Diff preview**: Colored diff shown before approval prompt
- **Graceful cancellation**: Clean exit on Ctrl+C

### LLM Router

- **Role-based model routing**: planner, coder, reviewer, default roles
- **Per-role config**: Different max_tokens and temperature per role
- **JSON retry**: Automatic retry with feedback if LLM output is not valid JSON
- **New env vars**: `LLM_MODEL_PLANNER`, `LLM_MODEL_CODER`, `LLM_MODEL_REVIEWER`

### Context System

- **Wider retrieval**: Up to 30 chunks for agent mode (vs 5 for ask mode)
- **Semantic grouping**: Chunks merged into file-level blocks
- **Token-aware**: Context capped at ~20K tokens

### CLI

- **New command**: `node src/app.js agent "query"` for patch generation
- **Review flag**: `--review` enables optional reviewer step

### Dependencies

- **Added**: `diff` (unified diff generation)
- **Added**: `chalk` (terminal coloring)

## [0.3.0] - 2025-04-25

### CLI UI

- **Spinner animations**: Animated spinners for all async operations
- **Progress tracking**: Real-time chunks/sec and ETA during indexing
- **Banner**: Xencode ASCII banner on every command
- **Step visualization**: Clear step-by-step feedback for queries

### Database

- **Full context storage**: New `code_full` column stores complete code (no truncation for LLM)
- **Metadata table**: Stores `last_indexed_at` timestamp for stale index detection
- **Stale index warning**: Warns if index is >30 minutes old or missing

### Indexer

- **Dual storage**: `code` (truncated for embedding) + `code_full` (full for LLM context)
- **Configurable truncation**: `EMBEDDING_TRUNCATE = 256` constant

### Search

- **Hybrid search**: Combines cosine similarity (80%) + keyword matching (20%)
- **Keyword scoring**: Boosts results matching query terms in file path and code

### Context

- **Full context retrieval**: Uses `code_full` for LLM prompts (no 256-char limit)
- **Better LLM responses**: More complete code context for accurate answers

## [0.2.0] - 2025-04-25

### Indexer

- **Balanced chunking**: Produces ~872 chunks for 340 files (was 56,250 or 35)
- **Directory filtering**: Excludes `vendor/`, `node_modules/`, `storage/`, `public/`, `.git/`, `dist/`, `build/`
- **Function extraction**: PHP functions, JS/TS functions, arrow functions, blade templates
- **File fallback**: If no functions found, entire file becomes one chunk
- **Size filters**: Min 50 chars, max 5000 chars (truncated)
- **Deduplication**: SHA-256 hash based, skips duplicate code
- **Safety limit**: Hard cap at 20,000 chunks with exit warning
- **Low count warning**: Warns if < 300 chunks
- **Logging**: Files scanned, chunks created, duplicates skipped, top 5 files by chunk count
- **.blade.php support**: Included as file-level chunks
- **Minified file filtering**: Skips `.min.js` and `.min.ts` files

### Embedder

- **Critical fix**: Input text truncated to 256 chars before embedding
  - Benchmark: 64 short texts = 401ms, 64 × 1500char texts = 56,000ms
  - BGE-M3 attention is O(n²) in token count; long inputs cause exponential slowdown
- **Batch size**: 32 (tuned for Apple Silicon M1 Pro)
- **Quantized model**: Uses `quantized: true` for ~570MB ONNX model
- **Streaming to DB**: Each batch written to SQLite immediately (no RAM accumulation)
- **Progress logging**: Timestamps, percentage, ETA, chunks/sec at completion
- **Model path fix**: Uses `env.localModelPath` set to project root `/models` (not `/src/models`)
- **Retry logic**: 2 attempts per batch before skipping

### App

- **Streaming insert**: `embedBatchForDb()` callback writes to DB per batch instead of accumulating all embeddings in memory
- **.gitignore**: Excludes `models/`, `node_modules/`, `*.db`, `.env`

## [0.1.0] - 2025-04-25

### Initial build

- SQLite storage with embedding BLOB
- Transformers.js integration (local ONNX model)
- Recursive code scanner (.php, .js, .ts, .vue, .json)
- Cosine similarity search
- Context formatter
- LLM API client
- CLI entry point
