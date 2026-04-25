You are a senior software engineer.

Your task is to BUILD a minimal, production-ready CLI tool named:

Xencode

Xencode is a local-first, code-aware RAG assistant for coding tasks.

The system must be:
- simple
- fast
- modular
- immediately usable

DO NOT overengineer.
DO NOT add features beyond the specification.

--------------------------------------------------
GOAL
--------------------------------------------------

Build a CLI tool that:

1. Indexes a local codebase
2. Generates embeddings for code chunks
3. Stores them in SQLite
4. Retrieves relevant code for a query
5. Sends context to a local LLM
6. Returns structured coding assistance

--------------------------------------------------
STRICT RULES (CRITICAL)
--------------------------------------------------

- NO agent loops
- NO tool system
- NO auto file editing
- NO watchers
- NO UI
- NO streaming
- NO FAISS
- NO unnecessary abstractions

Focus only on Phase 1 functionality.

--------------------------------------------------
TECH STACK
--------------------------------------------------

Runtime:
- Node.js (ESM)

Embeddings:
- Transformers.js
- Model: Xenova/bge-m3 (LOCAL ONNX)

IMPORTANT:
Use local model path instead of downloading:

/Users/rabbi/Desktop/Projects/hujjah/src-tauri/resources/models/

The code must:
- load model from local filesystem
- NOT download from internet

--------------------------------------------------

Database:
- SQLite (better-sqlite3)

LLM:
- Local API endpoint (configurable)

ENV:
LLM_URL=http://127.0.0.1:8080

--------------------------------------------------
PROJECT STRUCTURE
--------------------------------------------------

src/
  indexer.js
  embedder.js
  db.js
  search.js
  context.js
  llm.js
  app.js

--------------------------------------------------
FEATURES
--------------------------------------------------

1. INDEXER (indexer.js)

- Recursively scan directory
- Include file types:
  .php, .js, .ts, .vue, .json

- Extract:
  - functions (regex OK)
  - classes (regex OK)
  - fallback: full file (<300 lines)

Output:

{
  id: string,
  file: string,
  type: "function" | "class" | "file",
  name: string,
  code: string
}

--------------------------------------------------

2. EMBEDDER (embedder.js)

- Use Transformers.js:

import { pipeline } from '@xenova/transformers';

- Load model from LOCAL PATH:

/Users/rabbi/Desktop/Projects/hujjah/src-tauri/resources/models/Xenova/bge-m3/

- DO NOT download model

- Implement:

async function embedBatch(texts)

- Batch size: 8–16
- Normalize embeddings (L2)

Return:
Float32Array[]

--------------------------------------------------

3. DATABASE (db.js)

Schema:

CREATE TABLE code_chunks (
  id TEXT PRIMARY KEY,
  file TEXT,
  type TEXT,
  name TEXT,
  code TEXT,
  embedding BLOB
);

- Store embedding as Float32Array → Buffer

Functions:
- insertChunks()
- getAllChunks()

--------------------------------------------------

4. INDEX COMMAND

CLI:

node src/app.js index /path/to/project

Flow:
- run indexer
- embed in batches
- store in DB

- Show logs:
  - files processed
  - chunks created
  - progress %

--------------------------------------------------

5. SEARCH (search.js)

- Load all embeddings into memory
- Implement cosine similarity manually

Function:

search(queryEmbedding, topK=5)

Return top matches

--------------------------------------------------

6. CONTEXT BUILDER (context.js)

Format EXACTLY:

File: {file}
Type: {type}
Name: {name}

Code:
{code}

- Max 5 chunks
- Truncate large code blocks if needed

--------------------------------------------------

7. LLM CLIENT (llm.js)

- POST to LLM_URL

Request:

{
  "prompt": "...",
  "max_tokens": 512
}

- Return plain text

--------------------------------------------------

8. QUERY COMMAND

CLI:

node src/app.js ask "your question"

Flow:

- embed query
- retrieve top chunks
- build context
- create prompt:

"You are a coding assistant.

Use ONLY the provided code context.

If changes are required:
- explain clearly
- provide exact updated code

Context:
{context}

Task:
{query}"

- send to LLM
- print response

--------------------------------------------------

OUTPUT FORMAT

Return JSON:

{
  "explanation": "...",
  "changes": "...",
  "files": ["..."]
}

If model fails JSON → print raw output

--------------------------------------------------

PERFORMANCE RULES

- Batch embeddings
- Avoid duplicate inserts
- Keep memory reasonable

--------------------------------------------------

NON-GOALS

DO NOT BUILD:

- Agents
- Multi-step loops
- File editing
- UI
- Streaming
- Background services

--------------------------------------------------

DELIVERABLE

A working CLI tool where user can run:

node src/app.js index ./project
node src/app.js ask "Fix validation bug"

And receive a relevant, context-aware answer.

--------------------------------------------------

SUCCESS CRITERIA

- Code runs without modification
- No missing dependencies
- Clean modular structure
- Works with local embedding model path

--------------------------------------------------

IMPORTANT

This is Phase 1 ONLY.

Do not anticipate future features.
Do not extend scope.
Do not overengineer.
