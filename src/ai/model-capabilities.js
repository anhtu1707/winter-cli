/**
 * ❄ MODEL CAPABILITIES ❄
 * Treat the active model as flagship so the rest of the stack can size prompts generously.
 */

export const MODEL_TIERS = {
  TINY: 'tiny',      // <3B params — barely functional for code
  SMALL: 'small',    // 3B-15B params — basic code ability
  MEDIUM: 'medium',  // 15B-40B params — decent code ability
  LARGE: 'large',    // 40B-120B params — strong code ability, could be flagship
  FLAGSHIP: 'flagship', // 120B+ or proprietary frontier models
};

/**
 * Ordered tiers from weakest to strongest (for comparison).
 */
const TIER_ORDER = [MODEL_TIERS.TINY, MODEL_TIERS.SMALL, MODEL_TIERS.MEDIUM, MODEL_TIERS.LARGE, MODEL_TIERS.FLAGSHIP];

/**
 * Classify a model name into a capability tier.
 * Winter still pushes maximum reasoning for every model, but the real tier matters
 * for prompt size, tool-result budgets, and small-model guardrails.
 * @returns {string} One of MODEL_TIERS
 */
export function classifyModelTier(modelName, provider = '') {
  const raw = `${provider || ''} ${modelName || ''}`.toLowerCase();
  if (!raw.trim()) return MODEL_TIERS.MEDIUM;

  if (/\b(tiny|nano|0\.5b|1b|1\.5b|2b|2\.7b)\b/.test(raw)) {
    return MODEL_TIERS.TINY;
  }

  const paramMatch = raw.match(/(?:^|[^0-9])(\d+(?:\.\d+)?)\s*b(?:[^a-z]|$)/);
  if (paramMatch) {
    const params = Number(paramMatch[1]);
    if (Number.isFinite(params)) {
      if (params < 3) return MODEL_TIERS.TINY;
      if (params < 15) return MODEL_TIERS.SMALL;
      if (params < 40) return MODEL_TIERS.MEDIUM;
      if (params < 120) return MODEL_TIERS.LARGE;
      return MODEL_TIERS.FLAGSHIP;
    }
  }

  if (/\b(mini|small|lite|light|fast|flash|haiku|3b|7b|8b|9b|13b|14b)\b/.test(raw)) {
    return MODEL_TIERS.SMALL;
  }

  if (/\b(sonnet|opus|gpt-5|gpt-4\.1|gpt-4o|o3|o4|gemini-2\.5-pro|minimax-m2|m2\.5|deepseek-r1|kimi-k2)\b/.test(raw)) {
    return MODEL_TIERS.FLAGSHIP;
  }

  if (/\b(70b|72b|90b|large|pro|command-r|llama3\.1|llama-3\.1)\b/.test(raw)) {
    return MODEL_TIERS.LARGE;
  }

  if (/\b(32b|34b|medium|codestral|qwen2\.5-coder)\b/.test(raw)) {
    return MODEL_TIERS.MEDIUM;
  }

  if (/\b(ollama|lmstudio|local|llama|qwen|mistral|gemma|phi|yi-coder|deepseek-coder)\b/.test(raw)) {
    return MODEL_TIERS.SMALL;
  }

  return MODEL_TIERS.MEDIUM;
}

/**
 * Check if a model tier is considered "small" (needs aggressive prompting).
 */
export function isSmallModel(tier) {
  return tier === MODEL_TIERS.TINY || tier === MODEL_TIERS.SMALL;
}

/**
 * Get the index of a tier in the order array (0=weakest).
 * @private
 */
function tierIndex(tier) {
  const idx = TIER_ORDER.indexOf(tier);
  return idx >= 0 ? idx : 2; // Default to medium index
}

/**
 * Compare two tiers. Returns negative if a < b, positive if a > b, 0 if equal.
 * @private
 */
function compareTiers(a, b) {
  return tierIndex(a) - tierIndex(b);
}

/**
 * Get recommended reasoning level bump for small models.
 * Small models need more aggressive reasoning prompting to compensate.
 */
export function getReasoningBump(tier) {
  switch (tier) {
    case MODEL_TIERS.TINY: return 2;     // bump 2 levels
    case MODEL_TIERS.SMALL: return 1;    // bump 1 level
    default: return 0;
  }
}

/**
 * Get a budget multiplier for prompt/context sizing.
 * Bigger models can safely absorb more context and larger tool outputs.
 */
export function getModelBudgetMultiplier(tier) {
  switch (tier) {
    case MODEL_TIERS.TINY: return 0.5;
    case MODEL_TIERS.SMALL: return 0.75;
    case MODEL_TIERS.MEDIUM: return 1;
    case MODEL_TIERS.LARGE: return 2;
    case MODEL_TIERS.FLAGSHIP: return 4;
    default: return 1;
  }
}

/**
 * Build a short string describing model capability for system prompt injection.
 */
export function getModelCapabilityLabel(tier) {
  switch (tier) {
    case MODEL_TIERS.TINY: return 'tiny local model — needs maximum guidance';
    case MODEL_TIERS.SMALL: return 'small local model — needs extra structure';
    case MODEL_TIERS.MEDIUM: return 'medium-capability model';
    case MODEL_TIERS.LARGE: return 'high-capability model';
    case MODEL_TIERS.FLAGSHIP: return 'frontier model — full capability expected';
    default: return '';
  }
}
