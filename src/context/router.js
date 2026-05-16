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
  return { provider, model };
}
