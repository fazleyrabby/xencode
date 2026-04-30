import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join, isAbsolute } from 'path';

let baseDir = process.cwd();

export function setBaseDir(dir) {
  baseDir = dir;
}

export function resolvePath(filePath) {
  if (isAbsolute(filePath)) {
    return filePath;
  }
  return join(baseDir, filePath);
}

export function applyPatch(patchResult) {
  const { file, action, patch } = patchResult;

  if (!patch || !patch.type) {
    throw new Error('Invalid patch: missing type');
  }

  // Handle empty before = insert into existing file
  // Works for both 'replace' and 'create' type when before is empty
  if ((patch.type === 'replace' || patch.type === 'create') && !patch.before && file) {
    return applyInsertMethod(file, patch.content || '');
  }

  switch (patch.type) {
    case 'create':
      return applyCreate(file, patch.content);
    case 'replace':
      return applyReplace(file, patch.target, patch.content);
    case 'insert':
      return applyInsert(file, patch.target, patch.content);
    default:
      throw new Error(`Unknown patch type: ${patch.type}`);
  }
}

function applyCreate(filePath, content) {
  const resolvedPath = resolvePath(filePath);
  const dir = dirname(resolvedPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(resolvedPath, content, 'utf-8');
  return { action: 'created', file: filePath };
}

function applyReplace(filePath, target, newContent) {
  const resolvedPath = resolvePath(filePath);
  if (!existsSync(resolvedPath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const existing = readFileSync(resolvedPath, 'utf-8');
  const lines = existing.split('\n');
  const targetLower = target.toLowerCase();

  let startLine = -1;
  let endLine = -1;
  let braceCount = 0;
  let foundStart = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineLower = line.toLowerCase();

    if (!foundStart && (lineLower.includes(targetLower) || lineLower.includes(`function ${targetLower}`))) {
      startLine = i;
      foundStart = true;
    }

    if (foundStart) {
      for (const char of line) {
        if (char === '{') braceCount++;
        if (char === '}') braceCount--;
      }
      if (braceCount === 0 && startLine !== i) {
        endLine = i;
        break;
      }
    }
  }

  if (startLine === -1) {
    throw new Error(`Could not find target "${target}" in ${filePath}`);
  }

  if (endLine === -1) {
    endLine = startLine;
    for (let i = startLine + 1; i < lines.length; i++) {
      if (lines[i].trim() === '' || lines[i].trim().startsWith('//') || lines[i].trim().startsWith('*')) {
        endLine = i - 1;
        break;
      }
      endLine = i;
    }
  }

  const before = lines.slice(0, startLine).join('\n');
  const after = lines.slice(endLine + 1).join('\n');
  const newFile = [before, newContent, after].filter(Boolean).join('\n');

  writeFileSync(resolvedPath, newFile, 'utf-8');
  return { action: 'replaced', file: filePath, target, lines: `${startLine + 1}-${endLine + 1}` };
}

function applyInsert(filePath, anchor, content) {
  const resolvedPath = resolvePath(filePath);
  if (!existsSync(resolvedPath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const existing = readFileSync(resolvedPath, 'utf-8');
  const lines = existing.split('\n');
  const anchorLower = anchor.toLowerCase();

  let insertAfterLine = -1;

  for (let i = 0; i < lines.length; i++) {
    const lineLower = lines[i].toLowerCase();
    if (lineLower.includes(anchorLower) || lineLower.includes(`function ${anchorLower}`)) {
      let braceCount = 0;
      let foundOpen = false;
      for (let j = i; j < lines.length; j++) {
        for (const char of lines[j]) {
          if (char === '{') { braceCount++; foundOpen = true; }
          if (char === '}') braceCount--;
        }
        if (foundOpen && braceCount === 0) {
          insertAfterLine = j;
          break;
        }
      }
      break;
    }
  }

  if (insertAfterLine === -1) {
    throw new Error(`Could not find anchor "${anchor}" in ${filePath}`);
  }

  const before = lines.slice(0, insertAfterLine + 1).join('\n');
  const after = lines.slice(insertAfterLine + 1).join('\n');
  const newFile = [before, content, after].filter(Boolean).join('\n');

  writeFileSync(resolvedPath, newFile, 'utf-8');
  return { action: 'inserted', file: filePath, afterLine: insertAfterLine + 1 };
}

// Insert method into existing class when before is empty
function applyInsertMethod(filePath, newMethod) {
  const resolvedPath = resolvePath(filePath);
  if (!existsSync(resolvedPath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = readFileSync(resolvedPath, 'utf-8');
  const trimmed = content.trim();

  // Empty file - write full content directly
  if (trimmed === '') {
    writeFileSync(resolvedPath, newMethod + '\n', 'utf-8');
    return { action: 'created', file: filePath };
  }

  // If newMethod contains class definition - it's a full file overwrite, not insert
  // Strip the class wrapper and extract just the method
  let methodToInsert = newMethod;
  const classMatch = newMethod.match(/class\s+\w+\s+extends\s+\w+\s*\{([\s\S]*)\}\s*$/);
  if (classMatch) {
    // Extract method content from class body
    const classBody = classMatch[1];
    // Find the first method in the class body
    const methodMatch = classBody.match(/(public|protected|private)\s+(?:static\s+)?function\s+\w+\s*\([^)]*\)\s*(?::\s*\w+)?\s*\{[\s\S]*?\}\s*$/);
    if (methodMatch) {
      methodToInsert = '    ' + methodMatch[0];
    }
  }

  const lines = content.split('\n');

  // Find end of class (closing brace)
  let insertLine = -1;
  let braceCount = 0;
  let inClass = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const char of line) {
      if (char === '{') { braceCount++; inClass = true; }
      if (char === '}') braceCount--;
    }
    if (inClass && braceCount === 0 && insertLine === -1) {
      insertLine = i;
      break;
    }
  }

  // No class brace found - append at end of file
  if (insertLine === -1) {
    if (trimmed.endsWith('}')) {
      // Find the last brace
      for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].includes('}')) {
          insertLine = i;
          break;
        }
      }
    } else {
      // Just append to file
      writeFileSync(resolvedPath, content + '\n' + methodToInsert, 'utf-8');
      return { action: 'appended', file: filePath };
    }
  }

  const before = lines.slice(0, insertLine).join('\n');
  const after = lines.slice(insertLine).join('\n');
  const newFile = [before, methodToInsert, after].filter(Boolean).join('\n');

  writeFileSync(resolvedPath, newFile, 'utf-8');
  return { action: 'method_inserted', file: filePath };
}
