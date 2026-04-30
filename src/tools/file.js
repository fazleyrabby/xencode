import { readFileSync, existsSync } from 'fs';

const MAX_FILE_SIZE = 500 * 1024; // 500KB limit

export function readFile(path) {
  if (!existsSync(path)) {
    return { success: false, error: `File not found: ${path}`, content: null };
  }

  try {
    const stat = require('fs').statSync(path);
    if (stat.size > MAX_FILE_SIZE) {
      return { success: false, error: `File too large: ${stat.size} bytes`, content: null };
    }

    const content = readFileSync(path, 'utf-8');
    return { success: true, error: null, content };
  } catch (err) {
    return { success: false, error: err.message, content: null };
  }
}

export function fileExists(path) {
  return existsSync(path);
}

export function searchFilesByPattern(dir, pattern) {
  const { readdirSync } = require('fs');
  const results = [];
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = `${dir}/${entry.name}`;
    if (entry.isDirectory() && !['node_modules', 'vendor', '.git'].includes(entry.name)) {
      results.push(...searchFilesByPattern(fullPath, pattern));
    } else if (entry.isFile() && entry.name.includes(pattern)) {
      results.push(fullPath);
    }
  }

  return results;
}

export function findRelatedFiles(mainFile, content) {
  const related = new Set();

  // Extract imports/use statements
  const importPatterns = [
    /use\s+([A-Z][a-zA-Z0-9_\\]+)/g,
    /import\s+.*?from\s+['"]([^'"]+)['"]/g,
    /require\(['"]([^'"]+)['"]\)/g,
    /include\(['"]([^'"]+)['"]\)/g
  ];

  for (const pattern of importPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const importPath = match[1];
      // Convert namespace to file path (Laravel style)
      if (importPath.includes('\\')) {
        const filePath = importPath.replace(/\\/g, '/').replace(/^App\//, 'app/');
        related.add(filePath);
      }
    }
  }

  return Array.from(related);
}

export function getFileContext(filePath, relatedFiles = []) {
  const context = {};

  // Main file
  const mainResult = readFile(filePath);
  if (mainResult.success) {
    context.main = {
      path: filePath,
      content: mainResult.content,
      lines: mainResult.content.split('\n').length
    };
  }

  // Related files (up to 2)
  for (const relPath of relatedFiles.slice(0, 2)) {
    const result = readFile(relPath);
    if (result.success) {
      context.related = context.related || [];
      context.related.push({
        path: relPath,
        content: result.content,
        lines: result.content.split('\n').length
      });
    }
  }

  return context;
}
