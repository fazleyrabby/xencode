export function score(retrievalScore, planCompleteness, validationPass, critiqueClean) {
  const retrievalComponent = (retrievalScore || 0) * 0.4;
  const planComponent = (planCompleteness || 0) * 0.2;
  const validationComponent = validationPass ? 0.2 : 0;
  const critiqueComponent = critiqueClean ? 0.2 : 0;
  
  const total = retrievalComponent + planComponent + validationComponent + critiqueComponent;
  
  return {
    total: Math.round(total * 100) / 100,
    retrieval: retrievalComponent,
    plan: planComponent,
    validation: validationComponent,
    critique: critiqueComponent,
    level: total > 0.8 ? 'HIGH' : total >= 0.5 ? 'MEDIUM' : 'LOW'
  };
}

export function levelLabel(level) {
  switch (level) {
    case 'HIGH':
      return '✅ High confidence - apply normally';
    case 'MEDIUM':
      return '⚠️ Medium confidence - review carefully';
    case 'LOW':
      return '❌ Low confidence - consider stronger model';
    default:
      return 'Unknown';
  }
}

export function planCompleteness(plan) {
  if (!plan) return 0;

  let score = 0;

  if (plan.intent && ['create', 'modify', 'refactor', 'debug'].includes(plan.intent)) {
    score += 0.2;
  }
  if ((plan.files || plan.target_files || []).length > 0) {
    score += 0.2;
  }
  if (plan.search_queries && plan.search_queries.length > 0) {
    score += 0.2;
  }
  if (plan.steps && plan.steps.length > 0) {
    score += 0.2;
  }
  if (plan.risks && plan.risks.length > 0) {
    score += 0.2;
  }

  return score;
}