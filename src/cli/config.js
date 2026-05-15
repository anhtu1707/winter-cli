/**
 * ❄️ CONFIG LOADER ❄️
 * Load and save Winter CLI configuration
 */

import { promises as fs } from 'fs';
import path from 'path';
import { homedir } from 'os';

export class ConfigLoader {
  constructor() {
    this.winterDir = path.join(homedir(), '.winter');
    this.configFile = path.join(this.winterDir, 'winter.json');
  }

  async load() {
    try {
      await fs.mkdir(this.winterDir, { recursive: true });
      const data = await fs.readFile(this.configFile, 'utf8');
      return JSON.parse(data);
    } catch {
      // Return defaults
      return this.getDefaults();
    }
  }

  getDefaults() {
    return {
      defaultProvider: 'ollama',
      project: {
        current: '',
        lastOpenedAt: '',
      },
      anthropic: {
        apiKey: '',
        model: 'claude-sonnet-4-20250514',
      },
      openai: {
        apiKey: '',
        model: 'gpt-4-turbo',
      },
      ollama: {
        baseURL: 'http://localhost:11434/v1',
        model: 'llama3',
      },
      groq: {
        apiKey: '',
        model: 'llama-3.1-70b-versatile',
      },
      sandbox: {
        enabled: true,
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
    await fs.writeFile(this.configFile, JSON.stringify(config, null, 2));
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
    config[provider].apiKey = apiKey;
    await this.save(config);
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
}
