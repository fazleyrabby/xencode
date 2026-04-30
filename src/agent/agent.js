import { runQualityLoop, applyResult } from '../core/agent.js';
import { applyPatch, setBaseDir } from './tool.js';

export async function runAgent(query, options = {}) {
  const { enableReview = false, basePath = process.cwd(), dbPath } = options;

  setBaseDir(basePath);

  const result = await runQualityLoop(query, {
    basePath,
    dbPath,
    enableCritique: enableReview
  });

  if (!result.generated.patch?.content) {
    throw new Error('No patch content generated');
  }

  return {
    plan: result.plan,
    context: result.retrieval.context,
    patch: result.generated,
    diff: result.diff,
    confidence: result.confidence,
    stepStatus: result.stepStatus,
    validation: result.validation,
    critique: result.critique
  };
}

export async function applyAgentPatch(patchResult) {
  // patchResult from runAgent is { file, patch: { type, target, content, before, after }, ... }
  // But app.js logs applyResult.action which comes from applyPatch return
  const result = applyPatch({
    file: patchResult.file,
    patch: patchResult.patch
  });
  // Normalize for logging: always use result.action and result.file
  return {
    action: result.action || patchResult.patch?.type || 'unknown',
    file: result.file || patchResult.file
  };
}