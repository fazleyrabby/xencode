import { callWithJsonRetry } from '../llm.js';

const SYSTEM_PROMPT = `You are a code patch generator. Given a user query, plan, and code context, produce a minimal patch.

Output STRICT JSON only:
{
  "file": "path/to/file.ext",
  "action": "create|patch",
  "patch": {
    "type": "create|replace|insert",
    "target": "function/class name or anchor (if applicable)",
    "content": "the code to add or replace with"
  },
  "summary": "short description of changes"
}

Patch types:
- create: new file, "content" is the full file content
- replace: replace an existing function/block, "target" is the function name to replace, "content" is the new implementation
- insert: insert new code after an anchor, "target" is the anchor (e.g., "function __construct"), "content" is the new code

CRITICAL FORMATTING RULES:
- Code MUST be properly formatted with correct indentation
- Use 4 spaces for PHP, 2 spaces for JS/TS
- Each statement on its own line — NO compacted/minified code
- Include proper line breaks between functions, methods, and logic blocks
- Opening braces on the same line (Laravel/PSR-12 style for PHP)
- Closing braces on their own line
- Blank lines between methods and logical sections
- Match the existing code style from the provided context

Rules:
- Prefer minimal changes
- Include necessary imports/use statements
- Match existing code style from context
- NO markdown backticks in the JSON content value
- Escape all quotes and newlines properly for JSON
- Valid JSON only, no explanation`;

export async function generatePatch(query, planResult, context, existingFileContent) {
  let prompt = `User query: "${query}"

Plan:
- Intent: ${planResult.intent}
- Target: ${planResult.target}
- Search queries: ${planResult.search_queries.join(', ')}

Retrieved context:
${context}`;

  if (existingFileContent) {
    prompt += `\n\nExisting file content (match this style):\n\`\`\`\n${existingFileContent}\n\`\`\``;
  }

  const result = await callWithJsonRetry({
    role: 'coder',
    prompt,
    systemPrompt: SYSTEM_PROMPT
  });

  if (!result.file) {
    throw new Error('Coder output missing required "file" field');
  }
  if (!result.action || !['create', 'patch'].includes(result.action)) {
    result.action = 'patch';
  }
  if (!result.patch || !result.patch.type || !['create', 'replace', 'insert'].includes(result.patch.type)) {
    result.patch = { type: 'create', target: '', content: result.patch?.content || '' };
  }
  if (!result.patch.content) {
    result.patch.content = '';
  }

  return result;
}
