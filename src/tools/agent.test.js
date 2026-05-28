import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AgentTool } from './agent.js';

function makeRepl(overrides = {}) {
  const definitions = [
    { name: 'Read' },
    { name: 'Write' },
    { name: 'Bash' },
    { name: 'Grep' },
    { name: 'Agent' },
  ];
  let activeProvider = 'custom';
  const repl = {
    projectPath: process.cwd(),
    ai: {
      getActiveProvider: () => activeProvider,
      setProvider: name => {
        if (name === 'missing') return false;
        activeProvider = name;
        return true;
      },
    },
    tools: {
      getToolDefinitions: () => definitions,
    },
    agentRegistry: {
      async get(id = 'general') {
        return {
          id,
          tools: id === 'review' ? ['Read', 'Grep'] : ['Read', 'Write', 'Bash', 'Grep'],
          instructionsPrompt: `Agent ${id}`,
        };
      },
    },
    getAgentToolsForDefinition(definition) {
      return definitions.filter(tool => definition.tools.includes(tool.name));
    },
    async getProjectContext() {
      return 'Project context';
    },
    getAgentDefinitionSystemPrompt(definition, context) {
      return [`role=${definition.id}`, `tools=${definition.tools.join(',')}`, context].join('\n');
    },
    async runConversation(messages, label, tools) {
      return {
        finalContent: `done ${label}`,
        usedTools: true,
        usedMutatingTools: true,
        autoVerified: true,
        autoVerificationPassed: true,
        changedFiles: ['src/example.js'],
        toolSummaries: [`tools=${tools.map(tool => tool.name).join(',')}`],
        executedTools: [{ tool: 'Write', success: true }],
        usage: { total_tokens: 42 },
        messages,
      };
    },
    ...overrides,
  };
  return repl;
}

test('AgentTool run executes a real isolated subagent conversation', async () => {
  const tool = new AgentTool(makeRepl());
  const result = await tool.run('Refactor the authentication module', {
    role: 'swe',
    maxSteps: 5,
    tools: ['Read', 'Write'],
  });

  assert.equal(result.success, true);
  assert.ok(result.agentId);
  assert.equal(result.task, 'Refactor the authentication module');
  assert.equal(result.status, 'completed');
  assert.equal(result.role, 'swe');
  assert.equal(result.maxSteps, 5);
  assert.deepEqual(result.allowedTools, ['Read', 'Write']);
  assert.deepEqual(result.changedFiles, ['src/example.js']);
  assert.equal(result.usedTools, true);
  assert.equal(result.autoVerified, true);
  assert.match(result.summary, /done Subagent/);
});

test('AgentTool run rejects empty task', async () => {
  const tool = new AgentTool(makeRepl());
  const result = await tool.run('');
  assert.equal(result.success, false);
  assert.ok(result.error);
});

test('AgentTool run requires a live REPL runtime', async () => {
  const tool = new AgentTool(null);
  const result = await tool.run('Do something');
  assert.equal(result.success, false);
  assert.match(result.error, /live REPL runtime/);
});

test('AgentTool run caps and floors maxSteps', async () => {
  const tool = new AgentTool(makeRepl());
  const capped = await tool.run('Do something', { maxSteps: 100 });
  const floored = await tool.run('Do something else', { maxSteps: -5 });

  assert.equal(capped.maxSteps, 25);
  assert.equal(floored.maxSteps, 1);
});

test('AgentTool stores completed status for result passing', async () => {
  const tool = new AgentTool(makeRepl());
  const result = await tool.run('Do something');
  const status = await tool.status(result.agentId);
  const list = await tool.list();

  assert.equal(status.success, true);
  assert.equal(status.agent.status, 'completed');
  assert.equal(list.success, true);
  assert.equal(list.count, 1);
});

test('AgentTool isolates subagent crashes and timeouts', async () => {
  const crashing = new AgentTool(makeRepl({
    async runConversation() {
      throw new Error('model crashed');
    },
  }));
  const crashed = await crashing.run('Crash safely');
  assert.equal(crashed.success, false);
  assert.equal(crashed.status, 'failed');
  assert.match(crashed.error, /model crashed/);

  const timingOut = new AgentTool(makeRepl({
    async runConversation() {
      await new Promise(resolve => setTimeout(resolve, 50));
      return { finalContent: 'late' };
    },
  }));
  const timedOut = await timingOut.run('Timeout safely', { timeoutMs: 1 });
  assert.equal(timedOut.success, false);
  assert.equal(timedOut.status, 'failed');
  assert.match(timedOut.error, /timed out/);
});

test('AgentTool runParallel delegates multiple subagents and aggregates results', async () => {
  const tool = new AgentTool(makeRepl());
  const result = await tool.runParallel([
    { goal: 'Inspect auth', role: 'review' },
    { goal: 'Inspect tests', role: 'general' },
  ], { concurrency: 2 });

  assert.equal(result.success, true);
  assert.equal(result.count, 2);
  assert.equal(result.results.length, 2);
  assert.match(result.summary, /completed/);
});

test('AgentTool can execute subagent through an isolated child process', async () => {
  const sent = [];
  const projectPath = await mkdtemp(path.join(tmpdir(), 'winter-agent-process-'));
  await writeFile(path.join(projectPath, 'README.md'), 'parent workspace', 'utf8');
  const repl = makeRepl({
    constructor: { name: 'WinterREPL' },
    projectPath,
    sessionId: 'session-1',
    version: 'test',
  });
  repl.subagentFork = () => {
    const child = new EventEmitter();
    child.pid = 4242;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {};
    child.send = message => {
      sent.push(message);
      queueMicrotask(() => child.emit('message', {
        type: 'result',
        result: {
          success: true,
          agentId: message.options.agentId,
          role: message.options.role,
          workspaceIsolated: message.options.workspaceIsolation,
          workspacePath: message.options.projectPath,
          summary: 'child done',
        },
      }));
    };
    return child;
  };

  const tool = new AgentTool(repl);
  const result = await tool.run('Run in child', { processIsolation: true, role: 'debug', keepWorkspace: true });

  try {
    assert.equal(result.success, true);
    assert.equal(result.processIsolated, true);
    assert.equal(result.workspaceIsolated, true);
    assert.equal(result.childPid, 4242);
    assert.equal(sent[0].type, 'run');
    assert.equal(sent[0].options.processIsolation, false);
    assert.notEqual(sent[0].options.projectPath, projectPath);
    assert.equal(sent[0].options.parentProjectPath, projectPath);
    assert.equal(await readFile(path.join(sent[0].options.projectPath, 'README.md'), 'utf8'), 'parent workspace');
  } finally {
    await rm(sent[0]?.options?.projectPath, { recursive: true, force: true });
  }
});

test('AgentTool can disable workspace isolation for direct parent workspace delegation', async () => {
  const sent = [];
  const projectPath = await mkdtemp(path.join(tmpdir(), 'winter-agent-no-workspace-'));
  const repl = makeRepl({
    constructor: { name: 'WinterREPL' },
    projectPath,
  });
  repl.subagentFork = () => {
    const child = new EventEmitter();
    child.pid = 4343;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {};
    child.send = message => {
      sent.push(message);
      queueMicrotask(() => child.emit('message', {
        type: 'result',
        result: { success: true, workspaceIsolated: message.options.workspaceIsolation },
      }));
    };
    return child;
  };

  const tool = new AgentTool(repl);
  const result = await tool.run('Run in parent workspace', {
    processIsolation: true,
    workspaceIsolation: false,
  });

  assert.equal(result.success, true);
  assert.equal(result.processIsolated, true);
  assert.equal(result.workspaceIsolated, false);
  assert.equal(sent[0].options.projectPath, projectPath);
});

test('AgentTool status returns error for unknown agent and missing id', async () => {
  const tool = new AgentTool(makeRepl());
  assert.equal((await tool.status()).success, false);
  assert.equal((await tool.status('nonexistent')).success, false);
});
