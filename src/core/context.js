const MAX_CONTEXT_TOKENS = 4000;

export function buildContext(session, retrieved, options = {}) {
  const { maxTokens = MAX_CONTEXT_TOKENS, includeHistory = false } = options;
  
  const parts = [];
  
  if (session.lastContext && includeHistory) {
    const historyPart = `[Previous Context]\n${session.lastContext}`;
    parts.push(historyPart);
  }
  
  if (retrieved && retrieved.length > 0) {
    const currentPart = `[Current Retrieval]\n${formatChunks(retrieved)}`;
    parts.push(currentPart);
  }
  
  if (session.memory.conventions && Object.keys(session.memory.conventions).length > 0) {
    const conventionsPart = `[Project Conventions]\n${formatConventions(session.memory.conventions)}`;
    parts.push(conventionsPart);
  }
  
  if (session.workingFiles && session.workingFiles.size > 0) {
    const workingPart = `[Working Files]\n${Array.from(session.workingFiles).join('\n')}`;
    parts.push(workingPart);
  }
  
  const merged = parts.join('\n\n---\n\n');
  const tokens = estimateTokens(merged);
  
  if (tokens > maxTokens) {
    return truncateContext(merged, maxTokens);
  }
  
  return merged;
}

export function updateSessionContext(session, context) {
  session.lastContext = context;
}

export function addToHistory(session, entry) {
  session.history.push({
    ...entry,
    timestamp: Date.now()
  });
  
  if (session.history.length > 50) {
    session.history = session.history.slice(-50);
  }
}

function formatChunks(chunks) {
  if (typeof chunks === 'string') return chunks;
  
  const grouped = new Map();
  
  for (const chunk of chunks) {
    if (!grouped.has(chunk.file)) {
      grouped.set(chunk.file, []);
    }
    grouped.get(chunk.file).push(chunk);
  }
  
  const lines = [];
  for (const [file, fileChunks] of grouped) {
    lines.push(`## ${file}`);
    for (const chunk of fileChunks) {
      lines.push(`### ${chunk.type}: ${chunk.name}`);
      lines.push('```');
      lines.push(chunk.code_full || chunk.code || '');
      lines.push('```');
    }
    lines.push('');
  }
  
  return lines.join('\n');
}

function formatConventions(conventions) {
  const lines = [];
  for (const [key, value] of Object.entries(conventions)) {
    lines.push(`- ${key}: ${value}`);
  }
  return lines.join('\n');
}

function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

function truncateContext(context, maxTokens) {
  const lines = context.split('\n');
  const result = [];
  let tokens = 0;
  
  for (const line of lines) {
    const lineTokens = estimateTokens(line);
    if (tokens + lineTokens > maxTokens - 100) {
      result.push(`... (truncated, ${lines.length - result.length} lines remaining)`);
      break;
    }
    result.push(line);
    tokens += lineTokens;
  }
  
  return result.join('\n');
}

export function packContext(parts) {
  return parts.filter(Boolean).join('\n\n---\n\n');
}

export function unpackContext(context) {
  if (!context) return [];
  
  return context.split('\n\n---\n\n').filter(Boolean);
}