/**
 * ❄ CONFIG LOADER ❄
 * Load and save Winter CLI configuration
 */

import { promises as fs } from 'fs';
import path from 'path';
import { homedir } from 'os';
import { loadEnvFile, stripInlineSecrets } from './secret-env.js';

export class ConfigLoader {
  constructor() {
    this.winterDir = path.join(homedir(), '.winter');
    this.configFile = path.join(this.winterDir, 'winter.json');
    this.envFile = path.join(this.winterDir, 'secrets.env');
  }

  async load() {
    try {
      await fs.mkdir(this.winterDir, { recursive: true });
      await loadEnvFile(this.envFile);
      const data = await fs.readFile(this.configFile, 'utf8');
      const config = JSON.parse(data.replace(/^\uFEFF/, ''));
      return this.applyEnv(config);
    } catch {
      // Return defaults
      await loadEnvFile(this.envFile);
      return this.applyEnv(this.getDefaults());
    }
  }

  applyEnv(config) {
    const next = structuredClone(config || this.getDefaults());
    for (const [provider, section] of Object.entries(next)) {
      if (!section || typeof section !== 'object' || Array.isArray(section)) continue;
      const apiKeyEnv = section.apiKeyEnv;
      const authTokenEnv = section.authTokenEnv;
      if (apiKeyEnv && process.env[apiKeyEnv]) {
        section.apiKey = process.env[apiKeyEnv];
      } else if (apiKeyEnv && typeof apiKeyEnv === 'string' && apiKeyEnv.trim() && !/^[A-Z_][A-Z0-9_]*$/i.test(apiKeyEnv.trim())) {
        // Fallback: if apiKeyEnv contains a raw key value (not an env var name), use it directly
        section.apiKey = apiKeyEnv;
      }
      if (authTokenEnv && process.env[authTokenEnv]) {
        section.authToken = process.env[authTokenEnv];
      } else if (authTokenEnv && typeof authTokenEnv === 'string' && authTokenEnv.trim() && !/^[A-Z_][A-Z0-9_]*$/i.test(authTokenEnv.trim())) {
        // Fallback: if authTokenEnv contains a raw token value (not an env var name), use it directly
        section.authToken = authTokenEnv;
      }
    }
    return next;
  }

  getDefaults() {
    return {
      defaultProvider: 'ollama',
      project: {
        current: '',
        lastOpenedAt: '',
      },
      permissions: {
        promptByDefault: true,
        allowlist: {
          tools: ['Read', 'Glob', 'Grep', 'LSP', 'TaskCreate', 'TaskUpdate', 'TaskList', 'WebFetch', 'WebSearch', 'Parallel'],
          commands: [],
          mcpServers: [],
        },
      },
      mcp: {
        servers: [],
      },
      routing: {
        strategy: 'heuristic',
        fastModel: '',
        deepModel: '',
      },
      reliability: {
        retryAttempts: 3,
        retryBaseDelayMs: 100,
      },
      analytics: {
        enabled: true,
        toolUsage: true,
      },
      ui: {
        theme: 'dark',
      },
      anthropic: {
        apiKeyEnv: 'ANTHROPIC_API_KEY',
        model: 'claude-sonnet-4-20250514',
      },
      openai: {
        apiKeyEnv: 'OPENAI_API_KEY',
        model: 'gpt-4-turbo',
      },
      ollama: {
        baseURL: 'http://localhost:11434/v1',
        model: 'llama3',
      },
      groq: {
        apiKeyEnv: 'GROQ_API_KEY',
        model: 'llama-3.1-70b-versatile',
      },
      sandbox: {
        enabled: true,
        restrictToWorkspace: true,
        allowedCommands: ['git', 'npm', 'node', 'python'],
      },
      session: {
        autoSave: true,
        maxHistory: 100,
      },
    };
  }

  async save(config) {
    await fs.mkdir(this.winterDir, { recursive: true });
    await fs.writeFile(this.configFile, JSON.stringify(stripInlineSecrets(config), null, 2));
  }

  get(key, defaultValue = null) {
    // Synchronous access not supported, use load()
    return defaultValue;
  }

  set(key, value) {
    // Synchronous set not supported, use save()
  }

  async getAll() {
    return this.load();
  }

  async setProviderApiKey(provider, apiKey) {
    const config = await this.load();
    config[provider] = config[provider] || {};
    const envName = config[provider].apiKeyEnv || `WINTER_${String(provider).toUpperCase()}_API_KEY`;
    config[provider].apiKeyEnv = envName;
    await this.appendSecretEnv(envName, apiKey);
    await this.save(config);
  }

  async appendSecretEnv(key, value) {
    await fs.mkdir(this.winterDir, { recursive: true });
    let current = '';
    try {
      current = await fs.readFile(this.envFile, 'utf8');
    } catch {}
    const lines = current.split(/\r?\n/).filter(line => line.trim() && !line.startsWith(`${key}=`));
    lines.push(`${key}=${String(value || '').replace(/\r?\n/g, '')}`);
    await fs.writeFile(this.envFile, `${lines.join('\n')}\n`, 'utf8');
    process.env[key] = String(value || '');
  }

  async backupConfig(label = 'manual') {
    await fs.mkdir(path.join(this.winterDir, 'backups'), { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(this.winterDir, 'backups', `winter-${label}-${timestamp}.json`);
    try {
      const raw = await fs.readFile(this.configFile, 'utf8');
      await fs.writeFile(backupPath, raw, 'utf8');
      return backupPath;
    } catch {
      await fs.writeFile(backupPath, JSON.stringify(this.getDefaults(), null, 2), 'utf8');
      return backupPath;
    }
  }

  async restoreConfig(backupPath) {
    if (!backupPath) throw new Error('backupPath is required');
    const raw = await fs.readFile(backupPath, 'utf8');
    JSON.parse(raw);
    await fs.mkdir(this.winterDir, { recursive: true });
    await fs.writeFile(this.configFile, raw, 'utf8');
  }

  async migrateSecrets() {
    await fs.mkdir(this.winterDir, { recursive: true });
    const backupPath = await this.backupConfig('pre-secret-migration');
    let rawConfig;
    try {
      rawConfig = JSON.parse(await fs.readFile(this.configFile, 'utf8'));
    } catch {
      rawConfig = this.getDefaults();
    }

    for (const [provider, section] of Object.entries(rawConfig)) {
      if (!section || typeof section !== 'object' || Array.isArray(section)) continue;
      if (typeof section.apiKey === 'string' && section.apiKey) {
        const envName = section.apiKeyEnv || `WINTER_${String(provider).toUpperCase()}_API_KEY`;
        await this.appendSecretEnv(envName, section.apiKey);
        section.apiKeyEnv = envName;
        delete section.apiKey;
      }
      if (typeof section.authToken === 'string' && section.authToken) {
        const envName = section.authTokenEnv || `WINTER_${String(provider).toUpperCase()}_AUTH_TOKEN`;
        await this.appendSecretEnv(envName, section.authToken);
        section.authTokenEnv = envName;
        delete section.authToken;
      }
    }

    await this.save(rawConfig);
    return { backupPath, envFile: this.envFile };
  }

  async setDefaultProvider(provider) {
    const config = await this.load();
    config.defaultProvider = provider;
    await this.save(config);
  }

  async setProviderModel(provider, model) {
    const config = await this.load();
    config[provider] = config[provider] || {};
    config[provider].model = model;
    await this.save(config);
  }

  async setProjectCurrent(projectPath) {
    const config = await this.load();
    config.project = config.project || {};
    config.project.current = projectPath;
    config.project.lastOpenedAt = new Date().toISOString();
    await this.save(config);
  }

  async setPermissionAllowlist(allowlist = {}) {
    const config = await this.load();
    config.permissions = config.permissions || { allowlist: {} };
    config.permissions.allowlist = {
      tools: [...new Set([...(config.permissions.allowlist.tools || []), ...(allowlist.tools || [])])],
      commands: [...new Set([...(config.permissions.allowlist.commands || []), ...(allowlist.commands || [])])],
      mcpServers: [...new Set([...(config.permissions.allowlist.mcpServers || []), ...(allowlist.mcpServers || [])])],
    };
    if (allowlist.promptByDefault !== undefined) {
      config.permissions.promptByDefault = Boolean(allowlist.promptByDefault);
    }
    await this.save(config);
  }

  async setMcpServers(servers = []) {
    const config = await this.load();
    config.mcp = config.mcp || {};
    config.mcp.servers = Array.isArray(servers) ? servers : [];
    await this.save(config);
  }

  async setRoutingStrategy(routing = {}) {
    const config = await this.load();
    config.routing = {
      ...(config.routing || {}),
      ...routing,
    };
    await this.save(config);
  }

  async setReliability(reliability = {}) {
    const config = await this.load();
    config.reliability = {
      ...(config.reliability || {}),
      ...reliability,
    };
    await this.save(config);
  }

  async setUiTheme(theme = 'dark') {
    const config = await this.load();
    config.ui = config.ui || {};
    config.ui.theme = String(theme || 'dark').toLowerCase() === 'light' ? 'light' : 'dark';
    await this.save(config);
    return config.ui.theme;
  }
}
