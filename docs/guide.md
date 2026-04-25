# Xencode - User Guide

## Quick Start

### Prerequisites

1. **Node.js 18+** installed
2. **LLM server** running locally (e.g., MLX, Ollama, vLLM)

### Installation

```bash
# Clone the repository
git clone https://github.com/fazleyrabby/xencode.git
cd xencode

# Install dependencies
npm install

# Copy your BGE-M3 model to the models folder
# Model should contain: tokenizer.json, config.json, onnx/model_quantized.onnx
mkdir -p models
cp -r /path/to/bge-m3 models/
```

---

## Step 1: Start Your LLM Server

Xencode needs a local LLM server running. Examples:

### MLX (Apple Silicon)

```bash
~/.venv/hujjah-mlx/bin/mlx_lm.server \
  --model ~/ai/models/Qwen3.5-9B-OptiQ-4bit \
  --port 8080 \
  --host 127.0.0.1 \
  --chat-template-args '{"enable_thinking": false}' \
  --max-tokens 2048 \
  --temp 0.1
```

### Ollama

```bash
ollama serve
# Then set: export LLM_URL=http://127.0.0.1:11434/v1
```

### Verify LLM is Running

```bash
curl http://127.0.0.1:8080/v1/models
# Should return: {"object": "list", "data": [...]}
```

---

## Step 2: Index Your Codebase

```bash
node src/app.js index /path/to/your/project
```

**Example:**

```bash
node src/app.js index ./litepos-tester
```

**Expected Output:**

```
╔═══════════════════════════════════════╗
║         Xencode CLI v0.2.0            ║
║    Local-first Code RAG Assistant     ║
╚═══════════════════════════════════════╝

⠋ Scanning files...
✅ Scanning files... Found 872 chunks in 0s

⠋ Generating embeddings...
⠏ Generating embeddings... 256/872 (6 chunks/s, ETA: 103s)
⠏ Generating embeddings... 512/872 (7 chunks/s, ETA: 51s)
⠏ Generating embeddings... 768/872 (7 chunks/s, ETA: 15s)
✅ Generating embeddings... 872 embeddings in 2m 14s

✅ Indexed 872 chunks successfully
```

**What Happens:**

1. Scans all `.php`, `.js`, `.ts`, `.vue`, `.json`, `.blade.php` files
2. Skips `vendor/`, `node_modules/`, `.git/`, `storage/`, etc.
3. Extracts functions/classes as chunks
4. Generates embeddings (vectors) for each chunk
5. Stores everything in `xencode.db`

**Time:** ~2 minutes for 300-500 files

---

## Step 3: Ask Questions

```bash
node src/app.js ask "your question here"
```

**Example Questions:**

```bash
# Architecture questions
node src/app.js ask "how does billing work"
node src/app.js ask "explain the subscription flow"

# Code location questions
node src/app.js ask "show me the product model"
node src/app.js ask "where is refund logic"

# How-to questions
node src/app.js ask "how to create a new customer"
node src/app.js ask "how does authentication work"

# Debugging questions
node src/app.js ask "find validation bugs in checkout"
node src/app.js ask "why is subscription expiring early"
```

**Expected Output:**

```
╔═══════════════════════════════════════╗
║         Xencode CLI v0.2.0            ║
║    Local-first Code RAG Assistant     ║
╚═══════════════════════════════════════╝

✅ Embedding query... Found 5 relevant chunks in 2288ms

⠋ Querying LLM...
✅ Querying LLM... Response received

──────────────────────────────────────────────────
Based on the provided code context, the billing system works through...

[Full LLM response with code references]
──────────────────────────────────────────────────
```

---

## Step 4: Re-index When Code Changes

If you modify your codebase, re-index to update:

```bash
node src/app.js index ./your-project
```

**Stale Index Warning:**

If you haven't indexed in 30+ minutes, you'll see:

```
⚠️  Index may be outdated (45m ago). Run: node src/app.js index
```

This is just a warning — queries still work, but results may be outdated.

---

## Configuration

### Environment Variables

```bash
# LLM endpoint (default: http://127.0.0.1:8080)
export LLM_URL=http://127.0.0.1:8080

# LLM model (optional, leave empty to use server's default)
export LLM_MODEL=""
```

### Model Path

Ensure `models/bge-m3/` contains:

```
models/bge-m3/
  ├── config.json
  ├── tokenizer.json
  ├── tokenizer_config.json
  ├── special_tokens_map.json
  ├── sentencepiece.bpe.model
  └── onnx/
      ├── model_quantized.onnx
      └── model.onnx -> model_quantized.onnx
```

---

## Common Scenarios

### Scenario 1: First Time Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy model
cp -r /path/to/bge-m3 models/

# 3. Start LLM server (in separate terminal)
mlx_lm.server --model ~/ai/models/Qwen3.5-9B-OptiQ-4bit --port 8080

# 4. Index your project
node src/app.js index ./my-laravel-project

# 5. Ask questions
node src/app.js ask "how does authentication work"
```

### Scenario 2: Daily Development

```bash
# Morning: check if index is fresh
node src/app.js ask "show me user model"

# If warning appears, re-index
node src/app.js index ./my-project

# Throughout the day: ask questions as needed
node src/app.js ask "where is payment validation"
node src/app.js ask "explain the refund flow"
```

### Scenario 3: Debugging a Bug

```bash
# 1. Ask about the feature
node src/app.js ask "how does checkout validation work"

# 2. Ask for specific files
node src/app.js ask "show me CheckoutController"

# 3. Ask for analysis
node src/app.js ask "find potential null pointer issues in billing"
```

---

## Troubleshooting

### "No index found" Warning

```bash
# Run indexing first
node src/app.js index ./your-project
```

### "LLM request failed: 404"

1. Check LLM server is running: `curl http://127.0.0.1:8080/v1/models`
2. Verify port matches: `echo $LLM_URL`
3. Restart LLM server if needed

### "Model not found" Error

1. Check model exists: `ls models/bge-m3/`
2. Verify files: should have `tokenizer.json`, `config.json`, `onnx/`
3. Re-copy model if missing

### Indexing Takes Too Long

- Normal: ~2 min for 300-500 files
- If >10 min: check if `vendor/` or `node_modules/` accidentally included
- Delete DB and re-index: `rm xencode.db && node src/app.js index ./project`

### Search Results Irrelevant

- Re-index with fresh code
- Try more specific queries (e.g., "Product model" vs "show me model")
- Check if file was excluded (e.g., in `storage/`)

---

## Performance Tips

1. **Index once per day** or after major changes
2. **Keep queries specific**: "ProductController create method" > "show product"
3. **Use function names**: "BillingService::createInvoice" for precise results
4. **Re-index after refactoring** to update embeddings

---

## Database

- **Location**: `xencode.db` (project root)
- **Size**: ~5-10 MB for medium projects
- **Reset**: `rm xencode.db` and re-index

---

## Support

- Issues: https://github.com/fazleyrabby/xencode/issues
- Docs: `docs/` folder (architecture, performance, troubleshooting)