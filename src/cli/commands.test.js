import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { CommandParser, redactSecrets } from './commands.js';
import { PluginManager } from '../plugins/manager.js';

function createParser() {
  const session = {
    getSessionId: () => '12345678-1234-1234-1234-123456789abc',
    updateContext: async () => {},
    addToMemory: async () => {},
    getMemory: () => [],
    getPlans: () => [],
    newSession: async () => ({ id: '12345678-1234-1234-1234-123456789abc' }),
    saveSession: async () => {},
    listSessions: async () => [],
    switchSession: async () => true,
  };

  const ai = {
    chat: async () => ({ content: 'ok' }),
    callAllProviders: async () => ({}),
    clearCache: () => {},
    getCacheStats: () => ({ size: 0, activeProvider: 'ollama' }),
  };

  const config = { load: async () => ({}) };
  const parser = new CommandParser({ session, ai, config });

  parser.skills = {
    listSkills: async () => [
      { icon: '💻', name: 'coding', description: 'Code analysis, generation, and review' },
    ],
    enableSkill: async () => true,
    createSkill: async () => {},
  };

  parser.plugins = {
    listPlugins: async () => [
      { icon: '❄️', name: 'winter-core', version: '1.0.0' },
    ],
    installPlugin: async () => {},
    removePlugin: async () => {},
  };

  return parser;
}

test('config output redacts provider secrets recursively', async () => {
  const config = {
    defaultProvider: 'custom',
    custom: {
      baseURL: 'http://localhost:4000/v1',
      apiKey: 'sk-live-secret',
      nested: {
        authToken: 'npm-secret-token',
      },
    },
    project: {
      current: 'E:\\dev\\app\\winter',
    },
  };

  const redacted = redactSecrets(config);

  assert.equal(redacted.custom.apiKey, '[redacted]');
  assert.equal(redacted.custom.nested.authToken, '[redacted]');
  assert.equal(redacted.custom.baseURL, config.custom.baseURL);
  assert.equal(redacted.project.current, config.project.current);
  assert.equal(config.custom.apiKey, 'sk-live-secret');
});

test('skill and plugin commands default to list output', async () => {
  const parser = createParser();
  const logs = [];
  const originalLog = console.log;

  console.log = (...args) => {
    logs.push(args.join(' '));
  };

  try {
    await parser.parse(['skill']);
    await parser.parse(['plugin']);
  } finally {
    console.log = originalLog;
  }

  assert(logs.some(line => line.includes('Available Skills')));
  assert(logs.some(line => line.includes('Installed Plugins')));
});

test('slash provider command switches and persists provider', async () => {
  const session = {
    getSessionId: () => '12345678-1234-1234-1234-123456789abc',
    addToMemory: async () => {},
    getMemory: () => [],
    getPlans: () => [],
  };
  const saved = [];
  const ai = {
    active: 'ollama',
    providers: {
      custom: { model: 'custom-model', ready: true },
      ollama: { model: 'llama3', ready: true },
    },
    async switchProvider(name) {
      if (!this.providers[name]) return null;
      this.active = name;
      return name;
    },
    getActiveProvider() {
      return this.active;
    },
    listProviders() {
      return Object.entries(this.providers).map(([name, provider]) => ({ name, ...provider }));
    },
  };
  const parser = new CommandParser({
    session,
    ai,
    config: {
      setDefaultProvider: async provider => saved.push(provider),
    },
  });

  await parser.parse(['/provider', 'custom']);

  assert.equal(ai.getActiveProvider(), 'custom');
  assert.deepEqual(saved, ['custom']);
});

test('slash providers command lists available providers', async () => {
  const parser = createParser();
  parser.ai = {
    init: async () => {},
    getActiveProvider: () => 'custom',
    listProviders: () => [
      { name: 'custom', ready: true, model: 'custom-model' },
    ],
  };
  const logs = [];
  const originalLog = console.log;

  console.log = (...args) => logs.push(args.join(' '));
  try {
    await parser.parse(['/providers']);
  } finally {
    console.log = originalLog;
  }

  assert(logs.some(line => line.includes('custom')));
  assert(logs.some(line => line.includes('custom-model')));
});

test('provider command switches and persists provider without slash', async () => {
  const saved = [];
  const ai = {
    active: 'ollama',
    providers: {
      custom: { model: 'custom-model', ready: true },
      ollama: { model: 'llama3', ready: true },
    },
    async switchProvider(name) {
      if (!this.providers[name]) return null;
      this.active = name;
      return name;
    },
    getActiveProvider() {
      return this.active;
    },
    listProviders() {
      return Object.entries(this.providers).map(([name, provider]) => ({ name, ...provider }));
    },
  };
  const parser = new CommandParser({
    session: {
      getSessionId: () => '12345678-1234-1234-1234-123456789abc',
      getMemory: () => [],
      getPlans: () => [],
    },
    ai,
    config: {
      setDefaultProvider: async provider => saved.push(provider),
    },
  });

  await parser.parse(['provider', 'custom']);

  assert.equal(ai.getActiveProvider(), 'custom');
  assert.deepEqual(saved, ['custom']);
});

test('model command sets active provider model with and without slash', async () => {
  const saved = [];
  const ai = {
    active: 'custom',
    providers: {
      custom: { model: 'old-model', ready: true },
      ollama: { model: 'llama3', ready: true },
    },
    init: async () => {},
    reload: async () => {},
    getActiveProvider() {
      return this.active;
    },
    listProviders() {
      return Object.entries(this.providers).map(([name, provider]) => ({ name, ...provider }));
    },
  };
  const parser = new CommandParser({
    session: {
      getSessionId: () => '12345678-1234-1234-1234-123456789abc',
      getMemory: () => [],
      getPlans: () => [],
    },
    ai,
    config: {
      setProviderModel: async (provider, model) => saved.push({ provider, model }),
    },
  });

  await parser.parse(['model', 'new-model']);
  await parser.parse(['/model', 'ollama', 'llama3.1']);

  assert.deepEqual(saved, [
    { provider: 'custom', model: 'new-model' },
    { provider: 'ollama', model: 'llama3.1' },
  ]);
  assert.equal(ai.providers.custom.model, 'new-model');
  assert.equal(ai.providers.ollama.model, 'llama3.1');
});

test('mcp and permissions commands update config state', async () => {
  const saved = [];
  const config = {
    load: async () => ({
      mcp: { servers: [] },
      permissions: { promptByDefault: true, allowlist: { tools: [], commands: [], mcpServers: [] } },
    }),
    save: async value => saved.push(value),
    setPermissionAllowlist: async value => saved.push(value),
  };
  const parser = createParser();
  parser.config = config;

  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => logs.push(args.join(' '));

  try {
    await parser.parse(['mcp', 'add', 'workspace', 'node', '["src/mcp/server.js"]']);
    await parser.parse(['permissions', 'allow', 'tool', 'Bash']);
  } finally {
    console.log = originalLog;
  }

  assert(saved.length > 0);
  assert(logs.some(line => line.includes('Added MCP server')));
  assert(logs.some(line => line.includes('Allowed tool')));
});

test('plugin manager loads local plugin files via file URLs', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'winter-plugin-load-'));
  const pluginsDir = path.join(root, '.winter', 'plugins');
  await mkdir(pluginsDir, { recursive: true });
  await writeFile(
    path.join(pluginsDir, 'example.js'),
    'export default { name: "example", version: "2.0.0", icon: "✨", description: "Example plugin" };\n'
  );

  const manager = new PluginManager({
    addToMemory: async () => {},
  });
  manager.pluginsDir = pluginsDir;

  const plugins = await manager.listPlugins();
  const loaded = plugins.find(plugin => plugin.name === 'example');

  assert(loaded);
  assert.equal(loaded.version, '2.0.0');
  assert.equal(loaded.icon, '✨');
});
