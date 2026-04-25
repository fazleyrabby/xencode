import { LLM_URL } from './config.js';

export async function queryLLM(prompt) {
  const response = await fetch(LLM_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      prompt,
      max_tokens: 512
    })
  });

  if (!response.ok) {
    throw new Error(`LLM request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.text || data.response || data.output || JSON.stringify(data);
}
