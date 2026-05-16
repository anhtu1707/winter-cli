/**
 * Smart Fallback Strategies - Handle tool failures gracefully.
 * Provides fallback chains, alternative approaches, and recovery strategies.
 */

export class FallbackManager {
  constructor(options = {}) {
    this.fallbacks = new Map();
    this.maxFallbackDepth = options.maxFallbackDepth || 3;
    this.logger = options.logger || console;
  }

  /**
   * Register a fallback strategy for a tool.
   */
  register(toolName, strategies) {
    this.fallbacks.set(toolName, strategies);
    return this;
  }

  /**
   * Execute a tool with fallback support.
   */
  async execute(toolName, input, executor) {
    const strategies = this.fallbacks.get(toolName) || this._defaultStrategies(toolName);
    let lastError;

    for (let depth = 0; depth < strategies.length && depth < this.maxFallbackDepth; depth++) {
      try {
        const strategy = strategies[depth];
        const adaptedInput = strategy.adapt ? strategy.adapt(input) : input;
        const result = await executor(adaptedInput, { fallbackDepth: depth });

        if (result && !result.error) {
          return {
            ...result,
            fallbackDepth: depth,
            strategyUsed: strategy.name || 'primary',
          };
        }

        lastError = result?.error || new Error('Unknown error');
        this.logger.warn(`[Fallback] ${toolName}: strategy "${strategy.name}" failed, trying next...`);
      } catch (error) {
        lastError = error;
        this.logger.warn(`[Fallback] ${toolName}: strategy threw "${error.message}", trying next...`);
      }
    }

    return {
      error: lastError?.message || `All ${strategies.length} fallbacks exhausted for ${toolName}`,
      fallbackDepth: this.maxFallbackDepth,
      strategiesTried: strategies.length,
    };
  }

  /**
   * Default fallback strategies for any tool.
   */
  _defaultStrategies(toolName) {
    return [
      { name: 'original', adapt: (input) => input },
      { name: 'simplified', adapt: (input) => this._simplify(input) },
      { name: 'minimal', adapt: (input) => this._minimize(input) },
    ];
  }

  _simplify(input) {
    if (typeof input === 'object' && input !== null) {
      const simplified = { ...input };
      delete simplified.options;
      delete simplified.verbose;
      if (simplified.timeout && simplified.timeout > 30000) {
        simplified.timeout = 30000;
      }
      return simplified;
    }
    return input;
  }

  _minimize(input) {
    if (typeof input === 'object' && input !== null) {
      const minimized = {};
      if (input.command) minimized.command = input.command;
      if (input.path) minimized.path = input.path;
      if (input.pattern) minimized.pattern = input.pattern;
      return minimized;
    }
    return String(input).substring(0, 200);
  }
}

// Pre-configured fallback strategies for common tools
const BASH_FALLBACK_STRATEGIES = [
  { name: 'original', adapt: (i) => i },
  { name: 'with-timeout', adapt: (i) => ({ ...i, timeout: (i.timeout || 30000) }) },
  { name: 'simplified-cmd', adapt: (i) => ({ ...i, command: String(i.command).substring(0, 500) }) },
];

const EDIT_FALLBACK_STRATEGIES = [
  { name: 'original', adapt: (i) => i },
  { name: 'single-replacement', adapt: (i) => {
    if (Array.isArray(i.replacements)) {
      return { ...i, replacements: i.replacements.slice(0, 1) };
    }
    return i;
  }},
  { name: 'write-full', adapt: (i) => ({
    path: i.path,
    content: i.newString || i.content || '',
    ...(i.instructions ? { instructions: i.instructions } : {}),
  })},
];

export function createDefaultFallbackManager() {
  const manager = new FallbackManager();
  manager.register('Bash', BASH_FALLBACK_STRATEGIES);
  manager.register('Edit', EDIT_FALLBACK_STRATEGIES);
  manager.register('Write', EDIT_FALLBACK_STRATEGIES);
  return manager;
}

export default FallbackManager;
