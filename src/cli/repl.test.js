import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { WinterREPL } from './repl.js';

test('slash suggestions include provider, model, and bundled resources', () => {
  const repl = new WinterREPL({ projectPath: 'E:\\dev\\app\\winter' });
  const commands = repl.getSlashSuggestions('/').map(item => item.cmd);

  assert(commands.includes('/provider'));
  assert(commands.includes('/model'));
  assert(commands.includes('/resources'));
  assert(commands.includes('/codex'));
  assert(commands.includes('/auto'));
  assert(commands.includes('/debug'));
  assert(commands.includes('/history'));
  assert(commands.includes('/new'));
  assert(commands.includes('/theme:toggle'));
  assert(commands.includes('/tui'));
  assert(commands.includes('/context'));
  assert(commands.includes('/scorecard'));
});

test('provider slash suggestion uses configured provider names', () => {
  const repl = new WinterREPL({ projectPath: 'E:\\dev\\app\\winter' });
  repl.ai = {
    listProviders: () => [
      { name: 'custom' },
      { name: 'custom2' },
      { name: 'ollama' },
    ],
  };

  const provider = repl.getSlashSuggestions('/provider')[0];

  assert.equal(provider.cmd, '/provider');
  assert.match(provider.usage, /custom2/);
  assert.doesNotMatch(provider.usage, /openai\|groq/);
});

test('Freebuff-style input shortcuts route bang commands and agent mentions', async () => {
  const repl = new WinterREPL({ projectPath: process.cwd() });
  repl.readlineClosed = true;
  const handledCommands = [];
  repl.handleSlashCommand = async input => handledCommands.push(input);
  await repl.processInputTask('!npm test');
  assert.deepEqual(handledCommands, ['/bash npm test']);

  const mention = await repl.parseAgentMention('@debug fix failing test');
  assert.deepEqual(mention, { agentId: 'debug', task: 'fix failing test' });
});

test('submitted input closes any open slash menu before task handling', async () => {
  const repl = new WinterREPL({ projectPath: process.cwd() });
  repl.readlineClosed = true;
  let closed = 0;
  const handledCommands = [];
  repl.closeSlashMenu = () => {
    closed++;
  };
  repl.handleSlashCommand = async input => handledCommands.push(input);

  await repl.processInputTask('!npm test');

  assert.equal(closed > 0, true);
  assert.deepEqual(handledCommands, ['/bash npm test']);
});

test('codebase index auto-loads into project context and slash search remains callable', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'winter-codebase-'));
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ type: 'module' }), 'utf8');
  await writeFile(path.join(root, 'feature.js'), 'export function featureFlag() {\n  return "winter-codebase";\n}\n', 'utf8');

  const repl = new WinterREPL({ projectPath: root });
  repl.getRequiredLocalResourceSummary = async () => '';
  repl.readProjectInstructionFiles = async () => [];
  repl.shouldUseCompactPrompt = () => false;

  assert.equal(typeof repl.codebaseSearch, 'function');
  const context = await repl.getProjectContext('find featureFlag implementation');

  assert.match(context, /\[Codebase Index\]/);
  assert.match(context, /feature\.js/);
  assert.match(context, /featureFlag/);
});

test('startup codebase warmup is silent so it does not corrupt the prompt', async () => {
  const repl = new WinterREPL({ projectPath: process.cwd() });
  const logs = [];
  const originalLog = console.log;
  repl.codebaseSearcher = {
    indexer: {
      getStats: () => ({ totalFiles: 0, totalChunks: 0 }),
    },
    reindex: async () => ({ totalFiles: 1, totalChunks: 1 }),
  };
  repl.initCodebaseSearch = async () => {};

  console.log = (...args) => logs.push(args.join(' '));
  try {
    await repl.ensureCodebaseIndex({ verbose: false });
  } finally {
    console.log = originalLog;
  }

  assert.equal(logs.join('\n').includes('Indexing codebase'), false);
});

test('context diagnostics and scorecard expose model-visible project state', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'winter-context-diagnostics-'));
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ type: 'module' }), 'utf8');
  await writeFile(path.join(root, 'tool.js'), 'export const winterTool = true;\n', 'utf8');

  const repl = new WinterREPL({ projectPath: root });
  repl.getRequiredLocalResourceSummary = async () => '';
  repl.readProjectInstructionFiles = async () => [];
  repl.shouldUseCompactPrompt = () => false;

  const diagnostics = await repl.showContextDiagnostics('winterTool');
  const scorecard = await repl.getCapabilityScorecard();

  assert.equal(diagnostics.contextLength > 0, true);
  assert(diagnostics.sections.includes('Codebase Index'));
  assert.equal(scorecard.status, 'ready');
  assert.equal(scorecard.overall >= scorecard.target, true);
});

test('slash menu does not accept on Enter and preserves typed suffix on Tab', () => {
  const repl = new WinterREPL({ projectPath: 'E:\\dev\\app\\winter' });
  const writes = [];
  let prompted = 0;

  repl.rl = {
    line: '/pro hello world',
    write(value, options) {
      writes.push({ value, options });
    },
    prompt() {
      prompted++;
    },
  };

  repl.slashMenu = {
    open: true,
    line: '/pro hello world',
    items: [{ cmd: '/project', desc: 'Show/set current project' }],
    selected: 0,
    printedLines: 0,
  };

  assert.equal(repl.handleSlashMenuKey({ name: 'return' }), false);
  assert.equal(repl.handleSlashMenuKey({ name: 'tab' }), true);

  assert(writes.some(entry => entry.value === null && entry.options?.ctrl === true && entry.options?.name === 'u'));
  assert(writes.some(entry => entry.value === '/project hello world'));
  assert.equal(prompted > 0, true);
});

test('input panel renders as append-only bottom sidebar', () => {
  const repl = new WinterREPL({ projectPath: 'E:\\dev\\app\\winter' });
  const writes = [];
  let promptText = '';
  let promptCount = 0;
  const originalWrite = process.stdout.write;

  repl.running = true;
  repl.readlineClosed = false;
  repl.rl = {
    setPrompt(value) {
      promptText = value;
    },
    prompt() {
      promptCount++;
    },
  };

  process.stdout.write = value => {
    writes.push(String(value));
    return true;
  };

  try {
    repl.showInputPrompt();
    repl.closeInputBox();
  } finally {
    process.stdout.write = originalWrite;
  }

  const output = writes.join('');
  assert.match(promptText, /winter/);
  assert.equal(promptCount, 1);
  assert.ok(output.length > 5, 'input panel output should include border box');
  assert.match(output, /WINTER/);
  assert.notEqual(output, '\n');
  const panel = repl.buildInputPanel();
  assert.match(panel.hint, /@file/);
  assert.match(panel.hint, /!cmd/);
  assert.match(panel.hint, /\^V img/);
  assert.doesNotMatch(output, /\x1b\[[0-9;]*A/);
  assert.doesNotMatch(output, /\x1b\[[0-9;]*G/);
});

test('direct Ctrl+V clipboard image sends image without requiring a file path', async () => {
  const repl = new WinterREPL({ projectPath: 'E:\\dev\\app\\winter' });
  const writes = [];
  const chats = [];
  repl.running = true;
  repl.readlineClosed = false;
  repl.inputQueue = Promise.resolve();
  repl.getClipboardImage = async () => ({ mime: 'image/png', base64: 'AAAA' });
  repl.chat = async (prompt, images) => {
    chats.push({ prompt, images });
  };
  repl.closeInputBox = () => {};
  repl.showInputPrompt = () => {};
  repl.rl = {
    line: 'phân tích lỗi UI này',
    setPrompt() {},
    prompt() {},
    write(value, options) {
      writes.push({ value, options });
    },
  };

  const handled = await repl.inputController.handleDirectClipboardPaste();
  await repl.inputQueue;

  assert.equal(handled, true);
  assert.deepEqual(chats, [{
    prompt: 'phân tích lỗi UI này',
    images: [{ mime: 'image/png', base64: 'AAAA' }],
  }]);
  assert(writes.some(entry => entry.value === null && entry.options?.ctrl === true && entry.options?.name === 'u'));
  assert.equal(repl.isProcessing, false);
});

test('assistant markdown tables render inside a box instead of raw pipe rows', () => {
  const repl = new WinterREPL({ projectPath: 'E:\\dev\\app\\winter' });
  const logs = [];
  const originalLog = console.log;

  console.log = (...args) => {
    logs.push(args.join(' '));
  };

  try {
    repl.printAssistantAnswer(`## Đánh giá tổng thể\n\n| Tiêu chí | Rating |\n| --- | --- |\n| Code Quality | ⭐⭐⭐ (3/5) — Cần review thêm |\n| Maturity | ⭐⭐ (2/5) — Rất sớm |`, 0, {});
  } finally {
    console.log = originalLog;
  }

  const output = logs.join('\n');
  assert.match(output, /[╭+]/);
  assert.match(output, /Tiêu chí/);
  assert.match(output, /Rating/);
  assert.doesNotMatch(output, /\| --- \| --- \|/);
});

test('resource paths point at bundled project resources', () => {
  const repl = new WinterREPL({ projectPath: 'E:\\dev\\app\\winter' });
  const paths = repl.getResourcePaths();

  assert.equal(paths.localRoot, 'E:\\dev\\app\\winter\\resources\\local');
  assert.equal(paths.codex.skills, 'E:\\dev\\app\\winter\\resources\\local\\codex\\skills');
  assert.equal(paths.claude.plugins, 'E:\\dev\\app\\winter\\resources\\local\\claude\\plugins');
  assert.equal(paths.designs, 'E:\\dev\\app\\winter\\resources\\local\\awesome-design-md\\design-md');
});

test('project context includes winter.md rules', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'winter-context-'));
  await writeFile(
    path.join(root, 'winter.md'),
    '# Winter Rules\n\n- Always use Vietnamese\n- Keep changes surgical\n'
  );

  const repl = new WinterREPL({ projectPath: root });
  const context = await repl.getProjectContext();

  assert.match(context, /\[winter\.md\]/);
  assert.match(context, /Always use Vietnamese/);
  assert.match(context, /Keep changes surgical/);
});

test('project context includes local resource manifest summary', async () => {
  const repl = new WinterREPL({ projectPath: process.cwd() });
  const context = await repl.getProjectContext('show codex resources and local skills');

  assert.match(context, /\[Required Local Resource Rules\]/);
  assert.match(context, /\[Local Resources\]/);
  assert.match(context, /agents\.md/);
  assert.match(context, /awesome-design-md/);
  assert.match(context, /codex/);
});

test('project context always includes required local resource rules without full catalog', async () => {
  const repl = new WinterREPL({ projectPath: process.cwd() });
  repl.readProjectInstructionFiles = async () => [];
  repl.getRequiredLocalResourceSummary = async () => '[Required Local Resource Rules]\n- karpathy-tools\n- awesome-design-md\n- agents.md';
  repl.getLocalResourceContext = async () => '[Local Resources]\n- huge catalog';

  const context = await repl.getProjectContext('fix a small bug');

  assert.match(context, /\[Required Local Resource Rules\]/);
  assert.match(context, /karpathy-tools/);
  assert.doesNotMatch(context, /\[Local Resources\]/);
});

test('local resource context indexes Claude and Codex resource roots', async () => {
  const repl = new WinterREPL({ projectPath: process.cwd() });
  const context = await repl.getLocalResourceContext();

  assert.match(context, /Claude skills/);
  assert.match(context, /skill-creator/);
  assert.match(context, /vercel-react-best-practices/);
  assert.match(context, /Codex skills/);
  assert.match(context, /vibefigma/);
  assert.match(context, /Codex memories/);
});

test('local resource context indexes user home Codex and Claude roots', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'winter-user-roots-'));
  const codexRoot = path.join(root, '.codex');
  const claudeRoot = path.join(root, '.claude');
  await mkdir(path.join(codexRoot, 'skills'), { recursive: true });
  await mkdir(path.join(codexRoot, 'plugins'), { recursive: true });
  await mkdir(path.join(codexRoot, 'rules'), { recursive: true });
  await mkdir(path.join(codexRoot, 'memories'), { recursive: true });
  await mkdir(path.join(claudeRoot, 'skills'), { recursive: true });
  await mkdir(path.join(claudeRoot, 'plugins'), { recursive: true });
  await writeFile(path.join(codexRoot, 'skills', 'home-skill.md'), '# skill');
  await writeFile(path.join(codexRoot, 'plugins', 'home-plugin.js'), 'export default {}');
  await writeFile(path.join(codexRoot, 'rules', 'home-rule.md'), '# rule');
  await writeFile(path.join(codexRoot, 'memories', 'home-memory.md'), '# memory');
  await writeFile(path.join(claudeRoot, 'skills', 'claude-skill.md'), '# skill');
  await writeFile(path.join(claudeRoot, 'plugins', 'claude-plugin.js'), 'export default {}');

  const repl = new WinterREPL({ projectPath: process.cwd() });
  repl.contextLoader.getUserResourcePaths = () => ({
    codexRoot,
    codexSkills: path.join(codexRoot, 'skills'),
    codexPlugins: path.join(codexRoot, 'plugins'),
    codexRules: path.join(codexRoot, 'rules'),
    codexMemories: path.join(codexRoot, 'memories'),
    claudeRoot,
    claudeSkills: path.join(claudeRoot, 'skills'),
    claudePlugins: path.join(claudeRoot, 'plugins'),
    claudeRules: path.join(claudeRoot, 'rules'),
    claudeMemories: path.join(claudeRoot, 'memories'),
  });

  const context = await repl.getLocalResourceContext();

  assert.match(context, /User resource roots:/);
  assert.match(context, /Home Codex skills: home-skill\.md/);
  assert.match(context, /Home Codex plugins: home-plugin\.js/);
  assert.match(context, /Home Codex rules: home-rule\.md/);
  assert.match(context, /Home Codex memories: home-memory\.md/);
  assert.match(context, /Home Claude skills: claude-skill\.md/);
  assert.match(context, /Home Claude plugins: claude-plugin\.js/);
});

test('inferStartupSkills promotes design skills for React-like projects', async () => {
  const repl = new WinterREPL({ projectPath: process.cwd() });
  repl.contextLoader.getStartupSkillCatalog = async () => new Set([
    'coding',
    'debug',
    'refactor',
    'test',
    'design',
    'web-design-guidelines',
    'vercel-react-best-practices',
  ]);
  repl.contextLoader.getProjectSignals = async () => ['react', 'next', 'tsx', 'ui'];

  const snapshot = await repl.inferStartupSkills();

  assert(snapshot.activeSkills.includes('coding'));
  assert(snapshot.activeSkills.includes('web-design-guidelines'));
  assert(snapshot.activeSkills.includes('vercel-react-best-practices'));
  assert(snapshot.activeSkills.includes('design'));
});

test('bootstrapProjectCapabilities creates a startup plan and stores skills', async () => {
  const repl = new WinterREPL({ projectPath: process.cwd() });
  repl.contextLoader.getStartupSkillCatalog = async () => new Set(['coding', 'debug', 'refactor', 'test']);
  repl.contextLoader.getProjectSignals = async () => ['node', 'cli'];
  repl.contextLoader.getRequiredLocalResourceSummary = async () => '[Required Local Resource Rules]\n- karpathy-tools\n- awesome-design-md\n- agents.md';

  const contextStore = {};
  const plans = [];
  const memoryWrites = [];
  repl.session = {
    getContext: () => contextStore,
    getPlans: () => plans,
    createPlan: async (title, description) => {
      const plan = { id: 'plan-1', title, description };
      plans.push(plan);
      return plan;
    },
    addPlanStep: async () => {},
    updateContext: async (key, value) => {
      contextStore[key] = value;
    },
    replaceMemory: async (prefix, content) => {
      memoryWrites.push({ prefix, content });
    },
  };

  await repl.bootstrapProjectCapabilities();

  assert.equal(plans.length, 1);
  assert.equal(contextStore.bootstrapPlan.title, 'Bootstrap project context');
  assert.match(contextStore.requiredLocalResources, /karpathy-tools/);
  assert.deepEqual(contextStore.activeSkills, ['coding', 'debug', 'refactor', 'test']);
  assert(memoryWrites.some(write => write.prefix === '[Required local resources]' && /awesome-design-md/.test(write.content)));
  assert(memoryWrites.some(write => /Auto-applied skills/.test(write.content)));
});

test('shouldUseTools keeps agent mode enabled by default', () => {
  const repl = new WinterREPL({ projectPath: process.cwd() });

  assert.equal(repl.shouldUseTools('hello'), true);
  assert.equal(repl.shouldUseTools('just chat'), true);
});

test('runConversation keeps the active custom provider for review-like prompts', async () => {
  const repl = new WinterREPL({ projectPath: process.cwd() });
  const requests = [];

  repl.ai = {
    tools: [],
    providers: {
      custom: { model: 'custom-model' },
      claude: { model: 'claude-sonnet-4-20250514' },
    },
    getActiveProvider: () => 'custom',
    setTools(tools) {
      this.tools = tools;
    },
    async sendRequest(messages, options = {}) {
      requests.push({ messages, options });
      return { choices: [{ message: { content: 'done' } }] };
    },
  };
  repl.tools = { normalizeToolName: name => name, execute: async () => ({ success: true }) };

  const answer = await repl.runConversation([{ role: 'user', content: 'Please review this bug fix' }], 'Test', []);

  assert.equal(answer.finalContent, 'done');
  assert.equal(requests[0].options.provider, 'custom');
  assert.equal(requests[0].options.model, 'custom-model');
});

test('getAgentTools scopes tool access by agent role', () => {
  const repl = new WinterREPL({ projectPath: process.cwd() });

  const reviewTools = repl.getAgentTools('review').map(tool => tool.name);
  const debugTools = repl.getAgentTools('debug').map(tool => tool.name);

  assert(reviewTools.includes('Read'));
  assert(reviewTools.includes('Grep'));
  assert(!reviewTools.includes('Write'));
  assert(debugTools.includes('Write'));
  assert(debugTools.includes('Bash'));
  assert(debugTools.includes('BrowserDebug'));
});

test('parseDataUrlImage supports direct pasted image payloads', () => {
  const repl = new WinterREPL({ projectPath: process.cwd() });
  const image = repl.parseDataUrlImage('data:image/png;base64,AAAA');

  assert.equal(image.mime, 'image/png');
  assert.equal(image.base64, 'AAAA');
});

test('inferVerificationCommands uses package scripts for debug loops', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'winter-verify-'));
  await writeFile(path.join(root, 'package.json'), JSON.stringify({
    scripts: {
      test: 'node --test',
      build: 'vite build',
      lint: 'eslint .',
      typecheck: 'tsc --noEmit',
    },
  }));
  const repl = new WinterREPL({ projectPath: root });

  const commands = await repl.inferVerificationCommands('debug frontend build error');

  assert(commands.includes('npm test'));
  assert(commands.includes('npm run build'));
  assert(commands.includes('npm run typecheck'));
});

test('general chat tools stay focused for weaker models', () => {
  const repl = new WinterREPL({ projectPath: process.cwd() });
  const toolNames = repl.getAgentTools('general').map(tool => tool.name);

  assert(toolNames.includes('Read'));
  assert(toolNames.includes('Edit'));
  assert(toolNames.includes('BrowserDebug'));
  assert(toolNames.includes('Agent'));
  assert(!toolNames.includes('MCP'));
});

test('getProjectContext skips local resource catalog unless task asks for it', async () => {
  const repl = new WinterREPL({ projectPath: process.cwd() });
  repl.readProjectInstructionFiles = async () => [];
  repl.getRequiredLocalResourceSummary = async () => '[Required Local Resource Rules]\n- mandatory';
  repl.getLocalResourceContext = async () => '[Local Resources]\n- huge catalog';
  repl.tools = {
    getRuntimeEnvironmentSummary: () => 'test',
  };

  const normal = await repl.getProjectContext('fix a bug in repl');
  const resource = await repl.getProjectContext('check codex resources and skills');

  assert(normal.includes('[Required Local Resource Rules]'));
  assert(!normal.includes('[Local Resources]'));
  assert(resource.includes('[Local Resources]'));
});

test('extractModelIdsFromCache reads model slugs without service tier ids', () => {
  const repl = new WinterREPL({ projectPath: process.cwd() });
  const raw = JSON.stringify({
    models: [
      { slug: 'gpt-5.5', service_tiers: [{ id: 'priority' }] },
      { id: 'gpt-5.4-mini' },
      { name: 'custom-model' },
      { slug: 'gpt-5.5' },
    ],
  });

  assert.deepEqual(repl.extractModelIdsFromCache(raw), [
    'gpt-5.5',
    'gpt-5.4-mini',
    'custom-model',
  ]);
});

test('system prompt compresses oversized memories and project context', () => {
  const repl = new WinterREPL({ projectPath: process.cwd() });
  repl.session = {
    getSessionId: () => 'test-session',
    getMemory: () => Array.from({ length: 24 }, (_, index) => ({
      text: `Memory ${index + 1}: ${'x'.repeat(2500)}`,
    })),
    getPlans: () => [{ status: 'pending', title: 'Huge plan', description: 'y'.repeat(1200) }],
    getContext: () => ({ activeSkills: ['coding', 'debug'], bootstrapPlan: { title: 'Bootstrap', description: 'Inspect everything' } }),
  };

  const prompt = repl.getSystemPrompt('Project context ' + 'z'.repeat(18000));

  assert(prompt.length < 12000);
  assert.match(prompt, /Memories \(Important Context\)/);
  assert.match(prompt, /truncated/i);
  assert.match(prompt, /project context truncated/i);
});

test('system prompt expands for flagship models instead of staying compact', () => {
  const repl = new WinterREPL({ projectPath: process.cwd() });
  repl.ai = {
    _modelTier: 'flagship',
    getActiveProvider: () => 'openai',
    providers: {
      openai: { model: 'gpt-4o' },
    },
  };
  repl.session = {
    getSessionId: () => 'test-session',
    getMemory: () => Array.from({ length: 10 }, (_, index) => ({ text: `Memory ${index + 1}: ${'x'.repeat(600)}` })),
    getPlans: () => [{ status: 'pending', title: 'Huge plan', description: 'y'.repeat(1200) }],
    getContext: () => ({ activeSkills: ['coding', 'debug'], bootstrapPlan: { title: 'Bootstrap', description: 'Inspect everything' } }),
  };

  const prompt = repl.getSystemPrompt('Project context ' + 'z'.repeat(24000));

  assert(prompt.length > 14000);
  assert.match(prompt, /## Core Principles/);
  assert.match(prompt, /## Tool Usage/);
  assert.match(prompt, /## Project Context/);
});

test('buildPromptToolResult caps large tool outputs before final answer prompt', () => {
  const repl = new WinterREPL({ projectPath: process.cwd() });
  repl.tools = {
    summarizeToolResult: result => ({ success: result.success, path: result.path }),
  };

  const result = repl.buildPromptToolResult('Read', {
    success: true,
    path: 'big-file.js',
    content: 'x'.repeat(20000),
    lines: 1000,
    size: 20000,
  });

  assert.equal(result.success, true);
  assert.equal(result.path, 'big-file.js');
  assert.equal(result.lines, 1000);
  assert(result.content.length < 6000);
  assert.match(result.content, /truncated/i);
});

test('buildPromptToolResult preserves more tool output for flagship models', async () => {
  const repl = new WinterREPL({ projectPath: process.cwd() });
  repl.ai = {
    _modelTier: 'flagship',
    getActiveProvider: () => 'openai',
    providers: {
      openai: { model: 'gpt-4o' },
    },
  };
  repl.tools = {
    summarizeToolResult: result => ({ success: result.success, path: result.path }),
  };

  const result = await repl.buildPromptToolResultForModel('Read', {
    success: true,
    path: 'big-file.js',
    content: 'x'.repeat(20000),
    lines: 1000,
    size: 20000,
  });

  assert.equal(result.success, true);
  assert.equal(result.path, 'big-file.js');
  assert.notEqual(result.tokenJuice?.compressed, true);
  assert(result.content.length > 12000);
});

test('compactStartupMemories removes full startup resource dumps and keeps path summaries', async () => {
  const repl = new WinterREPL({ projectPath: process.cwd() });
  const memory = [
    { text: `[Tá»± Ä‘á»™ng ghi nhá»› file README.md]:\n${'x'.repeat(10000)}` },
    { text: `[Quy táº¯c dá»± Ã¡n tá»« winter.md]:\n${'y'.repeat(10000)}` },
    { text: '[Project Anchor]:\nkeep me' },
  ];
  repl.session = {
    memory,
    async replaceMemory(prefix, content, type = 'info') {
      this.memory = this.memory.filter(entry => !(entry.text || '').startsWith(prefix));
      this.memory.push({ text: `${prefix}:\n${content}`, type });
    },
  };

  await repl.compactStartupMemories({
    projectInstructionFiles: [{
      relativePath: 'winter.md',
      filePath: path.join(process.cwd(), 'winter.md'),
      content: 'important rule ' + 'z'.repeat(5000),
    }],
  });

  const joined = repl.session.memory.map(entry => entry.text).join('\n');
  assert.match(joined, /\[Project Anchor\]/);
  assert.match(joined, /\[Startup local resource index\]/);
  assert.match(joined, /\[Project rule file winter\.md\]/);
  assert(!joined.includes('x'.repeat(1000)));
  assert(!joined.includes('y'.repeat(1000)));
});

test('readCachedModels returns bundled cache model ids', async () => {
  const repl = new WinterREPL({ projectPath: process.cwd() });
  const models = await repl.readCachedModels(repl.getResourcePaths().codex.models);

  assert(models.includes('gpt-5.5'));
  assert(!models.includes('priority'));
});

test('provider slash command switches and persists configured provider', async () => {
  const repl = new WinterREPL({ projectPath: process.cwd() });
  const saved = [];
  repl.config = {
    setDefaultProvider: async provider => saved.push(provider),
  };
  repl.ai = {
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

  await repl.handleSlashCommand('/provider custom');

  assert.equal(repl.ai.getActiveProvider(), 'custom');
  assert.deepEqual(saved, ['custom']);
});

test('model slash command updates active provider model without fake SetModel tool', async () => {
  const repl = new WinterREPL({ projectPath: process.cwd() });
  const saved = [];
  let executedTool = null;
  repl.config = {
    setProviderModel: async (provider, model) => saved.push({ provider, model }),
  };
  repl.ai = {
    providers: { custom: { model: 'old-model' } },
    getActiveProvider: () => 'custom',
    updateActiveModelTier: () => { repl.tierUpdated = true; },
  };
  repl.tools = {
    execute: async (name) => { executedTool = name; return { success: true }; },
  };

  await repl.handleSlashCommand('/model smarter-small-model');

  assert.equal(repl.ai.providers.custom.model, 'smarter-small-model');
  assert.deepEqual(saved, [{ provider: 'custom', model: 'smarter-small-model' }]);
  assert.equal(repl.tierUpdated, true);
  assert.equal(executedTool, null);
});

test('shouldUseTools keeps agent mode enabled by default', () => {
  const repl = new WinterREPL({ projectPath: process.cwd() });

  assert.equal(repl.shouldUseTools('trả lời đúng một từ: ok'), true);
  assert.equal(repl.shouldUseTools('sửa lỗi trong src/cli/repl.js rồi chạy test'), true);
  assert.equal(repl.shouldUseTools('git push lên github đi'), true);
});

test('runConversation streams direct assistant answers', async () => {
  const repl = new WinterREPL({ projectPath: process.cwd() });
  repl.simulateTyping = async (text) => {
    process.stdout.write(text);
  };

  const writes = [];
  const originalWrite = process.stdout.write;
  repl.ai = {
    tools: [],
    providers: { custom: { model: 'test-model' } },
    getActiveProvider: () => 'custom',
    setTools(tools) {
      this.tools = tools;
    },
    async *streamRequest(_messages, options = {}) {
      yield { content: 'Real ', raw: { choices: [{ delta: { content: 'Real ' } }] } };
      yield {
        content: 'time',
        usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
        raw: { choices: [{ delta: { content: 'time' }, finish_reason: 'stop' }] },
      };
    },
    async sendRequest() {
      throw new Error('sendRequest should not be used for streamed answers');
    },
  };

  process.stdout.write = (chunk) => {
    writes.push(String(chunk));
    return true;
  };

  try {
    const answer = await repl.runConversation([{ role: 'user', content: 'hello' }], 'Test', [{ name: 'Read' }]);

    assert.equal(answer.finalContent, 'Real time');
    assert.match(writes.join(''), /Real time/);
    assert.match(writes.join(''), /Tokens: 5 total \(3 in, 2 out\)/);
  } finally {
    process.stdout.write = originalWrite;
  }
});

test('cancelCurrentTask aborts an active streamed provider request', async () => {
  const repl = new WinterREPL({ projectPath: process.cwd() });
  const originalWrite = process.stdout.write;
  const originalLog = console.log;
  const writes = [];
  let signalSeen = false;

  repl.currentAbortController = new AbortController();
  repl.isProcessing = true;
  repl.ai = {
    tools: [],
    providers: { custom: { model: 'slow-model' } },
    getActiveProvider: () => 'custom',
    setTools(tools) {
      this.tools = tools;
    },
    async *streamRequest(_messages, options = {}) {
      signalSeen = Boolean(options.signal);
      await new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        }, { once: true });
      });
    },
  };
  repl.tools = {
    normalizeToolName: name => name,
    async execute() {
      return { success: true };
    },
  };

  process.stdout.write = chunk => {
    writes.push(String(chunk));
    return true;
  };
  console.log = (...args) => {
    writes.push(args.join(' '));
  };

  try {
    const promise = repl.runConversation([{ role: 'user', content: 'slow answer' }], 'Test', [{ name: 'Read' }]);
    setTimeout(() => repl.cancelCurrentTask(), 1);

    await assert.rejects(promise, /AbortError/);
    assert.equal(signalSeen, true);
    assert.equal(repl.currentAbortController.signal.aborted, true);
    assert.match(writes.join('\n'), /Đã hủy công việc hiện tại/);
  } finally {
    process.stdout.write = originalWrite;
    console.log = originalLog;
    repl.isProcessing = false;
    repl.currentAbortController = null;
  }
});

test('runConversation blocks action completion claims without tool evidence and retries', async () => {
  const repl = new WinterREPL({ projectPath: process.cwd() });

  let streamCount = 0;
  const streamOptions = [];
  const executed = [];
  const writes = [];
  const originalWrite = process.stdout.write;
  repl.ai = {
    tools: [],
    providers: { custom: { model: 'test-model' } },
    getActiveProvider: () => 'custom',
    setTools(tools) {
      this.tools = tools;
    },
    async *streamRequest(_messages, options = {}) {
      streamOptions.push(options);
      streamCount++;
      if (streamCount === 1) {
        yield { content: 'Đã sửa xong rồi nhé.' };
        return;
      }
      if (streamCount === 2) {
        yield { content: '<invoke name="Read"><parameter name="file_path">README.md</parameter></invoke>' };
        return;
      }
      yield { content: 'Đã kiểm tra README.md bằng tool.' };
    },
  };
  repl.tools = {
    normalizeToolName: name => name,
    normalizeToolInput: (_name, input) => input,
    async execute(name, args) {
      executed.push({ name, args });
      return { success: true, path: args.file_path, lines: 1, size: 10, content: 'ok' };
    },
  };

  process.stdout.write = (chunk) => {
    writes.push(String(chunk));
    return true;
  };

  try {
    const answer = await repl.runConversation(
      [{ role: 'user', content: 'sửa lỗi trong README.md rồi kiểm tra lại' }],
      'Test',
      [{ name: 'Read' }]
    );

    assert.equal(answer.finalContent, 'Đã kiểm tra README.md bằng tool.');
    assert.equal(streamOptions[1]?.toolPromptOnly, true);
    assert.deepEqual(executed, [{ name: 'Read', args: { file_path: 'README.md' } }]);
    assert(!writes.join('').includes('Đã sửa xong rồi nhé.'));
  } finally {
    process.stdout.write = originalWrite;
  }
});

test('runConversation executes streamed tool calls then streams final answer', async () => {
  const repl = new WinterREPL({ projectPath: process.cwd() });
  repl.simulateTyping = async (text) => {
    process.stdout.write(text);
  };

  let streamCount = 0;
  const executed = [];
  repl.ai = {
    tools: [],
    providers: { custom: { model: 'test-model' } },
    getActiveProvider: () => 'custom',
    setTools(tools) {
      this.tools = tools;
    },
    async *streamRequest() {
      streamCount++;
      if (streamCount === 1) {
        yield {
          raw: {
            choices: [{
              delta: {
                tool_calls: [{
                  index: 0,
                  id: 'call-1',
                  type: 'function',
                  function: { name: 'Read', arguments: '{"file_path":' },
                }],
              },
            }],
          },
        };
        yield {
          raw: {
            choices: [{
              delta: {
                tool_calls: [{
                  index: 0,
                  function: { arguments: '"README.md"}' },
                }],
              },
              finish_reason: 'tool_calls',
            }],
          },
        };
        return;
      }

      yield { content: 'Done', usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 } };
    },
  };
  repl.tools = {
    normalizeToolName: name => name,
    async execute(name, args) {
      executed.push({ name, args });
      return { success: true, path: args.file_path, lines: 1, size: 2, content: 'ok' };
    },
  };

  const answer = await repl.runConversation([{ role: 'user', content: 'read it' }], 'Test', [{ name: 'Read' }]);

  assert.equal(answer.finalContent, 'Done');
  assert.deepEqual(executed, [{ name: 'Read', args: { file_path: 'README.md' } }]);
});

test('runConversation does not print a second self-critique answer for short chat replies', async () => {
  const repl = new WinterREPL({ projectPath: process.cwd() });
  let streamCount = 0;
  const writes = [];
  const originalWrite = process.stdout.write;

  repl.ai = {
    tools: [],
    providers: { custom: { model: 'short-chat-model' } },
    getActiveProvider: () => 'custom',
    setTools(tools) {
      this.tools = tools;
    },
    async *streamRequest() {
      streamCount++;
      yield { content: 'Rồi nè.' };
    },
  };
  repl.tools = {
    normalizeToolName: name => name,
    async execute() {
      throw new Error('should not execute tools');
    },
  };

  process.stdout.write = (chunk) => {
    writes.push(String(chunk));
    return true;
  };

  try {
    const answer = await repl.runConversation([{ role: 'user', content: 'alo' }], 'Test', [{ name: 'Read' }]);

    assert.equal(answer.finalContent, 'Rồi nè.');
    assert.equal(streamCount, 1);
    assert.equal(writes.join('').match(/Rồi nè\./g)?.length, 1);
  } finally {
    process.stdout.write = originalWrite;
  }
});

test('requestAssistantTurn does not retry normal response after stream rate limit', async () => {
  const repl = new WinterREPL({ projectPath: process.cwd() });
  let sendCalled = false;

  repl.ai = {
    async *streamRequest() {
      const error = new Error('Custom API stream error (429): rate limit reached on tokens per minute');
      error.status = 429;
      throw error;
    },
    async sendRequest() {
      sendCalled = true;
      return { choices: [{ message: { content: 'should not happen' } }] };
    },
  };

  await assert.rejects(
    () => repl.requestAssistantTurn([{ role: 'user', content: 'alo' }], {}, Date.now(), {}),
    /429|rate limit/i
  );
  assert.equal(sendCalled, false);
});

test('requestAssistantTurn does not retry normal response after stream timeout', async () => {
  const repl = new WinterREPL({ projectPath: process.cwd() });
  let sendCalled = false;

  repl.ai = {
    async *streamRequest() {
      throw new Error('Custom API stream timed out after 120s');
    },
    async sendRequest() {
      sendCalled = true;
      return { choices: [{ message: { content: 'should not happen' } }] };
    },
  };

  await assert.rejects(
    () => repl.requestAssistantTurn([{ role: 'user', content: 'alo' }], {}, Date.now(), {}),
    /timed out|timeout/i
  );
  assert.equal(sendCalled, false);
});

test('runConversation executes legacy function_call responses', async () => {
  const repl = new WinterREPL({ projectPath: process.cwd() });
  let requestCount = 0;
  const executed = [];

  repl.ai = {
    tools: [],
    providers: { custom: { model: 'legacy-model' } },
    getActiveProvider: () => 'custom',
    setTools(tools) {
      this.tools = tools;
    },
    async sendRequest() {
      requestCount++;
      if (requestCount === 1) {
        return {
          choices: [{
            message: {
              content: '',
              function_call: { name: 'Read', arguments: '{"file_path":"README.md"}' },
            },
            finish_reason: 'function_call',
          }],
        };
      }
      return { choices: [{ message: { content: 'Done' } }] };
    },
  };
  repl.tools = {
    normalizeToolName: name => name,
    async execute(name, args) {
      executed.push({ name, args });
      return { success: true, path: args.file_path, lines: 1, size: 2, content: 'ok' };
    },
  };

  const answer = await repl.runConversation([{ role: 'user', content: 'read README.md' }], 'Test', [{ name: 'Read' }]);

  assert.equal(answer.finalContent, 'Done');
  assert.deepEqual(executed, [{ name: 'Read', args: { file_path: 'README.md' } }]);
});

test('runConversation executes streamed legacy function_call deltas', async () => {
  const repl = new WinterREPL({ projectPath: process.cwd() });
  let streamCount = 0;
  const executed = [];

  repl.ai = {
    tools: [],
    providers: { custom: { model: 'legacy-stream-model' } },
    getActiveProvider: () => 'custom',
    setTools(tools) {
      this.tools = tools;
    },
    async *streamRequest() {
      streamCount++;
      if (streamCount === 1) {
        yield { raw: { choices: [{ delta: { function_call: { name: 'Read' } } }] } };
        yield { raw: { choices: [{ delta: { function_call: { arguments: '{"file_path":"README.md"}' } }, finish_reason: 'function_call' }] } };
        return;
      }
      yield { content: 'Done' };
    },
  };
  repl.tools = {
    normalizeToolName: name => name,
    async execute(name, args) {
      executed.push({ name, args });
      return { success: true, path: args.file_path, lines: 1, size: 2, content: 'ok' };
    },
  };

  const answer = await repl.runConversation([{ role: 'user', content: 'read README.md' }], 'Test', [{ name: 'Read' }]);

  assert.equal(answer.finalContent, 'Done');
  assert.deepEqual(executed, [{ name: 'Read', args: { file_path: 'README.md' } }]);
});

test('runToolDoctor reports success when current model triggers Read', async () => {
  const repl = new WinterREPL({ projectPath: process.cwd() });
  let requestCount = 0;
  const executed = [];

  repl.ai = {
    tools: [],
    providers: { custom: { model: 'doctor-model' } },
    getActiveProvider: () => 'custom',
    setTools(tools) {
      this.tools = tools;
    },
    async sendRequest() {
      requestCount++;
      if (requestCount === 1) {
        return {
          choices: [{
            message: {
              content: '{"tool":"Read","arguments":{"path":"README.md"}}',
            },
          }],
        };
      }
      return { choices: [{ message: { content: 'Read README.md done' } }] };
    },
  };
  repl.tools = {
    getToolDefinitions: () => [{ name: 'Read' }],
    normalizeToolName: name => name,
    normalizeToolInput: (_name, input) => input,
    summarizeToolResult: result => result,
    async execute(name, args) {
      executed.push({ name, args });
      return { success: true, path: args.path, lines: 1, size: 2, content: 'ok' };
    },
  };
  repl.session = {
    getToolEvents: () => [],
  };

  const result = await repl.runToolDoctor();

  assert.equal(result.success, true);
  assert.deepEqual(executed, [{ name: 'Read', args: { path: 'README.md' } }]);
});

test('runConversation executes multiple tool calls across multiple turns before answering', async () => {
  const repl = new WinterREPL({ projectPath: process.cwd() });
  repl.simulateTyping = async (text) => {
    process.stdout.write(text);
  };

  let streamCount = 0;
  const executed = [];
  repl.ai = {
    tools: [],
    providers: { custom: { model: 'test-model' } },
    getActiveProvider: () => 'custom',
    setTools(tools) {
      this.tools = tools;
    },
    async *streamRequest() {
      streamCount++;
      if (streamCount === 1) {
        yield {
          raw: {
            choices: [{
              delta: {
                tool_calls: [{
                  index: 0,
                  id: 'call-read',
                  type: 'function',
                  function: { name: 'Read', arguments: '{"file_path":"README.md"}' },
                }],
              },
              finish_reason: 'tool_calls',
            }],
          },
        };
        return;
      }

      if (streamCount === 2) {
        yield {
          raw: {
            choices: [{
              delta: {
                tool_calls: [{
                  index: 0,
                  id: 'call-grep',
                  type: 'function',
                  function: { name: 'Grep', arguments: '{"pattern":"Winter","path":"README.md"}' },
                }],
              },
              finish_reason: 'tool_calls',
            }],
          },
        };
        return;
      }

      yield { content: 'Finished', usage: { prompt_tokens: 6, completion_tokens: 2, total_tokens: 8 } };
    },
  };
  repl.tools = {
    normalizeToolName: name => name,
    async execute(name, args) {
      executed.push({ name, args });
      if (name === 'Read') {
        return { success: true, path: args.file_path, content: 'Winter CLI\n', lines: 1, size: 10 };
      }
      if (name === 'Grep') {
        return { success: true, pattern: args.pattern, path: args.path, matches: ['README.md:1:Winter CLI'], count: 1 };
      }
      return { success: true };
    },
  };

  const answer = await repl.runConversation([{ role: 'user', content: 'analyze README and search it' }], 'Test', [{ name: 'Read' }, { name: 'Grep' }]);

  assert.equal(answer.finalContent, 'Finished');
  assert.deepEqual(executed, [
    { name: 'Read', args: { file_path: 'README.md' } },
    { name: 'Grep', args: { pattern: 'Winter', path: 'README.md' } },
  ]);
});

test('runConversation reports malformed tool arguments instead of executing empty args', async () => {
  const repl = new WinterREPL({ projectPath: process.cwd() });

  let streamCount = 0;
  const executed = [];
  repl.ai = {
    tools: [],
    providers: { custom: { model: 'test-model' } },
    getActiveProvider: () => 'custom',
    setTools(tools) {
      this.tools = tools;
    },
    async *streamRequest() {
      streamCount++;
      if (streamCount === 1) {
        yield {
          raw: {
            choices: [{
              delta: {
                tool_calls: [{
                  index: 0,
                  id: 'call-bad',
                  type: 'function',
                  function: { name: 'Bash', arguments: '{"command":' },
                }],
              },
              finish_reason: 'tool_calls',
            }],
          },
        };
        return;
      }

      yield { content: 'Recovered' };
    },
  };
  repl.tools = {
    normalizeToolName: name => name,
    async execute(name, args) {
      executed.push({ name, args });
      return { success: true };
    },
  };

  const answer = await repl.runConversation([{ role: 'user', content: 'run it' }], 'Test', [{ name: 'Bash' }]);

  assert.equal(answer.finalContent, 'Recovered');
  assert.deepEqual(executed, []);
});

test('runConversation recovers simple string tool arguments', async () => {
  const repl = new WinterREPL({ projectPath: process.cwd() });

  let streamCount = 0;
  const executed = [];
  repl.ai = {
    tools: [],
    setTools() {},
    streamRequest: async function* () {
      streamCount++;
      if (streamCount === 1) {
        yield {
          raw: {
            choices: [{
              delta: {
                tool_calls: [{
                  index: 0,
                  id: 'call-read-string',
                  type: 'function',
                  function: { name: 'read_file', arguments: '"README.md"' },
                }],
              },
              finish_reason: 'tool_calls',
            }],
          },
        };
        return;
      }

      yield { content: 'Done' };
    },
  };
  repl.tools = {
    normalizeToolName: name => name === 'read_file' ? 'Read' : name,
    normalizeToolInput: (name, input) => name === 'Read' && typeof input === 'string' ? { file_path: input } : input,
    async execute(name, args) {
      executed.push({ name, args });
      return { success: true, path: args.file_path, lines: 1, size: 10, content: 'ok' };
    },
  };

  const answer = await repl.runConversation([{ role: 'user', content: 'read readme' }], 'Test', [{ name: 'Read' }]);

  assert.equal(answer.finalContent, 'Done');
  assert.deepEqual(executed, [{ name: 'Read', args: { file_path: 'README.md' } }]);
});

test('runConversation recovers non-json raw Bash arguments but rejects broken JSON', async () => {
  const repl = new WinterREPL({ projectPath: process.cwd() });

  const executed = [];
  repl.tools = {
    normalizeToolName: name => name,
    normalizeToolInput: (name, input) => name === 'Bash' && typeof input === 'string' ? { command: input } : input,
    async execute(name, args) {
      executed.push({ name, args });
      return { success: true, stdout: args.command };
    },
  };

  assert.deepEqual(repl.recoverToolArgs('Bash', 'npm test'), { command: 'npm test' });
  assert.equal(repl.recoverToolArgs('Bash', '{"command":'), null);
});

test('runConversation stops repeating identical tool calls and asks for a final answer', async () => {
  const repl = new WinterREPL({ projectPath: process.cwd() });

  let streamCount = 0;
  const executed = [];
  repl.ai = {
    tools: [],
    providers: { custom: { model: 'test-model' } },
    getActiveProvider: () => 'custom',
    setTools(tools) {
      this.tools = tools;
    },
    async *streamRequest(messages, options = {}) {
      streamCount++;

      if (options.enableTools === false) {
        yield { content: 'Final answer', usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 } };
        return;
      }

      yield {
        raw: {
          choices: [{
            delta: {
              tool_calls: [{
                index: 0,
                id: 'call-read',
                type: 'function',
                function: { name: 'Read', arguments: '{"file_path":"README.md"}' },
              }],
            },
            finish_reason: 'tool_calls',
          }],
        },
      };
    },
  };
  repl.tools = {
    normalizeToolName: name => name,
    async execute(name, args) {
      executed.push({ name, args });
      return { success: true, path: args.file_path, content: 'Winter CLI\n', lines: 1, size: 10 };
    },
  };

  const answer = await repl.runConversation([{ role: 'user', content: 'read it' }], 'Test', [{ name: 'Read' }]);

  assert.equal(answer.finalContent, 'Final answer');
  assert.equal(executed.length, 2);  // executes twice before 3rd repeat triggers loop detection
  assert(streamCount >= 3);
});

test('runConversation can grant Bash permission for the whole session', async () => {
  const repl = new WinterREPL({ projectPath: process.cwd() });

  let streamCount = 0;
  const prompts = [];
  const executed = [];
  repl.permissionManager = {
    shouldPromptForToolPermission: async toolName => toolName === 'Bash',
    allowTool: async () => {},
  };
  repl.rl = {
    question(prompt, callback) {
      prompts.push(prompt);
      callback('2');
    },
  };
  repl.ai = {
    tools: [],
    providers: { custom: { model: 'test-model' } },
    getActiveProvider: () => 'custom',
    setTools(tools) {
      this.tools = tools;
    },
    async *streamRequest(_messages, options = {}) {
      streamCount++;

      if (options.enableTools === false) {
        yield { content: 'Final answer' };
        return;
      }

      if (streamCount === 1) {
        yield {
          raw: {
            choices: [{
              delta: {
                tool_calls: [{
                  index: 0,
                  id: 'call-1',
                  type: 'function',
                  function: { name: 'Bash', arguments: '{"command":"echo one"}' },
                }],
              },
              finish_reason: 'tool_calls',
            }],
          },
        };
        return;
      }

      if (streamCount === 2) {
        yield {
          raw: {
            choices: [{
              delta: {
                tool_calls: [{
                  index: 0,
                  id: 'call-2',
                  type: 'function',
                  function: { name: 'Bash', arguments: '{"command":"echo two"}' },
                }],
              },
              finish_reason: 'tool_calls',
            }],
          },
        };
        return;
      }

      yield { content: 'Final answer' };
    },
  };
  repl.tools = {
    normalizeToolName: name => name,
    async execute(name, args) {
      executed.push({ name, args });
      return { success: true, stdout: args.command };
    },
  };

  const answer = await repl.runConversation([{ role: 'user', content: 'run commands' }], 'Test', [{ name: 'Bash' }]);

  assert.equal(answer.finalContent, 'Final answer');
  assert.equal(prompts.length, 1);
  assert.equal(executed.length, 2);
  assert(repl.sessionPermissionGrants.has('Bash'));
});

test('runConversation executes inline XML tool calls without printing pseudo syntax', async () => {
  const repl = new WinterREPL({ projectPath: process.cwd() });

  let streamCount = 0;
  const executed = [];
  const writes = [];
  const originalWrite = process.stdout.write;
  repl.ai = {
    tools: [],
    providers: { custom: { model: 'test-model' } },
    getActiveProvider: () => 'custom',
    setTools(tools) {
      this.tools = tools;
    },
    async *streamRequest() {
      streamCount++;
      if (streamCount === 1) {
        yield {
          content: 'Để tôi đọc file:\n<minimax:tool_call><invoke name="Read"><parameter name="path">README.md</parameter></invoke></minimax:tool_call>',
          raw: { choices: [{ delta: { content: 'inline xml' }, finish_reason: 'stop' }] },
        };
        return;
      }

      yield { content: 'Đã đọc xong' };
    },
  };
  repl.tools = {
    normalizeToolName: name => name,
    async execute(name, args) {
      executed.push({ name, args });
      return { success: true, path: args.path, lines: 1, size: 2, content: 'ok' };
    },
  };

  process.stdout.write = (chunk) => {
    writes.push(String(chunk));
    return true;
  };

  try {
    const answer = await repl.runConversation([{ role: 'user', content: 'read it' }], 'Test', [{ name: 'Read' }]);

    assert.equal(answer.finalContent, 'Đã đọc xong');
    assert.deepEqual(executed, [{ name: 'Read', args: { path: 'README.md' } }]);
    assert.doesNotMatch(writes.join(''), /minimax:tool_call/);
  } finally {
    process.stdout.write = originalWrite;
  }
});

test('runConversation executes provider-agnostic inline XML tool calls from non-stream responses', async () => {
  const repl = new WinterREPL({ projectPath: process.cwd() });

  const executed = [];
  const writes = [];
  const originalWrite = process.stdout.write;
  const originalLog = console.log;
  let requestCount = 0;
  repl.ai = {
    providers: { custom: { model: 'test-model' } },
    getActiveProvider: () => 'custom',
    setTools() {},
    async sendRequest() {
      requestCount++;
      if (requestCount > 1) {
        return {
          choices: [{
            message: { content: 'Đã kiểm tra xong.' },
            finish_reason: 'stop',
          }],
        };
      }
      return {
        choices: [{
          message: {
            content: [
              'Để tôi kiểm tra Sidebar.',
              '<some-model:tool_call>',
              '<invoke name="Read">',
              '<parameter name="path">G:\\AI\\app\\kira\\kira-sqlite-viewer\\src\\renderer\\src\\components\\Sidebar.tsx</parameter>',
              '</invoke>',
              '</some-model:tool_call>',
            ].join('\n'),
          },
          finish_reason: 'stop',
        }],
      };
    },
  };
  repl.tools = {
    normalizeToolName: name => name,
    async execute(name, args) {
      executed.push({ name, args });
      return { success: true, path: args.path, lines: 1, size: 2, content: 'ok' };
    },
  };

  process.stdout.write = (chunk) => {
    writes.push(String(chunk));
    return true;
  };
  console.log = (...args) => {
    writes.push(args.join(' '));
  };

  try {
    await repl.runConversation([{ role: 'user', content: 'read sidebar' }], 'Test', [{ name: 'Read' }]);

    assert.equal(executed.length, 1);
    assert.equal(executed[0].name, 'Read');
    assert.equal(executed[0].args.path, 'G:\\AI\\app\\kira\\kira-sqlite-viewer\\src\\renderer\\src\\components\\Sidebar.tsx');
    assert.doesNotMatch(writes.join(''), /some-model:tool_call/);
    assert.doesNotMatch(writes.join(''), /<invoke name="Read">/);
  } finally {
    process.stdout.write = originalWrite;
    console.log = originalLog;
  }
});

test('interactive prompt and system prompt do not brand Winter with emoji', () => {
  const repl = new WinterREPL({ projectPath: process.cwd() });

  assert.match(repl.getSystemPrompt(''), /You are Winter, an expert AI coding assistant/);
  assert.doesNotMatch(repl.getSystemPrompt(''), /You are Winter ❄️/);
});
