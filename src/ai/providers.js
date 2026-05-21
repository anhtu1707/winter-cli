/**
 * ❄️ WINTER AI PROVIDER ❄️
 * Full Claude Code / Codex compatible AI integration
 */

import { withRetry } from '../tools/retry.js';
import { selectExecutionProfile } from '../context/router.js';
import { buildSystemPrompt, buildFastSystemPrompt, buildAgentSystemPrompt } from './prompts/system-prompt.js';
import { classifyTask } from './prompts/task-classifier.js';
import SuccessCriteria from './prompts/success-criteria.js';
import { ReasoningConfig, REASONING_LEVELS, complexityToReasoningLevel } from './reasoning.js';
import { buildResourceContext, getRelevantDesignGuide } from '../context/resource-loader.js';
import { classifyModelTier } from './model-capabilities.js';

const RESERVED_CONFIG_SECTIONS = new Set([
  'analytics',
  'defaultprovider',
  'mcp',
  'permissions',
  'project',
  'reliability',
  'routing',
  'sandbox',
  'session',
  'ui',
]);

const DEFAULT_REQUEST_TIMEOUT_MS = 120000;

function isAuthError(error) {
  const msg = String(error?.message || error || '');
  return /\b(401|403)\b/.test(msg) || /authentication_error|invalid_api_key|unauthorized|auth\s*failed/i.test(msg);
}

function isRateLimitError(error) {
  const msg = String(error?.message || error || '');
  return error?.status === 429 || /\b429\b|rate[_ -]?limit|tokens per minute|\bTPM\b/i.test(msg);
}

function getRequestTimeoutMs(options = {}) {
  const raw = options.timeoutMs ?? process.env.WINTER_REQUEST_TIMEOUT_MS;
  const value = Number(raw);
  if (Number.isFinite(value) && value > 0) return value;
  return DEFAULT_REQUEST_TIMEOUT_MS;
}

function createTimeoutSignal(timeoutMs, externalSignal = null) {
  const controller = new AbortController();
  let timedOut = false;
  const onAbort = () => {
    controller.abort(externalSignal?.reason || new DOMException('The operation was aborted.', 'AbortError'));
  };
  if (externalSignal?.aborted) {
    onAbort();
  } else if (externalSignal) {
    externalSignal.addEventListener('abort', onAbort, { once: true });
  }
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error(`Winter request timed out after ${timeoutMs}ms`));
  }, timeoutMs);
  if (typeof timer.unref === 'function') timer.unref();
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    cleanup: () => {
      clearTimeout(timer);
      if (externalSignal) externalSignal.removeEventListener('abort', onAbort);
    },
  };
}

function normalizeFetchError(error, provider, timeoutMs, stream = false, timedOut = false) {
  if (timedOut || /timed out/i.test(String(error?.message || ''))) {
    const label = stream ? 'stream' : 'request';
    return new Error(`${provider?.name || 'Provider'} ${label} timed out after ${Math.ceil(timeoutMs / 1000)}s`);
  }
  if (error?.name === 'AbortError' || /abort/i.test(String(error?.message || ''))) {
    const abortError = new Error('AbortError');
    abortError.name = 'AbortError';
    return abortError;
  }
  return error;
}

export class AIProviderManager {
  constructor(config) {
    this.config = config;
    this.providers = {};
    this.activeProvider = null;
    this.cache = new Map();
    this.tools = [];
    this.initialized = false;
    this.authToken = null;
    this._cachedResourceContext = '';
    this._cachedDesignGuide = null;
    this._fallbackWarned = false;
    this._modelTier = null;
  }

  async init() {
    if (this.initialized) return;

    const cfg = await this.config.load();
    const claudeConfig = cfg.claude || cfg.anthropic || null;

    // Load auth token from Claude Code's auth.json if available
    this.authToken = await this.loadAuthToken();

    if (claudeConfig?.baseURL || this.authToken) {
      this.providers.claude = {
        name: 'Claude-compatible API',
        baseURL: claudeConfig?.baseURL || 'http://localhost:4000/v1',
        authToken: this.authToken,
        apiKey: claudeConfig?.apiKey,
        model: claudeConfig?.model || 'nvidia/moonshotai/kimi-k2.6',
        ready: !!this.authToken || !!claudeConfig?.apiKey || claudeConfig?.apiKey === 'not-required',
      };
    }

    if (cfg.custom?.baseURL) {
      this.providers.custom = {
        name: 'Custom API',
        baseURL: cfg.custom.baseURL,
        apiKey: cfg.custom.apiKey || 'not-required',
        model: cfg.custom.model || 'gpt-4-turbo',
        ready: true,
      };
    }

    if (cfg.ollama?.baseURL) {
      this.providers.ollama = {
        name: 'Ollama Local',
        apiKey: cfg.ollama.apiKey || 'not-required',
        baseURL: cfg.ollama.baseURL,
        model: cfg.ollama.model || 'llama3',
        ready: true,
      };
    }

    if (cfg.openai?.apiKey) {
      this.providers.openai = {
        name: 'OpenAI',
        baseURL: cfg.openai.baseURL || 'https://api.openai.com/v1',
        apiKey: cfg.openai.apiKey,
        model: cfg.openai.model || 'gpt-4-turbo',
        ready: true,
      };
    }

    if (cfg.groq?.apiKey) {
      this.providers.groq = {
        name: 'Groq',
        baseURL: cfg.groq.baseURL || 'https://api.groq.com/openai/v1',
        apiKey: cfg.groq.apiKey,
        model: cfg.groq.model || 'llama-3.1-70b-versatile',
        ready: true,
      };
    }

    this.registerDynamicProviders(cfg);

    // Set default
    const defaultProvider = this.normalizeProviderName(cfg.defaultProvider || 'claude') === 'anthropic'
      ? 'claude'
      : this.normalizeProviderName(cfg.defaultProvider || 'claude');
    this.activeProvider = this.providers[defaultProvider] ? defaultProvider : 'claude';

    if (!this.providers[this.activeProvider]?.ready) {
      const available = Object.keys(this.providers).find(k => this.providers[k].ready);
      if (available) this.activeProvider = available;
    }

    this.updateActiveModelTier();

    this.initialized = true;
  }

  updateActiveModelTier() {
    const providerConfig = this.providers[this.activeProvider] || {};
    this._modelTier = classifyModelTier(providerConfig.model, this.activeProvider);
    return this._modelTier;
  }

  async loadAuthToken() {
    // 1) Honor explicit environment variables (highest priority)
    const envToken = process.env.CLAUDE_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_TOKEN || null;
    if (envToken) return envToken;

    // 2) Look into user home directories (platform-agnostic, no hardcoded username)
    try {
      const fs = await import('fs');
      const path = await import('path');
      const os = await import('os');
      const home = os.homedir();

      // Try ~/.codex/auth.json
      const codexAuth = path.join(home, '.codex', 'auth.json');
      if (fs.existsSync(codexAuth)) {
        try {
          const data = JSON.parse(fs.readFileSync(codexAuth, 'utf8'));
          return data.tokens?.access_token || data.access_token || null;
        } catch {}
      }

      // Try ~/.claude/sessions/*/auth.json
      const claudeSessionsDir = path.join(home, '.claude', 'sessions');
      if (fs.existsSync(claudeSessionsDir)) {
        const entries = await fs.promises.readdir(claudeSessionsDir, { withFileTypes: true });
        for (const e of entries) {
          if (!e.isDirectory()) continue;
          const candidate = path.join(claudeSessionsDir, e.name, 'auth.json');
          if (fs.existsSync(candidate)) {
            try {
              const data = JSON.parse(fs.readFileSync(candidate, 'utf8'));
              return data.tokens?.access_token || data.access_token || null;
            } catch {}
          }
        }
      }
    } catch (err) {
      // ignore and fall through
    }

    // No token found
    return null;
  }

  normalizeProviderName(name) {
    return String(name || '').trim().toLowerCase();
  }

  registerDynamicProviders(cfg = {}) {
    for (const [rawName, section] of Object.entries(cfg)) {
      const providerName = this.normalizeProviderName(rawName);
      if (this.providers[providerName]) continue;
      if (!this.isProviderConfigSection(providerName, section)) continue;

      this.providers[providerName] = this.buildProviderFromConfig(providerName, section);
    }
  }

  isProviderConfigSection(providerName, section) {
    if (RESERVED_CONFIG_SECTIONS.has(providerName)) return false;
    if (providerName === 'anthropic') return false;
    if (!section || typeof section !== 'object' || Array.isArray(section)) return false;

    return Boolean(
      section.baseURL ||
      section.apiKey ||
      section.authToken
    );
  }

  buildProviderFromConfig(providerName, section) {
    return {
      name: this.getProviderDisplayName(providerName),
      baseURL: section.baseURL || this.getProviderDefaultBaseURL(providerName),
      authToken: section.authToken,
      apiKey: section.apiKey || 'not-required',
      model: section.model || this.getProviderDefaultModel(providerName),
      ready: Boolean(section.authToken || section.apiKey || section.baseURL),
    };
  }

  getProviderDisplayName(providerName) {
    const labels = {
      anthropic: 'Claude-compatible API',
      claude: 'Claude-compatible API',
      custom: 'Custom API',
      groq: 'Groq',
      ollama: 'Ollama Local',
      openai: 'OpenAI',
    };
    return labels[providerName] || `${providerName} API`;
  }

  getProviderDefaultBaseURL(providerName) {
    if (providerName === 'openai') return 'https://api.openai.com/v1';
    if (providerName === 'groq') return 'https://api.groq.com/openai/v1';
    if (providerName === 'ollama') return 'http://localhost:11434/v1';
    return 'http://localhost:4000/v1';
  }

  getProviderDefaultModel(providerName) {
    if (providerName === 'groq') return 'llama-3.1-70b-versatile';
    if (providerName === 'ollama') return 'llama3';
    return 'gpt-4-turbo';
  }

  async reload() {
    this.providers = {};
    this.activeProvider = null;
    this.initialized = false;
    await this.init();
  }

  setProvider(name) {
    const providerName = this.normalizeProviderName(name);
    if (this.providers[providerName]) {
      this.activeProvider = providerName;
      this.updateActiveModelTier();
      return true;
    }
    return false;
  }

  async switchProvider(name) {
    const providerName = this.normalizeProviderName(name);
    await this.init();

    if (this.setProvider(providerName)) {
      return providerName;
    }

    await this.reload();
    return this.setProvider(providerName) ? providerName : null;
  }

  getActiveProvider() {
    return this.activeProvider;
  }

  listProviders() {
    return Object.entries(this.providers).map(([name, p]) => ({
      name,
      ready: p.ready,
      model: p.model,
    }));
  }

  selectExecutionProfile(messageOrMessages, options = {}) {
    const messages = typeof messageOrMessages === 'string'
      ? [{ role: 'user', content: messageOrMessages }]
      : messageOrMessages;

    return selectExecutionProfile({
      messages,
      activeProvider: this.activeProvider,
      providers: this.providers,
      options,
    });
  }

  setTools(tools) {
    this.tools = tools;
  }

  normalizeToolDefinitionsForApi(tools = []) {
    if (!Array.isArray(tools)) return [];

    return tools
      .map(tool => {
        if (!tool || typeof tool !== 'object') return null;

        if (tool.type === 'function' && tool.function && typeof tool.function === 'object') {
          return tool;
        }

        if (tool.name && tool.parameters) {
          return {
            type: 'function',
            function: {
              name: tool.name,
              description: tool.description || '',
              parameters: tool.parameters,
            },
          };
        }

        if (tool.function?.name) {
          return {
            type: 'function',
            function: {
              name: tool.function.name,
              description: tool.function.description || tool.description || '',
              parameters: tool.function.parameters || tool.parameters || { type: 'object', properties: {} },
            },
          };
        }

        return null;
      })
      .filter(Boolean);
  }

  async chat(message, options = {}) {
    await this.init();
    const messages = [
      { role: 'system', content: options.system || this.getSystemPrompt() },
      { role: 'user', content: message }
    ];

    const data = await this.sendRequest(messages, options);
    return {
      content: data.choices?.[0]?.message?.content || '',
      raw: data,
    };
  }

  async sendRequest(messages, options = {}) {
    await this.init();
    const executionProfile = selectExecutionProfile({
      messages,
      activeProvider: this.activeProvider,
      providers: this.providers,
      options,
    });
    const routedProvider = this.providers[executionProfile.provider] || this.providers[this.activeProvider];
    const defaultProvider = this.providers[this.activeProvider];

    const routingModel = options.model || executionProfile.model;
    const routingReasoning = options.reasoning || executionProfile.reasoningParam;

    try {
      return await withRetry(() => this.sendRequestToProvider(routedProvider, messages, {
        ...options,
        model: routingModel,
        reasoning: routingReasoning,
        reasoningLevel: options.reasoningLevel || executionProfile.reasoningLevel,
      }), { maxAttempts: 3, baseDelayMs: 150, retryable: error => !isRateLimitError(error) && !/\b(400|404)\b/.test(String(error?.message || error || '')) });
    } catch (error) {
      if (isAuthError(error) && routedProvider !== defaultProvider && defaultProvider) {
        if (!this._fallbackWarned) {
          console.warn(`[winter] ${executionProfile.provider} auth error, falling back to ${this.activeProvider}`);
          this._fallbackWarned = true;
        }
        return await withRetry(() => this.sendRequestToProvider(defaultProvider, messages, {
          ...options,
          model: options.model || defaultProvider.model,
          reasoning: routingReasoning,
          reasoningLevel: options.reasoningLevel || executionProfile.reasoningLevel,
        }), { maxAttempts: 1, baseDelayMs: 0, retryable: error => !isRateLimitError(error) && !/\b(400|404)\b/.test(String(error?.message || error || '')) });
      }
      throw error;
    }
  }

  async *streamRequest(messages, options = {}) {
    await this.init();
    const executionProfile = selectExecutionProfile({
      messages,
      activeProvider: this.activeProvider,
      providers: this.providers,
      options,
    });
    const routedProvider = this.providers[executionProfile.provider] || this.providers[this.activeProvider];
    const defaultProvider = this.providers[this.activeProvider];

    const routingModel = options.model || executionProfile.model;
    const routingReasoning = options.reasoning || executionProfile.reasoningParam;

    try {
      yield* this.streamRequestToProvider(routedProvider, messages, {
        ...options,
        model: routingModel,
        reasoning: routingReasoning,
        reasoningLevel: options.reasoningLevel || executionProfile.reasoningLevel,
      });
    } catch (error) {
      if (isAuthError(error) && routedProvider !== defaultProvider && defaultProvider) {
        if (!this._fallbackWarned) {
          console.warn(`[winter] ${executionProfile.provider} auth error, falling back to ${this.activeProvider}`);
          this._fallbackWarned = true;
        }
        yield* this.streamRequestToProvider(defaultProvider, messages, {
          ...options,
          model: options.model || defaultProvider.model,
          reasoning: routingReasoning,
          reasoningLevel: options.reasoningLevel || executionProfile.reasoningLevel,
        });
      } else {
        throw error;
      }
    }
  }

  async sendRequestToProvider(provider, messages, options = {}) {
    if (!provider) {
      throw new Error('No active provider is configured');
    }
    const timeoutMs = getRequestTimeoutMs(options);

    const body = {
      model: options.model || provider.model,
      messages,
    };

    // Apply reasoning configuration
    const reasoningParam = options.reasoning || this._getReasoningParam(options, provider);
    if (reasoningParam) {
      if (reasoningParam.reasoning_effort) {
        body.reasoning_effort = reasoningParam.reasoning_effort;
      }
      if (reasoningParam.thinking) {
        body.thinking = reasoningParam.thinking;
      }
    }

    if (this.tools.length > 0 && options.enableTools && !options.toolPromptOnly) {
      const tools = this.normalizeToolDefinitionsForApi(this.tools);
      if (tools.length > 0) body.tools = tools;
    }

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    if (provider.authToken) {
      headers['Authorization'] = `Bearer ${provider.authToken}`;
    } else if (provider.apiKey && provider.apiKey !== 'not-required') {
      headers['Authorization'] = `Bearer ${provider.apiKey}`;
    }

    const timeout = createTimeoutSignal(timeoutMs, options.signal || options.abortSignal);
    let response;
    try {
      response = await fetch(`${provider.baseURL}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: timeout.signal,
      });
    } catch (error) {
      throw normalizeFetchError(error, provider, timeoutMs, false, timeout.timedOut());
    } finally {
      timeout.cleanup();
    }

    if (!response.ok) {
      const error = await response.text();
      const requestError = new Error(`${provider.name} error (${response.status}): ${error}`);
      requestError.status = response.status;
      throw requestError;
    }

    return await response.json();
  }

  async *streamRequestToProvider(provider, messages, options = {}) {
    if (!provider) {
      throw new Error('No active provider is configured');
    }
    const timeoutMs = getRequestTimeoutMs(options);

    const body = {
      model: options.model || provider.model,
      messages,
      stream: true,
    };

    if (options.includeUsage !== false) {
      body.stream_options = { include_usage: true };
    }

    // Apply reasoning configuration
    const reasoningParam = options.reasoning || this._getReasoningParam(options, provider);
    if (reasoningParam) {
      if (reasoningParam.reasoning_effort) {
        body.reasoning_effort = reasoningParam.reasoning_effort;
      }
      if (reasoningParam.thinking) {
        body.thinking = reasoningParam.thinking;
      }
    }

    if (this.tools.length > 0 && options.enableTools && !options.toolPromptOnly) {
      const tools = this.normalizeToolDefinitionsForApi(this.tools);
      if (tools.length > 0) body.tools = tools;
    }

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
    };

    if (provider.authToken) {
      headers['Authorization'] = `Bearer ${provider.authToken}`;
    } else if (provider.apiKey && provider.apiKey !== 'not-required') {
      headers['Authorization'] = `Bearer ${provider.apiKey}`;
    }

    const timeout = createTimeoutSignal(timeoutMs, options.signal || options.abortSignal);
    let response;
    try {
      response = await fetch(`${provider.baseURL}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: timeout.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        const streamError = new Error(`${provider.name} stream error (${response.status}): ${error}`);
        streamError.status = response.status;
        throw streamError;
      }

      if (!response.body) {
        throw new Error(`${provider.name} did not return a stream body`);
      }

      const decoder = new TextDecoder();
      let buffer = '';

      for await (const chunk of response.body) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;

          const payload = trimmed.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;

          let data;
          try {
            data = JSON.parse(payload);
          } catch {
            continue;
          }

          const choice = data.choices?.[0] || {};
          const content = choice.delta?.content ?? choice.message?.content ?? choice.text ?? '';
          yield {
            content,
            usage: data.usage,
            raw: data,
          };
        }
      }

      const tail = buffer.trim();
      if (tail.startsWith('data:')) {
        const payload = tail.slice(5).trim();
        if (payload && payload !== '[DONE]') {
          try {
            const data = JSON.parse(payload);
            const choice = data.choices?.[0] || {};
            yield {
              content: choice.delta?.content ?? choice.message?.content ?? choice.text ?? '',
              usage: data.usage,
              raw: data,
            };
          } catch {}
        }
      }
    } catch (error) {
      throw normalizeFetchError(error, provider, timeoutMs, true, timeout.timedOut());
    } finally {
      timeout.cleanup();
    }
  }

  async callAllProviders(prompt, options = {}) {
    await this.init();
    const messages = [
      { role: 'system', content: options.system || this.getSystemPrompt() },
      { role: 'user', content: prompt },
    ];

    const results = {};
    const entries = Object.entries(this.providers).filter(([, provider]) => provider.ready);

    for (const [name, provider] of entries) {
      try {
        const data = await this.sendRequestToProvider(provider, messages, {
          ...options,
          enableTools: false,
          model: options.model || provider.model,
        });
        results[name] = {
          content: data.choices?.[0]?.message?.content || '',
          model: provider.model,
          raw: data,
        };
      } catch (error) {
        results[name] = {
          error: error.message,
          model: provider.model,
        };
      }
    }

    return results;
  }

  async chatWithTools(messages, options = {}) {
    await this.init();
    const provider = this.providers[this.activeProvider];

    let currentMessages = [...messages];
    let iterations = 0;
    const maxIterations = 10;

    while (iterations < maxIterations) {
      iterations++;

      const body = {
        model: options.model || provider.model,
        messages: currentMessages,
        tools: this.tools.length > 0 ? this.normalizeToolDefinitionsForApi(this.tools) : undefined,
      };

      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      };

      if (provider.authToken) {
        headers['Authorization'] = `Bearer ${provider.authToken}`;
      } else if (provider.apiKey && provider.apiKey !== 'not-required') {
        headers['Authorization'] = `Bearer ${provider.apiKey}`;
      }

      const response = await fetch(`${provider.baseURL}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`${this.activeProvider} error (${response.status}): ${error}`);
      }

      const data = await response.json();
      const assistantMsg = data.choices?.[0]?.message;

      // Check for tool calls
      const toolCalls = assistantMsg?.tool_calls || [];
      if (toolCalls.length === 0) {
        return {
          content: assistantMsg?.content || '',
          toolCalls: [],
          raw: data,
        };
      }

      // Add assistant message
      currentMessages.push(assistantMsg);

      // Execute tools and add results
      for (const tc of toolCalls) {
        const toolResult = await this.executeTool(tc.function.name, tc.function.arguments);
        currentMessages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify(toolResult),
        });
      }
    }

    return {
      content: 'Max iterations reached',
      toolCalls: [],
      error: 'Too many tool calls',
    };
  }

  async executeTool(name, args) {
    // This will be called by the REPL, not here
    return { error: 'Tool execution handled by REPL' };
  }

  _getReasoningParam(options, provider) {
    // 1. Explicit reasoning param passed through options
    if (options.reasoning) return options.reasoning;

    // 2. Reasoning level specified -> build from level
    if (options.reasoningLevel) {
      const config = new ReasoningConfig({
        level: options.reasoningLevel,
        provider: provider?.name || this.activeProvider,
      });
      return config.getApiReasoningParam();
    }

    // 3. No reasoning config at all
    return null;
  }

  getSystemPrompt(options = {}) {
    const taskInfo = options.task ? classifyTask(options.task) : null;
    const tools = Array.isArray(this.tools)
      ? this.tools.map(tool => tool?.function?.name || tool?.name).filter(Boolean)
      : [];
    const sessionInfo = {
      memory: options.memory || [],
      plans: options.plans || [],
    };

    // Inject reasoning instructions if applicable
    let reasoningPrompt = '';
    if (options.reasoningLevel || options.reasoningPrompt) {
      reasoningPrompt = options.reasoningPrompt || new ReasoningConfig({
        level: options.reasoningLevel || REASONING_LEVELS.MAX,
        provider: this.activeProvider,
        modelTier: this._modelTier,
      }).getPromptInstructions();
    } else if (taskInfo) {
      // Auto-inject based on task complexity for providers without API reasoning
      const level = REASONING_LEVELS.MAX;
      const config = new ReasoningConfig({
        level,
        provider: this.activeProvider,
        modelTier: this._modelTier,
      });
      if (config.needsPromptInjection && level !== REASONING_LEVELS.NONE) {
        reasoningPrompt = config.getPromptInstructions();
      }
    }

    if (options.role === 'agent') {
      return buildAgentSystemPrompt(options.agentRole || 'coding', { tools, modelTier: this._modelTier }) + reasoningPrompt;
    }

    if (options.fast) {
      return buildFastSystemPrompt({ role: 'coding', tools, modelTier: this._modelTier });
    }

    const successPrompt = options.task
      ? '\n\n' + SuccessCriteria.fromRequest(options.task).buildPrompt()
      : '';

    const resourceContext = options.includeResources ? (this._cachedResourceContext || '') : '';

    // Auto-detect relevant design guide for UI/design tasks
    let designGuide = null;
    if (taskInfo && (taskInfo.category === 'design' || taskInfo.category === 'ui')) {
      this._designGuidePromise = this._designGuidePromise || this._loadDesignGuide(options.task);
    }
    const design = this._cachedDesignGuide || null;

    return buildSystemPrompt({
      role: taskInfo?.category || 'coding',
      context: taskInfo,
      tools,
      session: sessionInfo,
      design,
      resourceContext,
      modelTier: this._modelTier,
    }) + reasoningPrompt + successPrompt;
  }

  /**
   * Load resource context (cached for session lifetime).
   */
  async _loadResourceContext() {
    try {
      this._cachedResourceContext = await buildResourceContext();
    } catch (e) {
      this._cachedResourceContext = '';
    }
    return this._cachedResourceContext;
  }

  /**
   * Load relevant design guide for a task.
   */
  async _loadDesignGuide(task) {
    try {
      const guide = await getRelevantDesignGuide(task);
      if (guide) {
        this._cachedDesignGuide = guide;
      }
    } catch (e) {
      // Silently fail - design context is optional
    }
    return this._cachedDesignGuide;
  }

  classifyTask(userInput) {
    return classifyTask(userInput);
  }

  buildSuccessCriteria(userInput) {
    return SuccessCriteria.fromRequest(userInput);
  }

  clearCache() {
    this.cache.clear();
  }

  getCacheStats() {
    return {
      size: this.cache.size,
      activeProvider: this.activeProvider,
    };
  }
}
