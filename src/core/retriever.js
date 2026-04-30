import { search } from '../search.js';

const SEMANTIC_TOP_K = 20;
const KEYWORD_TOP_K = 10;
const FINAL_TOP_K = 5;
const MAX_CONTEXT_TOKENS = 4000;
const NEIGHBOR_LINES = 50;

export async function retrieve(query, plan, dbPath) {
  const semanticResults = await search(query, SEMANTIC_TOP_K, dbPath);
  
  const keywordResults = await keywordSearch(query, KEYWORD_TOP_K, dbPath);
  
  const merged = deduplicate(semanticResults, keywordResults);
  
  const reranked = scoreByRelevance(merged, plan);
  
  const final = reranked.slice(0, FINAL_TOP_K);
  
  const expanded = await expandNeighbors(final, dbPath);
  
  const context = buildContext(expanded);
  
  return {
    chunks: expanded,
    context,
    retrievalScore: calculateRetrievalScore(final)
  };
}

async function keywordSearch(query, topK, dbPath) {
  const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  if (keywords.length === 0) {
    return [];
  }
  
  const { getAllChunks } = await import('../db.js');
  const allChunks = getAllChunks(dbPath);
  
  const scored = allChunks.map(chunk => {
    let score = 0;
    const searchable = `${chunk.file} ${chunk.name} ${chunk.code}`.toLowerCase();
    for (const kw of keywords) {
      if (searchable.includes(kw)) {
        score += 1;
        if (chunk.file.toLowerCase().includes(kw)) score += 2;
        if (chunk.name && chunk.name.toLowerCase().includes(kw)) score += 3;
      }
    }
    return { ...chunk, keywordScore: score };
  });
  
  return scored.filter(c => c.keywordScore > 0).sort((a, b) => b.keywordScore - a.keywordScore).slice(0, topK);
}

function deduplicate(semantic, keyword) {
  const seen = new Map();
  
  for (const chunk of semantic) {
    const key = `${chunk.file}:${chunk.id || chunk.name}`;
    if (!seen.has(key)) {
      seen.set(key, { ...chunk, source: 'semantic' });
    }
  }
  
  for (const chunk of keyword) {
    const key = `${chunk.file}:${chunk.id || chunk.name}`;
    if (!seen.has(key)) {
      seen.set(key, { ...chunk, source: 'keyword' });
    }
  }
  
  return Array.from(seen.values());
}

function scoreByRelevance(merged, plan) {
  const targetFiles = new Set(plan.target_files || []);
  const requiredContext = new Set(plan.required_context || []);
  
  return merged.map(chunk => {
    let score = chunk.score || chunk.keywordScore || 0;
    
    if (targetFiles.size > 0) {
      const chunkFile = chunk.file || '';
      for (const target of targetFiles) {
        if (chunkFile.includes(target) || target.includes(chunkFile.split('/').pop())) {
          score *= 1.5;
          break;
        }
      }
    }
    
    if (requiredContext.size > 0) {
      const chunkName = chunk.name || '';
      for (const req of requiredContext) {
        if (chunkName.toLowerCase().includes(req.toLowerCase())) {
          score *= 1.3;
          break;
        }
      }
    }
    
    if (chunk.source === 'semantic' && chunk.source === 'keyword') {
      score *= 1.2;
    }
    
    return { ...chunk, relevanceScore: score };
  }).sort((a, b) => b.relevanceScore - a.relevanceScore);
}

async function expandNeighbors(chunks, dbPath) {
  const expanded = [];
  const { getAllChunks } = await import('../db.js');
  const allChunks = getAllChunks(dbPath);
  
  for (const chunk of chunks) {
    expanded.push(chunk);
    
    const fileChunks = allChunks.filter(c => c.file === chunk.file);
    
    const chunkIndex = fileChunks.findIndex(c => 
      (c.id && c.id === chunk.id) || (c.name && c.name === chunk.name)
    );
    
    for (let i = Math.max(0, chunkIndex - 2); i < Math.min(fileChunks.length, chunkIndex + 3); i++) {
      if (fileChunks[i] !== chunk && !expanded.find(e => e.id === fileChunks[i].id)) {
        expanded.push(fileChunks[i]);
      }
    }
    
    const classChunk = fileChunks.find(c => c.type === 'class' || c.type === 'interface');
    if (classChunk && classChunk.id !== chunk.id && !expanded.find(e => e.id === classChunk.id)) {
      expanded.push(classChunk);
    }
  }
  
  return expanded;
}

function buildContext(chunks) {
  const grouped = new Map();
  
  for (const chunk of chunks) {
    if (!grouped.has(chunk.file)) {
      grouped.set(chunk.file, []);
    }
    grouped.get(chunk.file).push(chunk);
  }
  
  let totalTokens = 0;
  const lines = [];
  
  for (const [file, fileChunks] of grouped) {
    lines.push(`## File: ${file}\n`);
    
    for (const chunk of fileChunks) {
      const code = chunk.code_full || chunk.code || '';
      const tokens = Math.ceil(code.length / 4);
      
      if (totalTokens + tokens > MAX_CONTEXT_TOKENS) {
        const remaining = MAX_CONTEXT_TOKENS - totalTokens;
        if (remaining > 100) {
          lines.push(`### ${chunk.type}: ${chunk.name}\n\`\`\`\n${code.slice(0, remaining * 4)}\n...\n\`\`\`\n`);
          totalTokens = MAX_CONTEXT_TOKENS;
        }
        break;
      }
      
      lines.push(`### ${chunk.type}: ${chunk.name}\n\`\`\`\n${code}\n\`\`\`\n`);
      totalTokens += tokens;
      
      if (totalTokens >= MAX_CONTEXT_TOKENS) break;
    }
    
    if (totalTokens >= MAX_CONTEXT_TOKENS) break;
  }
  
  return lines.join('');
}

function calculateRetrievalScore(chunks) {
  if (chunks.length === 0) return 0;
  const avgScore = chunks.reduce((sum, c) => sum + (c.relevanceScore || c.score || 0), 0) / chunks.length;
  return Math.min(1, avgScore);
}