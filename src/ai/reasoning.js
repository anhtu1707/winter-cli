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
    'Think step by step before responding. Use <thinking> tags for your reasoning, then provide your answer.',
  [REASONING_LEVELS.MEDIUM]:
    'CRITICAL: You MUST think step by step inside <thinking> tags before every response.\n' +
    '\n' +
    '<thinking>\n' +
    '1. What is the user asking for? (restate briefly)\n' +
    '2. What do I know / what files do I need?\n' +
    '3. What is the correct approach?\n' +
    '4. What could go wrong? (edge cases, errors)\n' +
    '5. How do I verify my solution?\n' +
    '</thinking>\n' +
    'Then provide your answer clearly and directly.',
  [REASONING_LEVELS.HIGH]:
    'CRITICAL DEEP REASONING REQUIRED. Use this EXACT structured thinking process:\n' +
    '\n' +
    '<thinking>\n' +
    '## STEP 1: UNDERSTAND\n' +
    '- Restate the problem in your own words\n' +
    '- Identify all key requirements (explicit + implicit)\n' +
    '\n' +
    '## STEP 2: ANALYZE\n' +
    '- What information is provided? What is missing?\n' +
    '- Consider multiple approaches\n' +
    '- List potential edge cases and pitfalls\n' +
    '\n' +
    '## STEP 3: PLAN\n' +
    '- Outline your solution step by step\n' +
    '- For code: plan the exact files and changes needed\n' +
    '- Verify each step makes sense\n' +
    '\n' +
    '## STEP 4: VERIFY\n' +
    '- Check your solution against all requirements\n' +
    '- Look for mistakes, regressions, or missing pieces\n' +
    '- How will you confirm it works?\n' +
    '</thinking>\n' +
    'After thinking, provide your final answer. The thinking is internal — be concise in your response.',
  [REASONING_LEVELS.MAX]:
    '## MANDATORY DEEP REASONING\n' +
    'You MUST do extremely thorough reasoning before every response. Do not skip any step.\n' +
    '\n' +
    'Follow this EXACT thinking structure — fill out every section:\n' +
    '\n' +
    '<thinking>\n' +
    '## PROBLEM RESTATEMENT\n' +
    'State what the user needs in one sentence.\n' +
    '\n' +
    '## REQUIREMENTS ANALYSIS\n' +
    '- Explicit requirements:\n' +
    '- Implicit requirements:\n' +
    '- Constraints / boundaries:\n' +
    '\n' +
    '## CONTEXT & CODEBASE ANALYSIS\n' +
    '- What files are relevant?\n' +
    '- What existing patterns should I follow?\n' +
    '- What assumptions am I making?\n' +
    '\n' +
    '## APPROACH COMPARISON\n' +
    '- Option 1: [describe]\n' +
    '  Pros: ... Cons: ...\n' +
    '- Option 2: [describe]\n' +
    '  Pros: ... Cons: ...\n' +
    '- Best choice: [pick and explain why]\n' +
    '\n' +
    '## IMPLEMENTATION PLAN\n' +
    'Step-by-step what needs to happen:\n' +
    '1. ...\n' +
    '2. ...\n' +
    '3. ...\n' +
    '(For code: include exact files to read, edit, or create)\n' +
    '\n' +
    '## EDGE CASES & RISKS\n' +
    '- What could go wrong?\n' +
    '- How will I handle errors?\n' +
    '- What about performance / security?\n' +
    '\n' +
    '## VERIFICATION STRATEGY\n' +
    '- How will I confirm this works?\n' +
    '- What tests or checks should be run?\n' +
    '- What could break with these changes?\n' +
    '</thinking>\n' +
    '\n' +
    'After closing </thinking>, provide your final implementation.\n' +
    'Keep the reasoning internal — only show the user your result and a brief summary.',
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
   * ALL models use the unified deep-reasoning templates.
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
