export async function* createStream(response) {
  if (!response.body) {
    yield response;
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        if (buffer.length > 0) {
          yield buffer;
        }
        break;
      }
      
      buffer += decoder.decode(value, { stream: true });
      
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.trim()) {
          yield line;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function streamToConsole(stream, options = {}) {
  const { onChunk = () => {}, prefix = '' } = options;
  let output = '';
  
  for await (const chunk of stream) {
    const text = typeof chunk === 'string' ? chunk : JSON.stringify(chunk);
    output += text;
    if (prefix) {
      process.stdout.write(prefix);
    }
    process.stdout.write(text);
    onChunk(text);
  }
  
  return output;
}

export async function streamJSON(stream) {
  let buffer = '';
  
  for await (const chunk of stream) {
    buffer += typeof chunk === 'string' ? chunk : JSON.stringify(chunk);
  }
  
  const jsonStart = buffer.indexOf('{');
  const jsonEnd = buffer.lastIndexOf('}');
  
  if (jsonStart !== -1 && jsonEnd !== -1) {
    return JSON.parse(buffer.substring(jsonStart, jsonEnd + 1));
  }
  
  return null;
}

export function createChunkCollector() {
  let chunks = [];
  let fullText = '';
  
  return {
    collect(chunk) {
      const text = typeof chunk === 'string' ? chunk : JSON.stringify(chunk);
      chunks.push(chunk);
      fullText += text;
      return text;
    },
    getText() {
      return fullText;
    },
    getChunks() {
      return chunks;
    },
    clear() {
      chunks = [];
      fullText = '';
    }
  };
}