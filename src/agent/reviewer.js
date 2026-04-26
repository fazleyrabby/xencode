import { callWithJsonRetry } from '../llm.js';

const SYSTEM_PROMPT = `You are a code reviewer. Validate a proposed patch against the user's original request.

Output STRICT JSON only:
{
  "valid": true|false,
  "issues": ["issue1", "issue2"],
  "suggested_fix": "description of fix needed (if invalid)"
}

Rules:
- Check if the patch addresses the user's request
- Check for obvious syntax errors or missing imports
- Check if the patch is minimal and focused
- If valid, issues can be empty array
- If invalid, provide clear issues and suggested fix
- Valid JSON only, no explanation`;

export async function review(query, patchResult, existingContent, maxRetries = 2) {
  let currentPatch = patchResult;
  let retryCount = 0;

  while (retryCount < maxRetries) {
    const prompt = `User query: "${query}"

Proposed patch:
- File: ${currentPatch.file}
- Action: ${currentPatch.action}
- Type: ${currentPatch.patch?.type}
- Target: ${currentPatch.patch?.target}
- Content:
\`\`\`
${currentPatch.patch?.content}
\`\`\`

${existingContent ? `Existing file content:\n\`\`\`\n${existingContent}\n\`\`\`` : ''}`;

    const result = await callWithJsonRetry({
      role: 'reviewer',
      prompt,
      systemPrompt: SYSTEM_PROMPT
    });

    if (result.valid !== false) {
      return { valid: true, issues: [], suggested_fix: '', patch: currentPatch };
    }

    if (retryCount < maxRetries - 1) {
      const feedbackPrompt = `Previous patch was rejected. Reviewer feedback:
Issues: ${result.issues.join('; ')}
Suggested fix: ${result.suggested_fix}

Generate a corrected patch for the same query: "${query}"

Previous patch content:
${currentPatch.patch?.content}`;

      const { callModel } = await import('../llm.js');
      const coderModule = await import('./coder.js');
      currentPatch = await coderModule.generatePatch(feedbackPrompt, {
        intent: 'update',
        search_queries: ['fix'],
        target: currentPatch.file
      }, '', existingContent);
      retryCount++;
    } else {
      return { valid: false, issues: result.issues, suggested_fix: result.suggested_fix, patch: currentPatch };
    }
  }

  return { valid: false, issues: ['Max retries exceeded'], suggested_fix: '', patch: currentPatch };
}
