import { LLM_URL, LLM_MODEL } from './config.js';

export async function queryLLM(prompt) {
  const body = {
    messages: [
      { role: 'system', content: 'You are a coding assistant. Use ONLY the provided code context. If changes are required, explain clearly and provide exact updated code.' },
      { role: 'user', content: prompt }
    ],
    max_tokens: 1024,
    temperature: 0.3
  };

  if (LLM_MODEL) {
    body.model = LLM_MODEL;
  }

  const response = await fetch(`${LLM_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`LLM request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || JSON.stringify(data);
}