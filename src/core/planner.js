import { callWithJsonRetry } from '../llm.js';

const SYSTEM_PROMPT = `You are an expert software planner for Laravel codebases.

Analyze the user request and produce a STRICT plan.

Return JSON ONLY:

{
  "intent": "create|modify|refactor|debug",
  "files": ["app/Path/File.php"],
  "search_queries": ["query1", "query2"],
  "steps": ["step1", "step2"],
  "risks": [],
  "confidence": 0.0-1.0
}

Rules:
- files MUST be existing files (no hallucinated paths)
- search_queries should find relevant code
- confidence reflects plan certainty (lower = more uncertain)
- intent determines action type`;

export async function planner(query) {
  const result = await callWithJsonRetry({
    role: 'planner',
    prompt: `User query: "${query}"`,
    systemPrompt: SYSTEM_PROMPT
  });

  const defaults = {
    intent: 'modify',
    files: [],
    search_queries: [query],
    steps: [],
    risks: [],
    confidence: 0.5
  };

  return {
    intent: ['create', 'modify', 'refactor', 'debug'].includes(result.intent) ? result.intent : defaults.intent,
    files: Array.isArray(result.files) ? result.files : defaults.files,
    search_queries: Array.isArray(result.search_queries) && result.search_queries.length > 0
      ? result.search_queries
      : defaults.search_queries,
    steps: Array.isArray(result.steps) ? result.steps : defaults.steps,
    risks: Array.isArray(result.risks) ? result.risks : defaults.risks,
    confidence: typeof result.confidence === 'number' ? result.confidence : defaults.confidence
  };
}
