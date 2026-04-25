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