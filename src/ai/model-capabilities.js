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
 * Winter now treats every active model as flagship.
 * @returns {string} One of MODEL_TIERS
 */
export function classifyModelTier(modelName, provider = '') {
  return MODEL_TIERS.FLAGSHIP;
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
