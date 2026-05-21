import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
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
      { icon: '■', name: 'coding', description: 'Code analysis, generation, and review' },
      { icon: '♻', name: 'refactor', description: 'AI-assisted refactoring and behavior-safe cleanup', mode: 'AI-assisted' },
    ],
    enableSkill: async () => true,
    createSkill: async () => {},
  };

  parser.plugins = {
    listPlugins: async () => [
      { icon: '❄', name: 'winter-core', version: '1.0.0' },
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
  assert(logs.some(line => line.includes('Skills System: Strong')));
  assert(logs.some(line => line.includes('skill-creator')));
  assert(logs.some(line => line.includes('AI-assisted')));
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

test('tui command renders dashboard in slash and plain command modes', async () => {
  const parser = createParser();
  parser.ai = {
    providers: {
      custom: { model: 'gpt-test', ready: true },
    },
    init: async () => {},
    getActiveProvider: () => 'custom',
  };
  const logs = [];
  const originalLog = console.log;

  console.log = (...args) => logs.push(args.join(' '));
  try {
    await parser.parse(['/tui']);
    await parser.parse(['tui']);
  } finally {
    console.log = originalLog;
  }

  const output = logs.join('\n');
  assert.match(output, /Winter will run commands on your behalf/);
  assert.match(output, /gpt-test/);
  assert.doesNotMatch(output, /Unknown slash command/);
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

test('debug and auto commands route to chat with auto-debug prompt', async () => {
  const parser = createParser();
  const calls = [];
  parser.ai.chat = async message => {
    calls.push(message);
    return { content: 'ok' };
  };

  await parser.parse(['debug', 'npm', 'test', 'fails']);
  await parser.parse(['/auto', 'fix', 'lint']);

  assert.match(calls[0], /AUTO DEBUG: npm test fails/);
  assert.match(calls[1], /AUTO DEBUG: fix lint/);
});

test('autopilot command routes to chat with verification contract', async () => {
  const parser = createParser();
  const calls = [];
  parser.ai.chat = async message => {
    calls.push(message);
    return { content: 'ok' };
  };

  await parser.parse(['autopilot', 'fix', 'failing', 'tests']);
  await parser.parse(['/autopilot', 'stabilize', 'build']);

  assert.match(calls[0], /AUTOPILOT TASK: fix failing tests/);
  assert.match(calls[0], /Run verification commands after changes/);
  assert.match(calls[1], /AUTOPILOT TASK: stabilize build/);
});

test('autopilot supports max-loops and custom verify commands', async () => {
  const parser = createParser();
  const calls = [];
  parser.ai.chat = async message => {
    calls.push(message);
    return { content: 'ok' };
  };

  await parser.parse([
    'autopilot',
    'tighten',
    'ci',
    '--max-loops',
    '5',
    '--verify',
    'npm run lint;npm test',
  ]);

  assert.match(calls[0], /AUTOPILOT TASK: tighten ci/);
  assert.match(calls[0], /iterate up to 5 loops/);
  assert.match(calls[0], /npm run lint && npm test/);
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

test('ecc and page-agent slash commands browse bundled resources', async () => {
  const parser = createParser();
  parser.htmlfx = {
    info: async () => ({ repoPath: 'x', binaryReady: false }),
  };
  const logs = [];
  const originalLog = console.log;

  console.log = (...args) => logs.push(args.join(' '));
  try {
    await parser.parse(['/ecc']);
    await parser.parse(['/ecc', 'search', 'hook']);
    await parser.parse(['/page-agent']);
    await parser.parse(['/page-agent', 'search', 'dom']);
    await parser.parse(['/htmlfx']);
  } finally {
    console.log = originalLog;
  }

  assert(logs.some(line => line.includes('ECC:')));
  assert(logs.some(line => line.includes('ECC search "hook"')));
  assert(logs.some(line => line.includes('page-agent:')));
  assert(logs.some(line => line.includes('Page Agent search "dom"')));
  assert(logs.some(line => line.includes('html-effectiveness:')));
  assert(!logs.some(line => line.includes('Unknown slash command')));
});

test('page-agent commands work in the non-interactive CLI parser', async () => {
  const parser = createParser();
  const calls = [];
  parser.tools = {
    execute: async (tool, input) => {
      calls.push({ tool, input });
      if (tool === 'WebFetch') {
        return { success: true, content: 'example page content' };
      }
      return { success: true };
    },
  };

  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => logs.push(args.join(' '));

  try {
    await parser.parse(['page-agent', 'snippet']);
    await parser.parse(['page-agent', 'browse', 'https://example.com']);
  } finally {
    console.log = originalLog;
  }

  const output = logs.join('\n');
  assert.match(output, /Page Agent quickstart:/);
  assert.match(output, /Page Agent browse:/);
  assert.match(output, /example page content/);
  assert(calls.some(call => call.tool === 'WebFetch'));
  assert.doesNotMatch(output, /Unknown command/);
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

test('plan option builder returns preset and custom choices', () => {
  const parser = createParser();
  const options = parser.buildPlanOptions(
    'build webapp',
    {
      recommendedSkills: ['coding', 'test'],
      verificationStrategy: ['unit tests', 'build check'],
    },
    {
      scaffold: ['init app', 'install deps'],
      architecture: ['design modules', 'implement slices'],
    }
  );

  assert.equal(options.length, 4);
  assert.equal(options[0].id, 'mvp');
  assert.equal(options[3].id, 'custom');
  assert(options[1].steps.some(step => step.includes('Apply skills')));
});

test('plan export and apply create markdown/json and skeleton files', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'winter-plan-export-'));
  const parser = createParser();
  parser.projectPath = root;

  const task = 'build mobile app auth';
  const workflow = { profile: 'mobile-build', depth: 'balanced' };
  const selected = {
    id: 'balanced',
    title: 'Balanced chuẩn',
    description: 'Cân bằng tốc độ và chất lượng',
    steps: ['Init app', 'Add auth module', 'Run tests'],
  };

  const mdPath = await parser.exportPlanArtifact({
    task,
    workflow,
    selected,
    format: 'md',
  });
  const jsonPath = await parser.exportPlanArtifact({
    task,
    workflow,
    selected,
    format: 'json',
  });
  const skeletonPath = await parser.applyPlanSkeleton({
    task,
    selected,
    workflow,
    exportPath: mdPath,
  });

  const mobileFeatureTasks = path.join(root, 'src', 'features', 'build-mobile-app-auth', 'tasks.md');
  const mobileNavigationReadme = path.join(root, 'src', 'navigation', 'README.md');

  const [mdText, jsonText, skeletonText, featureTasksText, navigationText] = await Promise.all([
    readFile(mdPath, 'utf8'),
    readFile(jsonPath, 'utf8'),
    readFile(skeletonPath, 'utf8'),
    readFile(mobileFeatureTasks, 'utf8'),
    readFile(mobileNavigationReadme, 'utf8'),
  ]);

  assert(mdText.includes('# Winter Plan'));
  assert(mdText.includes('## Steps'));
  assert(jsonText.includes('"profile": "mobile-build"'));
  assert(jsonText.includes('"steps"'));
  assert(skeletonText.includes('# Plan Task List'));
  assert(skeletonText.includes('- [ ] Add auth module'));
  assert(skeletonText.includes('Scaffold Profile: mobile'));
  assert(featureTasksText.includes('- [ ] Add auth module'));
  assert(navigationText.includes('# Navigation'));
});

test('plan apply scaffold keeps existing files instead of overwriting', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'winter-plan-scaffold-'));
  const parser = createParser();
  parser.projectPath = root;

  const existingPath = path.join(root, 'src', 'features', 'build-webapp-auth', 'README.md');
  await mkdir(path.dirname(existingPath), { recursive: true });
  await writeFile(existingPath, 'USER CONTENT\n', 'utf8');

  await parser.applyPlanSkeleton({
    task: 'build webapp auth',
    workflow: { profile: 'webapp-build', depth: 'standard' },
    selected: {
      id: 'balanced',
      title: 'Balanced',
      description: 'Balanced plan',
      steps: ['Create routes', 'Add auth UI'],
    },
  });

  const existingText = await readFile(existingPath, 'utf8');
  const e2eReadme = await readFile(path.join(root, 'tests', 'e2e', 'README.md'), 'utf8');

  assert.equal(existingText, 'USER CONTENT\n');
  assert(e2eReadme.includes('E2E Tests'));
});
