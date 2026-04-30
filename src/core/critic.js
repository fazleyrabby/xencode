import { callWithJsonRetry } from '../llm.js';

const SYSTEM_PROMPT = `You are a strict senior Laravel code reviewer.

Review the following code:

{{generated_code}}

Check for:
- incorrect assumptions
- missing edge cases
- Laravel convention violations
- potential bugs

Return:
- bullet list of issues
- if no issues, return: NO_ISSUES

Return STRICT JSON:
{
  "issues": ["issue1", "issue2"],
  "critique_clean": true|false
}`;

export async function critic(generatedCode, task, plan) {
  const result = await callWithJsonRetry({
    role: 'reviewer',
    prompt: `Generated code:
\`\`\`
${generatedCode}
\`\`\`

Task: "${task}"

Plan: ${JSON.stringify(plan)}`,
    systemPrompt: SYSTEM_PROMPT
  });

  return {
    issues: Array.isArray(result.issues) ? result.issues : [],
    critiqueClean: result.critique_clean === true && result.issues.length === 0,
    raw: result
  };
}