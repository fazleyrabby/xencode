const MAX_CHUNKS = 5;
const MAX_CODE_LENGTH = 2000;

export function formatContext(chunks) {
  const limited = chunks.slice(0, MAX_CHUNKS);
  
  const formatted = limited.map(chunk => {
    let code = chunk.code;
    if (code.length > MAX_CODE_LENGTH) {
      code = code.slice(0, MAX_CODE_LENGTH) + '\n... [truncated]';
    }
    
    return `File: ${chunk.file}
Type: ${chunk.type}
Name: ${chunk.name}

Code:
${code}`;
  });
  
  return formatted.join('\n\n---\n\n');
}
