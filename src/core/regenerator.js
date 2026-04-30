import { callWithJsonRetry } from '../llm.js';

const SYSTEM_PROMPT = `Fix the code based on the following review:

Original code:
{{generated_code}}

Review feedback:
{{critique}}

Return ONLY corrected code as JSON:
{
  "file": "path/to/file.php",
  "patch": {
    "type": "create|replace|insert",
    "target": "function/class name or anchor",
    "content": "the corrected code"
  },
  "summary": "description of fixes"
}`;

export async function regenerate(generatedCode, critique, task) {
  const result = await callWithJsonRetry({
    role: 'coder',
    prompt: `Fix the code based on this review:

Critique: ${critique.join('; ')}

Original code:
\`\`\`
${generatedCode}
\`\`\`

Task: "${task}"`,
    systemPrompt: SYSTEM_PROMPT
  });

  return {
    file: result.file || 'unknown.php',
    patch: result.patch || { type: 'replace', target: '', content: result.content || generatedCode },
    summary: result.summary || 'Code regenerated based on critique',
    raw: result
  };
}