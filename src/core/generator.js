import { callWithJsonRetry } from '../llm.js';
import { readFile } from '../tools/file.js';

const SYSTEM_PROMPT = `You are a precise Laravel coding agent.

Task: Generate a MINIMAL patch. Modify ONLY the necessary lines.

Return JSON ONLY. No explanation.

Schema:
{
  "file": "app/Path/File.php",
  "target": "functionName",
  "before": "exact existing code to replace",
  "after": "new code to replace with"
}

Rules:
- before MUST match existing code exactly (including whitespace)
- Do NOT rewrite entire files
- Preserve indentation and style
- JSON only, no markdown`;

export async function generate(task, plan, context) {
  const planStr = JSON.stringify(plan, null, 2);

  // If we have target files, include their full content
  let fileContext = '';
  const targetFiles = plan.files || plan.target_files || [];
  if (targetFiles.length > 0) {
    const targetFile = targetFiles[0];
    const result = readFile(targetFile);
    if (result.success) {
      fileContext = `\n\n## Target file content:\n\`\`\`\n${result.content}\n\`\`\``;
    }
  }

  const prompt = `Task: "${task}"

Plan:
${planStr}

## Rules
- Modify ONLY the specified target
- before MUST match existing code exactly
- Do NOT reformat or change unrelated lines

## Context
${context}${fileContext}

## Output
Return valid JSON only:`;

  const result = await callWithJsonRetry({
    role: 'coder',
    prompt,
    systemPrompt: SYSTEM_PROMPT
  });

  // Normalize to patch format for backward compatibility
  const file = result.file || 'unknown.php';
  const before = result.before ?? '';
  const after = result.after ?? '';

  // Handle both new format (before/after) and old format (patch.content)
  let patchContent;
  const hasBeforeAfter = before !== undefined && after !== undefined && after;
  if (hasBeforeAfter) {
    patchContent = after;
  } else if (result.patch?.content) {
    patchContent = result.patch.content;
  } else {
    patchContent = '';
  }

  return {
    file,
    patch: {
      type: result.action || (before && after ? 'replace' : 'create'),
      target: result.target || '',
      content: patchContent,
      before,
      after
    },
    summary: result.summary || '',
    raw: result
  };
}
