# Performance Notes

## Embedding Benchmarks (Apple M1 Pro)

### Text Length Impact

This was the critical discovery. BGE-M3 uses O(n²) attention, so input text length dramatically affects inference time.

| Batch Size | Text Length | Time |
|------------|-------------|------|
| 32 texts   | 64 chars    | 1.1s |
| 32 texts   | 256 chars   | 4.3s |
| 32 texts   | 512 chars   | 8.7s |
| 32 texts   | 1500 chars  | 56s  |
| 64 texts   | short       | 0.4s |
| 128 texts  | short       | 1.0s |

### Key Finding

**Input text length is the dominant factor, not batch size.**

Before truncation: 872 chunks with avg 802 chars = 25+ minutes (never completed).
After truncation to 256 chars: 872 chunks ≈ 2 minutes.

### Solution

Truncate all text to 256 characters before embedding (`MAX_INPUT_LENGTH = 256` in `embedder.js`).

This captures enough code context (function signature + first ~15 lines) while keeping transformer inference fast. The first ~256 chars of a function typically contain the function name, parameters, type hints, and initial logic — sufficient for semantic matching.

**Full code is preserved** in `code_full` column and used for LLM context, so no information is lost for the final response.

## Chunking Benchmarks

| Config | Chunks | Time (est.) |
|--------|--------|-------------|
| Original (50k+ chunks) | 56,250 | Hours (never completes) |
| Over-filtered | 35 | <1s (barely any retrieval) |
| Balanced (current) | ~872 | ~2 min |

## Search Performance

| Operation | Time |
|-----------|------|
| Embed query (1 text) | ~100ms |
| Load all chunks from DB | ~50ms |
| Cosine similarity (872 chunks) | ~10ms |
| Keyword scoring | ~5ms |
| Total search | ~200ms |

## Model Loading

- Quantized ONNX: ~1.3s cold start
- Model size: ~570MB (`model_quantized.onnx`)

## Storage

- SQLite with BLOB embeddings
- 872 chunks × 1024 dims × 4 bytes = ~3.5 MB embedding data
- Plus code text storage (~500KB for 872 chunks)
- Total DB size: ~5-10 MB for medium project

## Hybrid Search Formula

```
FINAL_SCORE = (cosine_similarity * 0.8) + (keyword_score * 0.2)
```

Keyword score boosts:
- File path contains query: +0.3
- Query mentions "model" + file is model: +0.2
- Code contains first query word: +0.1

## Stale Index Detection

- Threshold: 30 minutes
- Warning shown if `now - last_indexed_at > 30 * 60 * 1000`
- Zero performance impact (single DB read)