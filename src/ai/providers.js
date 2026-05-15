/**
 * ❄️ WINTER AI PROVIDER ❄️
 * Full Claude Code / Codex compatible AI integration
 */

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

    // Load auth token from Claude Code's auth.json if available
    this.authToken = await this.loadAuthToken();

    if (cfg.claude?.baseURL || this.authToken) {
      this.providers.claude = {
        name: 'Claude-compatible API',
        baseURL: cfg.claude?.baseURL || 'http://localhost:4000/v1',
        authToken: this.authToken,
        apiKey: cfg.claude?.apiKey,
        model: cfg.claude?.model || 'nvidia/moonshotai/kimi-k2.6',
        ready: !!this.authToken || !!cfg.claude?.apiKey || cfg.claude?.apiKey === 'not-required',
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
    const defaultProvider = cfg.defaultProvider || 'claude';
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

  setProvider(name) {
    if (this.providers[name]) {
      this.activeProvider = name;
      return true;
    }
    return false;
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
    const provider = this.providers[this.activeProvider];
    return await this.sendRequestToProvider(provider, messages, options);
  }

  async *streamRequest(messages, options = {}) {
    await this.init();
    const provider = this.providers[this.activeProvider];
    yield* this.streamRequestToProvider(provider, messages, options);
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

  getSystemPrompt() {
    return `You are Winter, an expert AI coding assistant.

## Core Principles
1. **Think Before Coding** - State assumptions, ask when unclear
2. **Simplicity First** - Minimum code that solves the problem
3. **Surgical Changes** - Touch only what you must
4. **Goal-Driven Execution** - Define success criteria, verify results

## Tools
You have access to tools: Read, Write, Edit, Bash, Glob, Grep, TaskCreate, TaskUpdate

Use tools when they help. Be proactive.
After using tools, always provide a direct final answer to the user.
Answer normal questions directly without unnecessary legal or policy disclaimers.
If a request is illegal, unsafe, or harmful, refuse briefly and offer a safe alternative.`;
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
