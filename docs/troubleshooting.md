# Troubleshooting

## Model Not Found

**Error**: `local_files_only=true and file was not found locally at ".../bge-m3/tokenizer.json"`

**Cause**: `env.localModelPath` was resolving relative to `/src/` instead of project root.

**Fix**: Set `env.localModelPath = join(__dirname, '..', 'models')` (project root models dir). The model name `'bge-m3'` is then resolved relative to that path.

Verify the model directory exists:
```
models/bge-m3/
  config.json
  tokenizer.json
  tokenizer_config.json
  special_tokens_map.json
  sentencepiece.bpe.model
  onnx/
    model_quantized.onnx
    model.onnx -> model_quantized.onnx
```

## Embedding Hangs / Very Slow

**Symptoms**: Embedding progress stalls at 7-15% for minutes.

**Cause**: Long code chunks (5000 chars) fed directly to BGE-M3. Transformer attention is O(n^2) — padding across 8192 max tokens causes massive slowdown.

**Fix**: `MAX_INPUT_LENGTH = 256` in `embedder.js` truncates input text before embedding. Full code is preserved in `code_full` for LLM context.

## Over-chunking (50k+ Chunks)

**Cause**: Original indexer included `vendor/` and `node_modules/`, and created a chunk for every small regex match.

**Fix**: `EXCLUDED_DIRS` set in `indexer.js` filters out `vendor/`, `node_modules/`, `storage/`, `public/`, etc. Function extraction requires `code.length >= 50`. Deduplication via SHA-256 hash.

## Under-chunking (< 100 Chunks)

**Cause**: Overly aggressive filters skipping files < 10 lines, skipping files < 100 chars, requiring class extraction.

**Fix**: Lowered `MIN_CODE_LENGTH` to 50. File-level chunking fallback when no functions found. No blind line-count filter.

## Wrong Model Path

Transformers.js resolves model names relative to `env.localModelPath`. Using a full absolute path like `/Users/.../models/bge-m3` gets prepended with `env.localModelPath` again, creating double paths like `/models/Users/.../models/bge-m3`.

**Fix**: Use short model name `'bge-m3'` and set `env.localModelPath` to the parent directory containing the model folder.

## LLM 404 / Unauthorized Error

**Symptoms**: `LLM request failed: 404 Not Found` or `401 Unauthorized`

**Cause**: LLM server not running or wrong endpoint.

**Fix**: Ensure your LLM (e.g., Qwen 9B via MLX) is running at `http://127.0.0.1:8080`. The app uses OpenAI-compatible `/v1/chat/completions` endpoint.

## Stale Index Warning

**Symptoms**: `⚠️ Index may be outdated (45m ago). Run: node src/app.js index`

**Cause**: Index was created more than 30 minutes ago.

**Fix**: This is just a warning. Re-index if your codebase has changed:
```bash
node src/app.js index ./project
```

## No Index Found Warning

**Symptoms**: `⚠️ No index found. Run: node src/app.js index`

**Cause**: Database doesn't exist or no chunks indexed yet.

**Fix**: Index your codebase first:
```bash
node src/app.js index ./project
```

## Agent Mode Issues

### "Failed to get valid JSON after 2 attempts"

**Cause**: LLM output is not parseable JSON (common with smaller models or high temperature).

**Fix**:
1. Lower the temperature for your LLM server (`--temp 0.1` or `--temp 0.2`)
2. Use a stronger model for the coder role: `export LLM_MODEL_CODER="your-best-model"`
3. Ensure your LLM supports the `model` parameter in the request

### Patch Application Fails: "Could not find target"

**Cause**: The `replace` or `insert` patch references a function/anchor that doesn't exist in the file.

**Fix**:
1. Check the diff preview — does the target function name match exactly?
2. Re-index your codebase to ensure the latest file content is available
3. Try a more specific query that includes the exact function name

### Patch Application Fails: "File not found"

**Cause**: The coder generated a patch for a file path that doesn't exist on disk.

**Fix**:
1. Check the generated file path in the diff preview
2. For `create` patches, ensure the directory path is correct
3. The agent works best when the indexed codebase path matches the actual working directory

### Agent Produces Irrelevant Patches

**Cause**: Retrieved context doesn't match the user's intent.

**Fix**:
1. Use more specific queries: "Add refund method to PaymentService" instead of "Add refund"
2. Include file or class names in your query
3. Re-index if the codebase has changed significantly
4. Try the `--review` flag to catch issues before applying

### Approval UI Not Responding

**Cause**: Terminal doesn't support raw mode or stdin is being redirected.

**Fix**:
1. Ensure you're running in an interactive terminal (not piped input)
2. Try resizing the terminal window
3. Press Ctrl+C to cancel and retry

## Workspace Issues

### "No active project" Error

**Symptoms**: `⚠️ No active project. Index or switch to a project first.`

**Cause**: No project has been indexed, or `current_project.json` is missing/corrupted.

**Fix**:
```bash
# Index a project
node src/app.js index ./my-project

# Or list and switch to an existing one
node src/app.js projects
node src/app.js use <project-id>
```

### Project Not Found After Re-indexing

**Cause**: The project path changed (moved folder, different symlink), generating a new project ID.

**Fix**:
1. Run `node src/app.js projects` to see all registered projects
2. Re-index with the current path: `node src/app.js index ./my-project`
3. Delete old unused projects from `.xencode/projects/`

### Wrong Project Being Used

**Cause**: Auto-detection matched a different project, or `current_project.json` points to the wrong project.

**Fix**:
```bash
# Explicitly switch to the correct project
node src/app.js use <project-id>

# Verify current project
node src/app.js projects
```

### Database File Not Found

**Symptoms**: Errors about missing `.xencode/projects/{id}/index.db`

**Cause**: The project was registered but never indexed, or the database was deleted.

**Fix**: Re-index the project:
```bash
node src/app.js index /path/to/project
```

### Cleaning Up Old Projects

Projects are stored in `.xencode/projects/`. To remove an unused project:

```bash
# List projects to find the ID
node src/app.js projects

# Remove the project directory
rm -rf .xencode/projects/<project-id>

# If it was the current project, switch to another
node src/app.js use <another-project-id>
```
