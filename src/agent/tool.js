import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export function applyPatch(patchResult) {
  const { file, action, patch } = patchResult;

  if (!patch || !patch.type) {
    throw new Error('Invalid patch: missing type');
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
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(filePath, content, 'utf-8');
  return { action: 'created', file: filePath };
}

function applyReplace(filePath, target, newContent) {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const existing = readFileSync(filePath, 'utf-8');
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

  writeFileSync(filePath, newFile, 'utf-8');
  return { action: 'replaced', file: filePath, target, lines: `${startLine + 1}-${endLine + 1}` };
}

function applyInsert(filePath, anchor, content) {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const existing = readFileSync(filePath, 'utf-8');
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

  writeFileSync(filePath, newFile, 'utf-8');
  return { action: 'inserted', file: filePath, afterLine: insertAfterLine + 1 };
}
