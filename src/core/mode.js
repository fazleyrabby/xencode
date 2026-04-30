export function classify(input) {
  if (/^(show|find|where|search|list|get)/i.test(input)) return 'RETRIEVE';
  if (/^(explain|why|how|describe|what is)/i.test(input)) return 'EXPLAIN';
  if (/^(fix|update|add|create|refactor|remove|delete|implement)/i.test(input)) return 'MODIFY';
  return 'GENERAL';
}

export function classifyDetailed(input) {
  const mode = classify(input);
  
  let intent = 'general';
  if (/\b(patch|fix|bug)/i.test(input)) intent = 'fix';
  else if (/\b(create|new|add)/i.test(input)) intent = 'create';
  else if (/\b(update|modify|change)/i.test(input)) intent = 'modify';
  else if (/\b(refactor|restructure)/i.test(input)) intent = 'refactor';
  else if (/\b(delete|remove)/i.test(input)) intent = 'delete';
  
  let urgency = 'normal';
  if (/\b(urgent|asap|critical)/i.test(input)) urgency = 'high';
  else if (/\b(maybe|later|someday)/i.test(input)) urgency = 'low';
  
  return { mode, intent, urgency };
}