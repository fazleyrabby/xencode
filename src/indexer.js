import { readdir, readFile } from 'fs/promises';
import { join, extname } from 'path';
import { createHash } from 'crypto';

const SUPPORTED_EXTENSIONS = ['.php', '.js', '.ts', '.vue', '.json', '.blade.php'];

const EXCLUDED_DIRS = new Set([
  'node_modules', 'vendor', '.git', 'dist', 'build',
  'storage', 'public', '.next', '.nuxt', 'target',
  '__pycache__', '.cache', '.tmp'
]);

const MIN_CODE_LENGTH = 50;
const MAX_CODE_LENGTH = 5000;
const EMBEDDING_TRUNCATE = 256;
const SCAN_CONCURRENCY = 16;

function hashCode(code) {
  return createHash('sha256').update(code).digest('hex').substring(0, 16);
}

function extractFunctions(content) {
  const chunks = [];
  const pattern = /(?:public|protected|private)?\s*function\s+([a-zA-Z0-9_]+)\s*\([^)]*\)\s*(?::\s*\w+)?\s*\{([\s\S]*?)\}/g;
  let match;

  while ((match = pattern.exec(content)) !== null) {
    const fullCode = match[0];
    if (fullCode.length >= MIN_CODE_LENGTH) {
      const truncated = fullCode.length > MAX_CODE_LENGTH ? fullCode.substring(0, MAX_CODE_LENGTH) : fullCode;
      chunks.push({ name: match[1], code: truncated });
    }
  }

  const arrowPattern = /fn\s*\([^)]*\)\s*(?:->\s*\w+)?\s*=>\s*\{[^}]+\}/g;
  while ((match = arrowPattern.exec(content)) !== null) {
    const fullCode = match[0];
    if (fullCode.length >= MIN_CODE_LENGTH && fullCode.length <= MAX_CODE_LENGTH) {
      chunks.push({ name: 'arrow_' + chunks.length, code: fullCode });
    }
  }

  return chunks;
}

function extractJSFunctions(content) {
  const chunks = [];

  const pattern = /(?:async\s+)?function\s+([a-zA-Z0-9_]+)\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/g;
  let match;

  while ((match = pattern.exec(content)) !== null) {
    const fullCode = match[0];
    if (fullCode.length >= MIN_CODE_LENGTH) {
      const truncated = fullCode.length > MAX_CODE_LENGTH ? fullCode.substring(0, MAX_CODE_LENGTH) : fullCode;
      chunks.push({ name: match[1], code: truncated });
    }
  }

  const arrowPattern = /(?:const|let|var)\s+([a-zA-Z0-9_]+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>\s*\{[^}]+\}/g;
  while ((match = arrowPattern.exec(content)) !== null) {
    const fullCode = match[0];
    if (fullCode.length >= MIN_CODE_LENGTH && fullCode.length <= MAX_CODE_LENGTH) {
      chunks.push({ name: match[1], code: fullCode });
    }
  }

  return chunks;
}

function extractClass(content) {
  const match = content.match(/class\s+([a-zA-Z0-9_]+)/);
  return match ? match[1] : null;
}

export async function* scanDirectory(dir) {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
        yield* scanDirectory(join(dir, entry.name));
      }
    } else if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase();
      const baseName = entry.name.toLowerCase();
      if (SUPPORTED_EXTENSIONS.includes(ext) && !baseName.endsWith('.min.js') && !baseName.endsWith('.min.ts')) {
        yield join(dir, entry.name);
      }
    }
  }
}

export async function indexFile(filePath) {
  try {
    const content = await readFile(filePath, 'utf-8');
    const ext = extname(filePath).toLowerCase();
    const fileName = filePath.split('/').pop();
    const chunks = [];

    if (content.length < MIN_CODE_LENGTH) return [];

    if (ext === '.blade.php') {
      const codeFull = content.length > MAX_CODE_LENGTH ? content.substring(0, MAX_CODE_LENGTH) : content;
      chunks.push({
        id: `${filePath}:file`,
        file: filePath,
        type: 'file',
        name: fileName,
        code: codeFull.substring(0, EMBEDDING_TRUNCATE),
        code_full: codeFull
      });
      return chunks;
    }

    let funcChunks = [];
    if (ext === '.php') {
      funcChunks = extractFunctions(content);
    } else if (ext === '.js' || ext === '.ts' || ext === '.vue') {
      funcChunks = extractJSFunctions(content);
    } else if (ext === '.json') {
      funcChunks = [];
    }

    if (funcChunks.length > 0) {
      for (const func of funcChunks) {
        chunks.push({
          id: `${filePath}:func:${func.name}`,
          file: filePath,
          type: 'function',
          name: func.name,
          code: func.code
        });
      }
    } else {
      chunks.push({
        id: `${filePath}:file`,
        file: filePath,
        type: 'file',
        name: fileName,
        code: content.length > MAX_CODE_LENGTH ? content.substring(0, MAX_CODE_LENGTH) : content
      });
    }

    return chunks;
  } catch (error) {
    return [];
  }
}

export async function indexDirectory(dir, onProgress) {
  const allChunks = [];
  const seenHashes = new Set();
  const fileStats = [];
  let totalFiles = 0;
  let skippedFiles = 0;
  let duplicateSkipped = 0;

  // Phase 1: Collect all file paths (fast)
  const filePaths = [];
  for await (const filePath of scanDirectory(dir)) {
    filePaths.push(filePath);
  }

  // Phase 2: Process files concurrently
  const chunkBatch = [];
  let processed = 0;

  async function processFile(filePath) {
    const chunks = await indexFile(filePath);
    return { filePath, chunks };
  }

  // Process in chunks to control memory
  for (let i = 0; i < filePaths.length; i += SCAN_CONCURRENCY) {
    const batch = filePaths.slice(i, i + SCAN_CONCURRENCY);
    const results = await Promise.all(batch.map(processFile));

    for (const { filePath, chunks } of results) {
      totalFiles++;
      processed++;

      if (onProgress && processed % 50 === 0) {
        onProgress(processed, filePaths.length);
      }

      if (chunks.length === 0) {
        skippedFiles++;
      }

      for (const chunk of chunks) {
        const hash = hashCode(chunk.code);
        if (!seenHashes.has(hash)) {
          seenHashes.add(hash);
          chunkBatch.push(chunk);

          const existing = fileStats.find(s => s.file === filePath);
          if (existing) {
            existing.chunks++;
          } else {
            fileStats.push({ file: filePath, chunks: 1 });
          }
        } else {
          duplicateSkipped++;
        }
      }
    }

    // Push batch to allChunks periodically to free memory
    allChunks.push(...chunkBatch.splice(0));
  }

  // Push remaining
  allChunks.push(...chunkBatch);

  console.log(`Scanned ${totalFiles} files`);
  console.log(`Created ${allChunks.length} chunks (${duplicateSkipped} duplicates skipped, ${skippedFiles} files skipped)`);

  if (allChunks.length < 300) {
    console.warn(`\nWarning: Chunk count too low (${allChunks.length}). Check extraction logic.`);
  }

  if (fileStats.length > 0) {
    fileStats.sort((a, b) => b.chunks - a.chunks);
    console.log('\nTop files by chunk count:');
    for (const stat of fileStats.slice(0, 5)) {
      console.log(`  ${stat.chunks} chunks: ${stat.file.split('/').pop()}`);
    }
  }

  return allChunks;
}