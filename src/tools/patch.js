import { readFileSync, writeFileSync, existsSync } from 'fs';

const MAX_CONTEXT_LINES = 20;

export function applyDiffPatch(filePath, before, after) {
  if (!existsSync(filePath)) {
    return { success: false, error: `File not found: ${filePath}` };
  }

  const content = readFileSync(filePath, 'utf-8');

  const beforeIndex = content.indexOf(before);
  if (beforeIndex === -1) {
    return {
      success: false,
      error: 'MISMATCH: "before" text not found in file',
      details: {
        searched: before.slice(0, 100),
        fileLength: content.length
      }
    };
  }

  const newContent = content.slice(0, beforeIndex) + after + content.slice(beforeIndex + before.length);

  try {
    writeFileSync(filePath, newContent, 'utf-8');
    return {
      success: true,
      error: null,
      applied: { before, after, location: beforeIndex }
    };
  } catch (err) {
    return { success: false, error: `Write failed: ${err.message}` };
  }
}

export function validateBeforeExists(filePath, before) {
  if (!existsSync(filePath)) {
    return { valid: false, error: `File not found: ${filePath}` };
  }

  const content = readFileSync(filePath, 'utf-8');
  if (!content.includes(before)) {
    return {
      valid: false,
      error: 'before text not found in file',
      searched: before.slice(0, 100),
      found: false
    };
  }

  return { valid: true, error: null };
}

export function extractTargetContext(content, target, radius = MAX_CONTEXT_LINES) {
  const lines = content.split('\n');
  const targetLower = target.toLowerCase();

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes(targetLower) ||
        lines[i].toLowerCase().includes(`function ${targetLower}`)) {

      const start = Math.max(0, i - radius);
      const end = Math.min(lines.length, i + radius + 1);

      return {
        found: true,
        lineStart: i,
        lineEnd: end,
        context: lines.slice(start, end).join('\n'),
        beforeContext: lines.slice(start, i).join('\n'),
        afterContext: lines.slice(i + 1, end).join('\n')
      };
    }
  }

  return { found: false };
}

export function generateMinimalDiff(oldContent, newContent, target) {
  const extract = extractTargetContext(oldContent, target);
  if (!extract.found) {
    return null;
  }

  return {
    before: extract.beforeContext,
    after: extract.afterContext,
    location: `line ${extract.lineStart}-${extract.lineEnd}`
  };
}

export function patchToFilePatch(patch) {
  // Convert old format to new format
  if (patch.before && patch.after) {
    return patch;
  }

  // Old format had "content" instead of "before"/"after"
  return {
    action: patch.type || 'replace',
    file: patch.file,
    target: patch.target,
    before: patch.content || '',
    after: patch.content || ''
  };
}
