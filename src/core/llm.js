import { LLM_URL, LLM_MODEL, LLM_MODEL_PLANNER, LLM_MODEL_CODER, LLM_MODEL_REVIEWER } from './config.js';

const ROLE_MODELS = {
  planner: LLM_MODEL_PLANNER,
  coder: LLM_MODEL_CODER,
  reviewer: LLM_MODEL_REVIEWER,
  default: LLM_MODEL
};

const ROLE_CONFIG = {
  planner: { max_tokens: 512, temperature: 0.1 },
  coder: { max_tokens: 8192, temperature: 0.2 },
  reviewer: { max_tokens: 1024, temperature: 0.1 },
  default: { max_tokens: 1024, temperature: 0.3 }
};

export async function callModel({ role, prompt, systemPrompt }) {
  const model = ROLE_MODELS[role] || ROLE_MODELS.default;
  const config = ROLE_CONFIG[role] || ROLE_CONFIG.default;

  const messages = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  const body = {
    messages,
    max_tokens: config.max_tokens,
    temperature: config.temperature
  };

  if (model) {
    body.model = model;
  }

  const response = await fetch(`${LLM_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`LLM request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || JSON.stringify(data);
}

export async function queryLLM(prompt) {
  return callModel({ role: 'default', prompt });
}

export async function callWithJsonRetry({ role, prompt, systemPrompt, maxRetries = 2 }) {
  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await callModel({ role, prompt, systemPrompt });
      const cleaned = response.trim();
      const jsonStart = cleaned.indexOf('{');
      const jsonEnd = cleaned.lastIndexOf('}');
      if (jsonStart === -1 || jsonEnd === -1) {
        throw new Error('No JSON found in response');
      }
      const jsonStr = cleaned.substring(jsonStart, jsonEnd + 1);
      return JSON.parse(jsonStr);
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries - 1) {
        prompt = `Your previous response was not valid JSON. Please respond with valid JSON only.\n\nError: ${err.message}\n\nOriginal prompt:\n${prompt}`;
      }
    }
  }
  throw new Error(`Failed to get valid JSON after ${maxRetries} attempts: ${lastError.message}`);
}

/**
 * Streaming completion for MLX-compatible endpoints.
 * Uses /v1/completions (not chat/completions) for true streaming.
 */
export async function* streamComplete(prompt, options = {}) {
  const {
    model = LLM_MODEL,
    max_tokens = 512,
    temperature = 0.2,
    systemPrompt = ''
  } = options;

  const body = {
    prompt: systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt,
    max_tokens,
    temperature,
    stream: true
  };

  if (model) {
    body.model = model;
  }

  const response = await fetch(`${LLM_URL}/v1/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`LLM streaming request failed: ${response.status} ${response.statusText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') {
            yield null; // signal end
            return;
          }
          try {
            const parsed = JSON.parse(data);
            const token = parsed.choices?.[0]?.text || parsed.choices?.[0]?.delta?.content || '';
            if (token) {
              yield token;
            }
          } catch {
            // skip malformed JSON lines
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Collect streamed tokens into a string.
 */
export async function collectStream(stream) {
  let text = '';
  for await (const token of stream) {
    if (token === null) break;
    text += token;
  }
  return text;
}
