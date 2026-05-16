/**
 * ❄️ WINTER AI PROVIDER ❄️
 * Full Claude Code / Codex compatible AI integration
 */

import { withRetry } from '../tools/retry.js';
import { selectExecutionProfile } from '../context/router.js';
import { buildSystemPrompt, buildFastSystemPrompt, buildAgentSystemPrompt } from './prompts/system-prompt.js';
import { classifyTask } from './prompts/task-classifier.js';
import SuccessCriteria from './prompts/success-criteria.js';

function isAuthError(error) {
  const msg = String(error?.message || error || '');
  return /\b(401|403)\b/.test(msg) || /authentication_error|invalid_api_key|unauthorized|auth\s*failed/i.test(msg);
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

    // Set default
    const defaultProvider = this.normalizeProviderName(cfg.defaultProvider || 'claude') === 'anthropic'
      ? 'claude'
      : this.normalizeProviderName(cfg.defaultProvider || 'claude');
    this.activeProvider = this.providers[defaultProvider] ? defaultProvider : 'claude';

    if (!this.providers[this.activeProvider]?.ready) {
      const available = Object.keys(this.providers).find(k => this.providers[k].ready);
      if (available) this.activeProvider = available;
    }

    this.initialized = true;
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

    try {
      return await withRetry(() => this.sendRequestToProvider(routedProvider, messages, {
        ...options,
        model: options.model || executionProfile.model,
      }), { maxAttempts: 3, baseDelayMs: 150 });
    } catch (error) {
      if (isAuthError(error) && routedProvider !== defaultProvider && defaultProvider) {
        console.warn(`[winter] ${executionProfile.provider} provider auth error, falling back to ${this.activeProvider}`);
        return await withRetry(() => this.sendRequestToProvider(defaultProvider, messages, {
          ...options,
          model: options.model || defaultProvider.model,
        }), { maxAttempts: 1, baseDelayMs: 0 });
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

    try {
      yield* this.streamRequestToProvider(routedProvider, messages, {
        ...options,
        model: options.model || executionProfile.model,
      });
    } catch (error) {
      if (isAuthError(error) && routedProvider !== defaultProvider && defaultProvider) {
        console.warn(`[winter] ${executionProfile.provider} provider auth error, falling back to ${this.activeProvider}`);
        yield* this.streamRequestToProvider(defaultProvider, messages, {
          ...options,
          model: options.model || defaultProvider.model,
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

    const body = {
      model: options.model || provider.model,
      messages,
    };

    if (this.tools.length > 0 && options.enableTools) {
      body.tools = this.tools;
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

    const response = await fetch(`${provider.baseURL}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`${provider.name} error (${response.status}): ${error}`);
    }

    return await response.json();
  }

  async *streamRequestToProvider(provider, messages, options = {}) {
    if (!provider) {
      throw new Error('No active provider is configured');
    }

    const body = {
      model: options.model || provider.model,
      messages,
      stream: true,
    };

    if (options.includeUsage !== false) {
      body.stream_options = { include_usage: true };
    }

    if (this.tools.length > 0 && options.enableTools) {
      body.tools = this.tools;
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

    const response = await fetch(`${provider.baseURL}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`${provider.name} stream error (${response.status}): ${error}`);
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
        tools: this.tools.length > 0 ? this.tools : undefined,
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

  getSystemPrompt(options = {}) {
    const taskInfo = options.task ? classifyTask(options.task) : null;
    const tools = this.tools ? Object.keys(this.tools) : [];
    const sessionInfo = {
      memory: options.memory || [],
      plans: options.plans || [],
    };

    if (options.role === 'agent') {
      return buildAgentSystemPrompt(options.agentRole || 'coding', { tools });
    }

    if (options.fast) {
      return buildFastSystemPrompt({ role: 'coding', tools });
    }

    const successPrompt = options.task
      ? '\n\n' + SuccessCriteria.fromRequest(options.task).buildPrompt()
      : '';

    return buildSystemPrompt({
      role: taskInfo?.category || 'coding',
      context: taskInfo,
      tools,
      session: sessionInfo,
    }) + successPrompt;
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
