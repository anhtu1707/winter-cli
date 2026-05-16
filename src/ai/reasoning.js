/**
 * Reasoning Configuration Manager
 * 
 * Controls reasoning effort / extended thinking per provider and task complexity.
 * 
 * Supported APIs:
 * - OpenAI: reasoning_effort ("low" | "medium" | "high") — o1, o3 models
 * - Anthropic: thinking ({ type: "enabled", budget_tokens: number }) — Claude 3.7+ Sonnet
 * - DeepSeek: built-in CoT reasoning (no explicit param needed)
 * - Others: falls back to prompt-level reasoning instructions
 */

import { isSmallModel } from './model-capabilities.js';

export const REASONING_LEVELS = {
  NONE: 'none',
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  MAX: 'max',
};

const REASONING_EFFORT_MAP = {
  [REASONING_LEVELS.NONE]: null,
  [REASONING_LEVELS.LOW]: 'low',
  [REASONING_LEVELS.MEDIUM]: 'medium',
  [REASONING_LEVELS.HIGH]: 'high',
  [REASONING_LEVELS.MAX]: 'high',
};

const EXTENDED_THINKING_BUDGET_MAP = {
  [REASONING_LEVELS.NONE]: null,
  [REASONING_LEVELS.LOW]: 1024,
  [REASONING_LEVELS.MEDIUM]: 4096,
  [REASONING_LEVELS.HIGH]: 8192,
  [REASONING_LEVELS.MAX]: 16384,
};

/**
 * Standard reasoning prompt templates for API-level reasoning models.
 */
/**
 * Unified deep reasoning prompts — ALL models use these aggressive templates.
 * Every model, regardless of size, must think step by step with explicit structure.
 * The structured <thinking> format forces deep reasoning, catches edge cases,
 * and produces significantly higher quality code.
 */
const REASONING_PROMPT_TEMPLATES = {
  [REASONING_LEVELS.NONE]: '',
  [REASONING_LEVELS.LOW]:
    'Think briefly before acting. Keep the final answer concise.',
  [REASONING_LEVELS.MEDIUM]:
    'Before editing: identify relevant files, make the smallest change, then verify. Do not show long reasoning.',
  [REASONING_LEVELS.HIGH]:
    'Use a private reasoning plan: understand the request, inspect evidence, implement surgically, verify with commands, then summarize.',
  [REASONING_LEVELS.MAX]:
    'For complex work, maintain a private checklist covering requirements, files, risks, implementation, and verification. Show only useful results.',
};

/**
 * Maps task complexity to recommended reasoning level.
 */
export function complexityToReasoningLevel(taskType) {
  switch (taskType) {
    case 'quick': return REASONING_LEVELS.NONE;
    case 'simple': return REASONING_LEVELS.LOW;
    case 'moderate': return REASONING_LEVELS.MEDIUM;
    case 'complex': return REASONING_LEVELS.HIGH;
    case 'deep': return REASONING_LEVELS.MAX;
    default: return REASONING_LEVELS.MEDIUM;
  }
}

export class ReasoningConfig {
  /**
   * @param {object} options
   * @param {string} options.level - One of REASONING_LEVELS
   * @param {string} options.provider - Provider name (for API-specific config)
   * @param {string} [options.modelTier] - Model capability tier from model-capabilities.js
   * @param {object} [options.modelInfo] - Model metadata
   * @param {object} [options.taskInfo] - Task classification result from task-classifier
   */
  constructor(options = {}) {
    this.level = options.level || REASONING_LEVELS.MEDIUM;
    this.provider = options.provider || '';
    this.modelTier = options.modelTier || null;
    this.modelInfo = options.modelInfo || {};
    this.taskInfo = options.taskInfo || null;
  }

  /**
   * Whether reasoning is enabled at all.
   */
  get enabled() {
    return this.level !== REASONING_LEVELS.NONE && this.level !== null;
  }

  /**
   * Whether this level should inject reasoning instructions into the system prompt.
   */
  get needsPromptInjection() {
    return this.providerSupportsApiReasoning === false || !this.provider;
  }

  /**
   * Check if provider has native API-level reasoning support.
   */
  get providerSupportsApiReasoning() {
    const p = (this.provider || '').toLowerCase();
    if (p === 'openai') return true;
    if (p === 'anthropic' || p === 'claude') return true;
    return false;
  }

  /**
   * Whether this is a small model that needs aggressive prompting.
   */
  get isSmall() {
    return this.modelTier ? isSmallModel(this.modelTier) : false;
  }

  /**
   * Get the API-level reasoning parameter for the request body.
   * Returns null if provider doesn't support API reasoning or level is NONE.
   */
  getApiReasoningParam() {
    if (!this.enabled) return null;

    const p = (this.provider || '').toLowerCase();

    if (p === 'openai') {
      const effort = REASONING_EFFORT_MAP[this.level];
      if (!effort) return null;
      return { reasoning_effort: effort };
    }

    if (p === 'anthropic' || p === 'claude') {
      const budget = EXTENDED_THINKING_BUDGET_MAP[this.level];
      if (!budget) return null;
      return {
        thinking: {
          type: 'enabled',
          budget_tokens: budget,
        },
      };
    }

    return null;
  }

  /**
   * Get reasoning prompt instructions to inject into the system prompt.
   * Compact prompt-level reasoning instructions for providers without API reasoning.
   * @param {string} [modelTier] - Unused, kept for backward compatibility.
   * @returns {string}
   */
  getPromptInstructions(modelTier) {
    if (!this.enabled || this.providerSupportsApiReasoning) return '';
    return REASONING_PROMPT_TEMPLATES[this.level] || '';
  }

  /**
   * Build a reasoning config for a given provider and task info.
   */
  static fromTask(taskInfo, provider, options = {}) {
    const level = options.reasoningLevel
      || (taskInfo ? complexityToReasoningLevel(taskInfo.type) : REASONING_LEVELS.MEDIUM);

    return new ReasoningConfig({
      level,
      provider: provider || '',
      taskInfo: taskInfo || null,
      ...options,
    });
  }
}

/**
 * Default reasoning configuration for the system.
 */
export const DEFAULT_REASONING_CONFIG = {
  defaultLevel: REASONING_LEVELS.MEDIUM,
  maxBudgetTokens: 16384,
  // Per-provider overrides
  providers: {
    openai: { supports: true, paramType: 'reasoning_effort' },
    anthropic: { supports: true, paramType: 'thinking' },
    claude: { supports: true, paramType: 'thinking' },
  },
};
