function flattenMessageText(messages) {
  return Array.isArray(messages)
    ? messages.map(message => {
      if (!message) return '';
      if (typeof message.content === 'string') return message.content;
      if (Array.isArray(message.content)) {
        return message.content.map(part => part?.text || part?.image_url?.url || '').join('\n');
      }
      return '';
    }).join('\n').toLowerCase()
    : String(messages || '').toLowerCase();
}

import { ReasoningConfig, REASONING_LEVELS } from '../ai/reasoning.js';
import { classifyModelTier, isSmallModel, getReasoningBump, MODEL_TIERS } from '../ai/model-capabilities.js';

/**
 * Bump reasoning level by N steps.
 */
function bumpReasoningLevel(level, steps) {
  const order = [REASONING_LEVELS.NONE, REASONING_LEVELS.LOW, REASONING_LEVELS.MEDIUM, REASONING_LEVELS.HIGH, REASONING_LEVELS.MAX];
  const idx = order.indexOf(level);
  if (idx === -1) return level;
  const newIdx = Math.min(idx + steps, order.length - 1);
  return order[newIdx];
}

export function selectExecutionProfile({ messages = [], activeProvider = null, providers = {}, options = {} } = {}) {
  const text = flattenMessageText(messages);
  const providerNames = Object.keys(providers).filter(name => providers[name]?.ready || providers[name]?.model);
  const hasProvider = name => providerNames.includes(name);

  const explicitProvider = options.provider && hasProvider(options.provider) ? options.provider : null;
  const activeProviderIsValid = activeProvider && hasProvider(activeProvider);
  let provider = explicitProvider || (activeProviderIsValid ? activeProvider : providerNames[0] || null);
  const allowAutoRoute = options.autoRouteProvider === true && !explicitProvider && !activeProviderIsValid;

  if (explicitProvider) {
    provider = explicitProvider;
  } else if (allowAutoRoute && /\b(review|refactor|debug|fix|bug|error|stack trace|test|tool|patch|code)\b/.test(text) && hasProvider('claude')) {
    provider = 'claude';
  } else if (allowAutoRoute && /\b(summary|summarize|commit message|changelog|docs|explain|rewrite)\b/.test(text) && hasProvider('openai')) {
    provider = 'openai';
  } else if (allowAutoRoute && /\b(local|offline|privacy|private|on-device)\b/.test(text) && hasProvider('ollama')) {
    provider = 'ollama';
  } else if (allowAutoRoute && /\b(quick|brief|short|fast)\b/.test(text) && hasProvider('groq')) {
    provider = 'groq';
  }

  const providerConfig = providers[provider] || providers[activeProvider] || {};
  const model = options.model || providerConfig.model || providers[activeProvider]?.model || null;
	
	  // Detect model capability tier
	  const modelTier = classifyModelTier(model, provider);
	  const isSmall = isSmallModel(modelTier);
	  const reasoningBump = getReasoningBump(modelTier);
	
	  // Determine reasoning level based on task complexity signals
	  // Default: HIGH for coding — all models must think deeply
	  let reasoningLevel = options.reasoningLevel || REASONING_LEVELS.HIGH;
	  if (!options.reasoningLevel) {
	    const hasDeepSignals = /\b(refactor|architecture|redesign|migrate|complex|full stack|e2e|end to end|security|optimize|performance|implement|build|create)\b/.test(text);
	    const hasComplexSignals = /\b(debug|fix|test|multiple|integrate|design|plan|review|analyze)\b/.test(text);
	
	    if (hasDeepSignals && text.length > 30) {
	      reasoningLevel = REASONING_LEVELS.MAX;
	    } else if (hasComplexSignals && text.length > 20) {
	      reasoningLevel = REASONING_LEVELS.MAX;
	    } else if (text.split(/\s+/).length > 10) {
	      reasoningLevel = REASONING_LEVELS.HIGH;
	    } else if (text.split(/\s+/).length < 3) {
	      reasoningLevel = REASONING_LEVELS.MEDIUM;
	    } else {
	      reasoningLevel = REASONING_LEVELS.HIGH;
	    }
	
	    // If small model, bump reasoning level even more to compensate
	    if (isSmall && reasoningBump > 0) {
	      reasoningLevel = bumpReasoningLevel(reasoningLevel, reasoningBump);
	    }
	  }

  const reasoning = new ReasoningConfig({
    level: reasoningLevel,
    provider: provider || activeProvider,
    modelTier,
  });

  return {
    provider,
    model,
    modelTier,
    reasoningLevel,
    reasoningParam: reasoning.getApiReasoningParam(),
    reasoningPrompt: reasoning.getPromptInstructions(),
  };
}
