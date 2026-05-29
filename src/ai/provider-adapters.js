/**
 * Universal provider request/response adapters.
 *
 * Internal callers use OpenAI-style messages and normalized responses. These helpers
 * translate that shape to native provider APIs where needed while preserving the
 * existing OpenAI-compatible path for custom/local gateways.
 */

const DEFAULT_ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MAX_TOKENS = 4096;

export const PROVIDER_PRESETS = {
  openai: { name: 'OpenAI', apiFormat: 'openai', baseURL: 'https://api.openai.com/v1', model: 'gpt-4-turbo' },
  azure: { name: 'Azure OpenAI', apiFormat: 'openai', model: 'gpt-4o' },
  groq: { name: 'Groq', apiFormat: 'openai', baseURL: 'https://api.groq.com/openai/v1', model: 'llama-3.1-70b-versatile' },
  ollama: { name: 'Ollama Local', apiFormat: 'openai', baseURL: 'http://localhost:11434/v1', model: 'llama3' },
  openrouter: { name: 'OpenRouter', apiFormat: 'openai', baseURL: 'https://openrouter.ai/api/v1', model: 'anthropic/claude-3.5-sonnet' },
  together: { name: 'Together AI', apiFormat: 'openai', baseURL: 'https://api.together.xyz/v1', model: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo' },
  fireworks: { name: 'Fireworks AI', apiFormat: 'openai', baseURL: 'https://api.fireworks.ai/inference/v1', model: 'accounts/fireworks/models/llama-v3p1-70b-instruct' },
  deepseek: { name: 'DeepSeek', apiFormat: 'openai', baseURL: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  mistral: { name: 'Mistral AI', apiFormat: 'openai', baseURL: 'https://api.mistral.ai/v1', model: 'mistral-large-latest' },
  xai: { name: 'xAI', apiFormat: 'openai', baseURL: 'https://api.x.ai/v1', model: 'grok-3' },
  perplexity: { name: 'Perplexity', apiFormat: 'openai', baseURL: 'https://api.perplexity.ai', model: 'sonar-pro' },
  cerebras: { name: 'Cerebras', apiFormat: 'openai', baseURL: 'https://api.cerebras.ai/v1', model: 'llama3.1-70b' },
  siliconflow: { name: 'SiliconFlow', apiFormat: 'openai', baseURL: 'https://api.siliconflow.cn/v1', model: 'Qwen/Qwen2.5-72B-Instruct' },
  zhipu: { name: 'Zhipu AI', apiFormat: 'openai', baseURL: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-plus' },
  baichuan: { name: 'Baichuan AI', apiFormat: 'openai', baseURL: 'https://api.baichuan-ai.com/v1', model: 'Baichuan4' },
  '01ai': { name: '01.AI', apiFormat: 'openai', baseURL: 'https://api.lingyiwanwu.com/v1', model: 'yi-large' },
  qwen: { name: 'Qwen DashScope', apiFormat: 'openai', baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  dashscope: { name: 'Alibaba DashScope', apiFormat: 'openai', baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  kimi: { name: 'Kimi Moonshot', apiFormat: 'openai', baseURL: 'https://api.moonshot.ai/v1', model: 'kimi-k2-0711-preview' },
  moonshot: { name: 'Moonshot AI', apiFormat: 'openai', baseURL: 'https://api.moonshot.ai/v1', model: 'kimi-k2-0711-preview' },
  minimax: { name: 'MiniMax', apiFormat: 'openai', baseURL: 'https://api.minimax.io/v1', model: 'MiniMax-M1' },
  anthropic: { name: 'Anthropic API', apiFormat: 'anthropic', baseURL: 'https://api.anthropic.com/v1', model: 'claude-3-5-sonnet-latest' },
  claude: { name: 'Claude-compatible API', apiFormat: 'openai', baseURL: 'http://localhost:4000/v1', model: 'nvidia/moonshotai/kimi-k2.6' },
  gemini: { name: 'Google Gemini', apiFormat: 'gemini', baseURL: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-1.5-pro' },
};

export function getProviderPreset(providerName) {
  return PROVIDER_PRESETS[String(providerName || '').trim().toLowerCase()] || null;
}

export function resolveProviderApiFormat(provider = {}) {
  const explicit = String(provider.apiFormat || provider.format || '').trim().toLowerCase();
  if (explicit) return explicit;

  const providerName = String(provider.providerName || provider.key || provider.name || '').toLowerCase();
  const baseURL = String(provider.baseURL || '').toLowerCase();
  const preset = getProviderPreset(providerName);
  if (preset?.apiFormat) return preset.apiFormat;

  if (providerName.includes('gemini') || baseURL.includes('generativelanguage.googleapis.com')) return 'gemini';
  if (providerName.includes('anthropic') || baseURL.includes('api.anthropic.com')) return 'anthropic';
  return 'openai';
}

export function buildProviderRequest(provider, messages = [], options = {}) {
  const apiFormat = resolveProviderApiFormat(provider);
  if (apiFormat === 'anthropic') return buildAnthropicRequest(provider, messages, options);
  if (apiFormat === 'gemini') return buildGeminiRequest(provider, messages, options);
  return buildOpenAIRequest(provider, messages, options);
}

export function normalizeProviderResponse(provider, data) {
  const apiFormat = resolveProviderApiFormat(provider);
  if (apiFormat === 'anthropic') return normalizeAnthropicResponse(data);
  if (apiFormat === 'gemini') return normalizeGeminiResponse(data);
  return data;
}

export function normalizeProviderStreamChunk(provider, data) {
  const apiFormat = resolveProviderApiFormat(provider);
  if (apiFormat === 'anthropic') return normalizeAnthropicStreamChunk(data);
  if (apiFormat === 'gemini') return normalizeGeminiStreamChunk(data);
  return normalizeOpenAIStreamChunk(data);
}

export function extractTextFromResponse(data) {
  return data?.choices?.[0]?.message?.content
    ?? data?.choices?.[0]?.text
    ?? data?.content
    ?? '';
}

function trimTrailingSlash(value = '') {
  return String(value || '').replace(/\/+$/, '');
}

function splitSystemMessages(messages = []) {
  const system = [];
  const chat = [];

  for (const message of messages) {
    if (!message) continue;
    if (message.role === 'system') {
      const text = contentToText(message.content);
      if (text) system.push(text);
    } else {
      chat.push(message);
    }
  }

  return { system: system.join('\n\n'), chat };
}

function contentToText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map(part => part?.text || part?.image_url?.url || '').filter(Boolean).join('\n');
  }
  if (content == null) return '';
  return String(content);
}

function buildOpenAIRequest(provider, messages, options) {
  const body = {
    model: options.model || provider.model,
    messages,
  };

  if (options.stream) body.stream = true;
  if (options.stream && options.includeUsage !== false) body.stream_options = { include_usage: true };

  if (options.reasoning?.reasoning_effort) body.reasoning_effort = options.reasoning.reasoning_effort;
  if (options.reasoning?.thinking) body.thinking = options.reasoning.thinking;
  if (options.tools?.length) body.tools = options.tools;
  if (options.toolChoiceRequired && options.tools?.length) body.tool_choice = 'required';

  return {
    url: `${trimTrailingSlash(provider.baseURL)}/chat/completions`,
    headers: buildBearerHeaders(provider, options.stream ? 'text/event-stream' : 'application/json'),
    body,
  };
}

function buildAnthropicRequest(provider, messages, options) {
  const { system, chat } = splitSystemMessages(messages);
  const body = {
    model: options.model || provider.model,
    max_tokens: options.maxTokens || provider.maxTokens || DEFAULT_MAX_TOKENS,
    messages: chat.map(message => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: contentToText(message.content),
    })),
  };

  if (system) body.system = system;
  if (options.stream) body.stream = true;
  if (options.reasoning?.thinking) body.thinking = options.reasoning.thinking;
  if (options.tools?.length) body.tools = options.tools.map(toAnthropicTool).filter(Boolean);
  if (options.toolChoiceRequired && body.tools?.length) body.tool_choice = { type: 'any' };

  const headers = {
    'Content-Type': 'application/json',
    'Accept': options.stream ? 'text/event-stream' : 'application/json',
    'anthropic-version': provider.anthropicVersion || DEFAULT_ANTHROPIC_VERSION,
  };

  const apiKey = provider.apiKey && provider.apiKey !== 'not-required' ? provider.apiKey : provider.authToken;
  if (apiKey) headers['x-api-key'] = apiKey;

  return {
    url: `${trimTrailingSlash(provider.baseURL || 'https://api.anthropic.com/v1')}/messages`,
    headers,
    body,
  };
}

function buildGeminiRequest(provider, messages, options) {
  const { system, chat } = splitSystemMessages(messages);
  const model = options.model || provider.model;
  const body = {
    contents: chat.map(message => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: contentToText(message.content) }],
    })),
  };

  if (system) body.systemInstruction = { parts: [{ text: system }] };
  if (options.tools?.length) {
    body.tools = [{ functionDeclarations: options.tools.map(toGeminiFunctionDeclaration).filter(Boolean) }]
      .filter(tool => tool.functionDeclarations.length > 0);
  }

  const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
  if (provider.authToken) headers.Authorization = `Bearer ${provider.authToken}`;

  const baseURL = trimTrailingSlash(provider.baseURL || 'https://generativelanguage.googleapis.com/v1beta');
  const endpoint = options.stream ? 'streamGenerateContent' : 'generateContent';
  const key = provider.apiKey && provider.apiKey !== 'not-required'
    ? `?key=${encodeURIComponent(provider.apiKey)}`
    : '';

  return {
    url: `${baseURL}/models/${encodeURIComponent(model)}:${endpoint}${key}`,
    headers,
    body,
  };
}

function buildBearerHeaders(provider, accept) {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': accept,
  };

  if (provider.authToken) {
    headers.Authorization = `Bearer ${provider.authToken}`;
  } else if (provider.apiKey && provider.apiKey !== 'not-required') {
    headers.Authorization = `Bearer ${provider.apiKey}`;
  }

  return headers;
}

function toAnthropicTool(tool) {
  const fn = tool?.function || tool;
  if (!fn?.name) return null;
  return {
    name: fn.name,
    description: fn.description || '',
    input_schema: fn.parameters || { type: 'object', properties: {} },
  };
}

function toGeminiFunctionDeclaration(tool) {
  const fn = tool?.function || tool;
  if (!fn?.name) return null;
  return {
    name: fn.name,
    description: fn.description || '',
    parameters: fn.parameters || { type: 'object', properties: {} },
  };
}

function normalizeAnthropicResponse(data = {}) {
  const content = Array.isArray(data.content)
    ? data.content.map(part => part?.text || '').join('')
    : '';

  return {
    id: data.id,
    model: data.model,
    usage: data.usage,
    choices: [{
      message: {
        role: 'assistant',
        content,
      },
      finish_reason: data.stop_reason || null,
    }],
    raw: data,
  };
}

function normalizeGeminiResponse(data = {}) {
  const candidate = data.candidates?.[0] || {};
  const content = Array.isArray(candidate.content?.parts)
    ? candidate.content.parts.map(part => part?.text || '').join('')
    : '';

  return {
    usage: data.usageMetadata,
    choices: [{
      message: {
        role: 'assistant',
        content,
      },
      finish_reason: candidate.finishReason || null,
    }],
    raw: data,
  };
}

function normalizeOpenAIStreamChunk(data = {}) {
  const choice = data.choices?.[0] || {};
  return {
    content: choice.delta?.content ?? choice.message?.content ?? choice.text ?? '',
    usage: data.usage,
    raw: data,
  };
}

function normalizeAnthropicStreamChunk(data = {}) {
  if (data.type === 'content_block_delta') {
    return {
      content: data.delta?.text || '',
      usage: undefined,
      raw: data,
    };
  }

  if (data.type === 'message_delta') {
    return {
      content: '',
      usage: data.usage,
      raw: data,
    };
  }

  if (data.type === 'message_stop') {
    return { content: '', usage: undefined, raw: data };
  }

  return normalizeOpenAIStreamChunk(data);
}

function normalizeGeminiStreamChunk(data = {}) {
  const candidate = data.candidates?.[0] || {};
  const content = Array.isArray(candidate.content?.parts)
    ? candidate.content.parts.map(part => part?.text || '').join('')
    : '';

  return {
    content,
    usage: data.usageMetadata,
    raw: data,
  };
}
