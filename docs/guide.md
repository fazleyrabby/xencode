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
~/.venv/<your-venv>/bin/mlx_lm.server \
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
║         Xencode CLI v0.3.0            ║
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
║         Xencode CLI v0.3.0            ║
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

## Step 4: Generate and Apply Patches (Agent Mode)

The agent mode transforms Xencode from a Q&A assistant into an **interactive coding assistant** that generates minimal patches, shows diffs, and requires your approval before applying changes.

### Basic Usage

```bash
node src/app.js agent "Add refund method to PaymentService"
```

### With Review Loop

```bash
node src/app.js agent "Create Laravel refund service" --review
```

The `--review` flag enables an optional reviewer step that validates the patch before showing it to you.

### What Happens

```
[PLAN]
✅ Intent: create, Target: PaymentService
  Search queries: refund method, PaymentService, refund service

[CONTEXT]
✅ Retrieved 25 relevant chunks

[CODE]
✅ Patch generated for app/Services/PaymentService.php (replace)

[DIFF]
┌─── PATCH PREVIEW ───┐

--- a/PaymentService.php
+++ b/PaymentService.php
@@ -45,6 +45,18 @@
+    public function refundPayment($orderId, $amount) {
+        // refund implementation
+    }

└───────────────────────┘

  ↑ ↓ navigate  ·  Enter confirm  ·  Ctrl+C cancel

❯ ✅  Yes — apply changes
  ❌  No — skip
```

### Interactive Approval

After seeing the diff, you get a **keyboard-driven selector**:

- **↑ / ↓** or **k / j** — navigate between Yes and No
- **Enter** — confirm selection
- **Ctrl+C** — cancel and exit

If you select **Yes**, the patch is applied to the file. If **No**, changes are skipped.

### Patch Types

The agent supports three patch operations:

| Type | Description | Example |
|------|-------------|---------|
| `create` | New file | Create a new service class |
| `replace` | Replace existing function/block | Update `refundPayment` implementation |
| `insert` | Insert after an anchor | Add new method after `__construct` |

### Example Queries

```bash
# Create new files
node src/app.js agent "Create a ValidationService class in app/Services"

# Modify existing code
node src/app.js agent "Add input validation to the checkout method"

# Insert new functionality
node src/app.js agent "Add logging to the PaymentService constructor"

# Refactor
node src/app.js agent "Extract the payment validation logic into a separate method"
```

---

## Step 5: Re-index When Code Changes

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

# Default model (optional)
export LLM_MODEL=""

# Role-specific models (optional, fall back to LLM_MODEL)
export LLM_MODEL_PLANNER=""    # Fast model for intent parsing
export LLM_MODEL_CODER=""      # Best model for patch generation
export LLM_MODEL_REVIEWER=""   # Strict model for validation
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

# 6. Generate patches
node src/app.js agent "Add refund method"
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

# Generate code changes
node src/app.js agent "Add email notification on refund"
```

### Scenario 3: Debugging a Bug

```bash
# 1. Ask about the feature
node src/app.js ask "how does checkout validation work"

# 2. Ask for specific files
node src/app.js ask "show me CheckoutController"

# 3. Ask for analysis
node src/app.js ask "find potential null pointer issues in billing"

# 4. Apply a fix
node src/app.js agent "Add null check before accessing order->customer in checkout"
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

### Agent Patch Fails to Apply

- Ensure the indexed codebase path matches the actual file paths
- For `replace` patches, the target function name must exist in the file
- For `insert` patches, the anchor must be findable in the file
- Check the diff preview carefully before approving

---

## Performance Tips

1. **Index once per day** or after major changes
2. **Keep queries specific**: "ProductController create method" > "show product"
3. **Use function names**: "BillingService::createInvoice" for precise results
4. **Re-index after refactoring** to update embeddings
5. **Use role-specific models** if you have multiple models available (fast planner, strong coder)

---

## Database

- **Location**: `xencode.db` (project root)
- **Size**: ~5-10 MB for medium projects
- **Reset**: `rm xencode.db` and re-index

---

## Support

- Issues: https://github.com/fazleyrabby/xencode/issues
- Docs: `docs/` folder (architecture, performance, troubleshooting)
