const MAX_CHUNKS = 5;
const MAX_CODE_LENGTH = 2000;
const MAX_AGENT_CHUNKS = 30;
const MAX_AGENT_CONTEXT_TOKENS = 20000;

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

export function formatAgentContext(chunks, maxTokens = MAX_AGENT_CONTEXT_TOKENS) {
  const limited = chunks.slice(0, MAX_AGENT_CHUNKS);
  const grouped = new Map();
  
  for (const chunk of limited) {
    if (!grouped.has(chunk.file)) {
      grouped.set(chunk.file, []);
    }
    grouped.get(chunk.file).push(chunk);
  }
  
  let totalTokens = 0;
  const formatted = [];
  
  for (const [file, fileChunks] of grouped) {
    let fileContent = `## File: ${file}\n\n`;
    
    for (const chunk of fileChunks) {
      const section = chunk.type === 'function'
        ? `### ${chunk.type}: ${chunk.name}\n\`\`\`\n${chunk.code_full || chunk.code}\n\`\`\`\n`
        : `\`\`\`\n${chunk.code_full || chunk.code}\n\`\`\`\n`;
      
      const sectionTokens = Math.ceil(section.length / 4);
      if (totalTokens + sectionTokens > maxTokens) {
        break;
      }
      
      fileContent += section;
      totalTokens += sectionTokens;
    }
    
    formatted.push(fileContent);
  }
  
  return formatted.join('\n---\n\n');
}
