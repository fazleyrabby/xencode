import { callWithJsonRetry } from '../llm.js';

const SYSTEM_PROMPT = `You are a code intent parser. Analyze the user query and output STRICT JSON only.

Output format:
{
  "intent": "create|update|explain",
  "search_queries": ["query1", "query2"],
  "target": "file or concept name"
}

Rules:
- intent: "create" for new code, "update" for modifying existing, "explain" for questions
- search_queries: 2-4 specific queries for code retrieval
- target: the main file, function, or concept being referenced
- NO markdown, NO explanation, valid JSON only`;

export async function plan(query) {
  const result = await callWithJsonRetry({
    role: 'planner',
    prompt: `User query: "${query}"`,
    systemPrompt: SYSTEM_PROMPT
  });

  if (!result.intent || !['create', 'update', 'explain'].includes(result.intent)) {
    result.intent = 'update';
  }
  if (!result.search_queries || !Array.isArray(result.search_queries)) {
    result.search_queries = [query];
  }
  if (!result.target) {
    result.target = query;
  }

  return result;
}
