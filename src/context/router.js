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

export function selectExecutionProfile({ messages = [], activeProvider = null, providers = {}, options = {} } = {}) {
  const text = flattenMessageText(messages);
  const providerNames = Object.keys(providers).filter(name => providers[name]?.ready || providers[name]?.model);
  const hasProvider = name => providerNames.includes(name);

  const explicitProvider = options.provider && hasProvider(options.provider) ? options.provider : null;
  let provider = explicitProvider || (activeProvider && hasProvider(activeProvider) ? activeProvider : providerNames[0] || null);

  if (explicitProvider) {
    provider = explicitProvider;
  } else if (/\b(review|refactor|debug|fix|bug|error|stack trace|test|tool|patch|code)\b/.test(text) && hasProvider('claude')) {
    provider = 'claude';
  } else if (/\b(summary|summarize|commit message|changelog|docs|explain|rewrite)\b/.test(text) && hasProvider('openai')) {
    provider = 'openai';
  } else if (/\b(local|offline|privacy|private|on-device)\b/.test(text) && hasProvider('ollama')) {
    provider = 'ollama';
  } else if (/\b(quick|brief|short|fast)\b/.test(text) && hasProvider('groq')) {
    provider = 'groq';
  }

  const model = options.model || providers[provider]?.model || providers[activeProvider]?.model || null;

  // Determine reasoning level based on task complexity signals
  let reasoningLevel = options.reasoningLevel || REASONING_LEVELS.MEDIUM;
  if (!options.reasoningLevel) {
    // Default: use heuristic from text signals
    const hasDeepSignals = /\b(refactor|architecture|redesign|migrate|complex|full stack|e2e|end to end|security|optimize|performance)\b/.test(text);
    const hasComplexSignals = /\b(debug|fix|test|multiple|integrate|implement|design|plan)\b/.test(text);

    if (hasDeepSignals && text.length > 100) {
      reasoningLevel = REASONING_LEVELS.MAX;
    } else if (hasComplexSignals && text.length > 60) {
      reasoningLevel = REASONING_LEVELS.HIGH;
    } else if (text.split(/\s+/).length > 30) {
      reasoningLevel = REASONING_LEVELS.MEDIUM;
    } else if (text.split(/\s+/).length < 5) {
      reasoningLevel = REASONING_LEVELS.LOW;
    } else {
      reasoningLevel = REASONING_LEVELS.LOW;
    }
  }

  const reasoning = new ReasoningConfig({
    level: reasoningLevel,
    provider: provider || activeProvider,
  });

  return {
    provider,
    model,
    reasoningLevel,
    reasoningParam: reasoning.getApiReasoningParam(),
    reasoningPrompt: reasoning.getPromptInstructions(),
  };
}
