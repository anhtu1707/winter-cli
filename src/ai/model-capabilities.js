/**
 * ❄️ MODEL CAPABILITIES ❄️
 * Detect AI model capability tier from model name.
 * Small models need aggressive prompting to compete with large ones.
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
 * @param {string} modelName - e.g. "llama3", "gpt-4", "qwen2.5:7b"
 * @param {string} [provider] - e.g. "ollama", "openai" (optional, helps disambiguate)
 * @returns {string} One of MODEL_TIERS
 */
export function classifyModelTier(modelName, provider = '') {
  const name = (modelName || '').toLowerCase().trim();
  const prov = (provider || '').toLowerCase().trim();

  // ===== FLAGSHIP (frontier models) =====
  const flagshipPatterns = [
    /claude-3-5-sonnet/i, /claude-opus/i, /claude-4/i, /claude-sonnet-4/i,
    /gpt-4o/i, /gpt-4-turbo/i, /o1/i, /o3/i,
    /gemini-2\.5-pro/i, /gemini-2\.0-ultra/i,
    /minimax-?m2\.5/i, /minimax.*m2\.5/i, /minimax/i,
    /deepseek-v3/i, /deepseek-r1/i,
    /llama-4/i, /llama-3-70b/i, /llama3-70b/i, /llama3\.1-70b/i, /llama3\.2-90b/i, /llama3\.3/i,
    /qwen2\.5-?72b/i, /qwen2\.5-?70b/i, /qwen-?2\.5-?72b/i,
    /mistral-large/i, /mixtral-8x22b/i,
    /command-r-plus/i, /command-a/i,
    /yi-?34b/i,
    /dbrx-instruct/i,
  ];

  // If using a cloud provider like OpenAI/Anthropic/Groq, their default models are typically large+
  if (prov === 'openai' || prov === 'anthropic' || prov === 'claude') {
    if (name.includes('gpt-3.5') || name.includes('gpt-3')) return MODEL_TIERS.MEDIUM;
    if (name.includes('claude-3-haiku') || name.includes('claude-3-5-haiku')) return MODEL_TIERS.MEDIUM;
    return MODEL_TIERS.LARGE; // Default for OpenAI/Anthropic is >= gpt-4 level
  }

  if (prov === 'groq') {
    // Groq runs open models, most are large but some are not
    if (/llama.*8b|llama3.*8b|llama3\.2.*3b/i.test(name)) return MODEL_TIERS.SMALL;
    if (/gemma2.*9b/i.test(name)) return MODEL_TIERS.SMALL;
    if (/mixtral-8x7|llama.*70b|llama3.*70b|llama3\.1.*70b|qwen/i.test(name)) return MODEL_TIERS.LARGE;
    return MODEL_TIERS.MEDIUM; // Default for Groq
  }

  // Check patterns for any provider
  for (const pattern of flagshipPatterns) {
    if (pattern.test(name)) return MODEL_TIERS.FLAGSHIP;
  }

  // ===== LARGE MODELS =====
  const largePatterns = [
    /claude-sonnet/i, /claude-3/i, /claude-2/i,
    /gpt-4/i, /gpt-4-32k/i,
    /llama-3\.1-?70b/i, /llama-3\.2-?70b/i, /llama3-?70b/i,
    /llama-2-?70b/i,
    /qwen-?2\.5-?32b/i, /qwen-?2-?72b/i,
    /codellama-?70b/i,
    /mixtral/i,
    /deepseek-?v2/i,
    /gemini-1\.5-pro/i, /gemini-2\.0-flash/i,
    /command-r/i,
    /yi-?34b/i,
    /mistral-medium/i,
  ];

  for (const pattern of largePatterns) {
    if (pattern.test(name)) return MODEL_TIERS.LARGE;
  }

  // ===== MEDIUM MODELS =====
  const mediumPatterns = [
    /qwen-?2\.5-?14b/i, /qwen-?2\.5-?7b/i, /qwen-?2/i,
    /llama-3-?8b/i, /llama-3\.1-?8b/i, /llama-3\.2-?11b/i,
    /llama-2-?13b/i, /llama-2-?7b/i,
    /deepseek-coder-?6\.7b/i, /deepseek-coder-?33b/i,
    /codellama-?34b/i, /codellama-?13b/i, /codellama-?7b/i,
    /mistral/i, /mistral-7b/i,
    /gemma-2-?9b/i, /gemma-?7b/i,
    /phi-3/i, /phi-3-medium/i,
    /nemotron/i,
    /solar/i,
    /dbrx/i,
    /starcoder2/i,
    /deepseek-llm/i,
    /yi-?6b/i, /yi-?9b/i,
  ];

  for (const pattern of mediumPatterns) {
    if (pattern.test(name)) return MODEL_TIERS.MEDIUM;
  }

  // ===== SMALL MODELS =====
  const smallPatterns = [
    /llama-3\.2-?3b/i, /llama-3\.2-?1b/i, /tinyllama/i,
    /qwen-?2\.5-?3b/i, /qwen-?2\.5-?1\.5b/i, /qwen-?2\.5-?0\.5b/i,
    /phi-?3-?mini/i, /phi-?2/i, /phi-?1/i,
    /gemma-?2-?2b/i,
    /stablelm/i,
    /orca/i,
    /falcon/i,
    /red-pajama/i,
    /pythia/i,
    /opt/i,
    /bloom/i,
    /mpnet/i,
  ];

  for (const pattern of smallPatterns) {
    if (pattern.test(name)) return MODEL_TIERS.SMALL;
  }

  if (/\btiny\b/i.test(name) || /(?:^|[-_:/])mini(?:$|[-_:/])/i.test(name) || /\bsmall\b/i.test(name) || /\bnano\b/i.test(name)) {
    return MODEL_TIERS.TINY;
  }

  // Fallback: if Ollama, likely small
  if (prov === 'ollama' || prov === 'local') return MODEL_TIERS.SMALL;

  // Default: assume medium
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
