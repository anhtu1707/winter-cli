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
import { classifyModelTier } from '../ai/model-capabilities.js';

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
	
  // Keep the real tier for diagnostics, but Winter always pushes max reasoning.
  const modelTier = classifyModelTier(model, provider);
  const reasoningLevel = options.reasoningLevel || REASONING_LEVELS.MAX;

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
