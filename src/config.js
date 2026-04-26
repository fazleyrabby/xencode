export const LLM_URL = process.env.LLM_URL || 'http://127.0.0.1:8080';
export const LLM_MODEL = process.env.LLM_MODEL || '';
export const LLM_MODEL_PLANNER = process.env.LLM_MODEL_PLANNER || LLM_MODEL;
export const LLM_MODEL_CODER = process.env.LLM_MODEL_CODER || LLM_MODEL;
export const LLM_MODEL_REVIEWER = process.env.LLM_MODEL_REVIEWER || LLM_MODEL;
