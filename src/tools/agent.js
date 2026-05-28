import { AgentDefinitionRegistry } from '../agent/agent-definitions.js';
import { fork } from 'child_process';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const DEFAULT_TIMEOUT_MS = 120000;
const SUBAGENT_CHILD_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'agent', 'subagent-child.js');
const WORKSPACE_EXCLUDE_NAMES = new Set([
  '.git',
  '.winter',
  '.codegraph',
  '.claude',
  'node_modules',
  'dist',
  'coverage',
]);
const WORKSPACE_EXCLUDE_PATTERNS = [
  /\.tgz$/i,
  /\.zip$/i,
  /\.rar$/i,
  /\.log$/i,
];

function clampSteps(value) {
  return Math.min(Math.max(1, parseInt(value, 10) || 10), 25);
}

async function withTimeout(promise, ms, agentId) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Subagent ${agentId} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export class AgentTool {
  constructor(repl) {
    this.repl = repl;
    this.running = new Map();
    this.completed = new Map();
    this.forkProcess = repl?.subagentFork || fork;
  }

  async run(task, options = {}) {
    if (!task || typeof task !== 'string' || task.trim() === '') {
      return { success: false, error: 'task description is required' };
    }
    const wantsProcessIsolation = this.shouldUseProcessIsolation(options);
    if ((!wantsProcessIsolation && !this.repl?.runConversation) || !this.repl?.tools || !this.repl?.ai) {
      return {
        success: false,
        error: 'Agent execution requires a live REPL runtime.',
        recovery: 'Run Agent from inside Winter REPL so the subagent can call the model and tools.',
      };
    }

    const agentId = options.id || `agent-${Date.now()}-${String(Math.random()).slice(2, 6)}`;
    const timeoutMs = Math.max(1, parseInt(options.timeoutMs ?? options.timeout_ms, 10) || DEFAULT_TIMEOUT_MS);
    const maxSteps = clampSteps(options.maxSteps ?? options.max_steps);
    const role = String(options.role || options.agent || 'general');
    const startedAt = new Date().toISOString();
    const cwd = options.cwd || this.repl.projectPath || process.cwd();
    const previousProvider = this.repl.ai.getActiveProvider?.();

    const state = {
      id: agentId,
      task: task.trim(),
      role,
      status: 'running',
      startedAt,
      maxSteps,
      cwd,
    };
    this.running.set(agentId, state);

    try {
      const runOptions = { ...options, agentId, maxSteps, role, cwd, timeoutMs };
      const result = wantsProcessIsolation
        ? await this.executeSubagentInChildProcess(task.trim(), runOptions)
        : await withTimeout(this.executeSubagent(task.trim(), runOptions), timeoutMs, agentId);
      const completed = {
        ...state,
        ...result,
        status: result.success === false ? 'failed' : 'completed',
        completedAt: new Date().toISOString(),
      };
      this.running.delete(agentId);
      this.completed.set(agentId, completed);
      return completed;
    } catch (error) {
      const failed = {
        ...state,
        success: false,
        status: 'failed',
        error: error.message,
        completedAt: new Date().toISOString(),
      };
      this.running.delete(agentId);
      this.completed.set(agentId, failed);
      return failed;
    } finally {
      if (previousProvider && this.repl.ai.setProvider) {
        this.repl.ai.setProvider(previousProvider);
      }
    }
  }

  shouldUseProcessIsolation(options = {}) {
    if (options.processIsolation === false || options.process_isolation === false) return false;
    if (options.processIsolation === true || options.process_isolation === true) return true;
    if (process.env.NODE_ENV === 'test') return false;
    return this.repl?.constructor?.name === 'WinterREPL';
  }

  executeSubagentInChildProcess(task, options) {
    return new Promise((resolve, reject) => {
      let workspaceReady = Promise.resolve({ workspacePath: options.cwd, cleanup: async () => {}, isolated: false });
      const child = this.forkProcess(SUBAGENT_CHILD_PATH, [], {
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        env: { ...process.env, WINTER_SUBAGENT_CHILD: '1' },
      });
      const logs = [];
      let settled = false;
      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        child.kill();
        void workspaceReady
          .then(workspace => workspace.cleanup().catch(() => {}))
          .finally(() => fn(value));
      };
      const timer = setTimeout(() => {
        finish(reject, new Error(`Subagent ${options.agentId} timed out after ${options.timeoutMs}ms`));
      }, options.timeoutMs);

      child.stdout?.on('data', chunk => logs.push(String(chunk)));
      child.stderr?.on('data', chunk => logs.push(String(chunk)));
      child.on('message', message => {
        if (message?.type === 'result') {
          finish(resolve, {
            ...message.result,
            processIsolated: true,
            workspaceIsolated: message.result?.workspaceIsolated === true || message.result?.workspaceIsolation === true,
            childPid: child.pid,
            childLogs: logs.join('').slice(-4000),
          });
        } else if (message?.type === 'error') {
          finish(reject, new Error(message.error || 'Subagent child failed'));
        }
      });
      child.on('error', error => finish(reject, error));
      child.on('exit', code => {
        if (!settled && code !== 0) {
          finish(reject, new Error(`Subagent child exited with code ${code}: ${logs.join('').slice(-2000)}`));
        }
      });
      workspaceReady = this.prepareSubagentWorkspace(options);
      workspaceReady
        .then(workspace => {
          child.send({
            type: 'run',
            task,
            options: {
              ...options,
              processIsolation: false,
              workspaceIsolation: workspace.isolated,
              parentProjectPath: this.repl.projectPath,
              projectPath: workspace.workspacePath,
              cwd: workspace.workspacePath,
              sessionId: this.repl.sessionId,
              version: this.repl.version,
            },
          });
        })
        .catch(error => finish(reject, error));
    });
  }

  async prepareSubagentWorkspace(options = {}) {
    if (options.workspaceIsolation === false || options.workspace_isolation === false) {
      return {
        workspacePath: options.cwd || this.repl.projectPath || process.cwd(),
        isolated: false,
        cleanup: async () => {},
      };
    }

    const source = path.resolve(options.cwd || this.repl.projectPath || process.cwd());
    const workspacePath = await mkdtemp(path.join(tmpdir(), `winter-subagent-${options.agentId || 'agent'}-`));
    await this.copyWorkspaceForSubagent(source, workspacePath);
    return {
      workspacePath,
      isolated: true,
      cleanup: async () => {
        if (options.keepWorkspace === true || options.keep_workspace === true) return;
        await rm(workspacePath, { recursive: true, force: true });
      },
    };
  }

  async copyWorkspaceForSubagent(source, destination) {
    const fs = await import('fs/promises');
    await fs.cp(source, destination, {
      recursive: true,
      force: false,
      errorOnExist: false,
      filter: (src) => {
        const name = path.basename(src);
        if (WORKSPACE_EXCLUDE_NAMES.has(name)) return false;
        if (WORKSPACE_EXCLUDE_PATTERNS.some(pattern => pattern.test(name))) return false;
        return true;
      },
    });
  }

  async executeSubagent(task, options) {
    const definition = await this.getAgentDefinition(options.role);
    const requestedTools = Array.isArray(options.tools) ? options.tools.map(String) : null;
    const agentDefinition = requestedTools?.length
      ? { ...definition, tools: definition.tools.filter(tool => requestedTools.includes(tool)) }
      : definition;
    const agentTools = this.repl.getAgentToolsForDefinition
      ? this.repl.getAgentToolsForDefinition(agentDefinition)
      : this.repl.tools.getToolDefinitions().filter(tool => agentDefinition.tools.includes(tool.name));

    if (agentTools.length === 0) {
      return {
        success: false,
        error: `No tools are allowed for agent role "${agentDefinition.id}".`,
      };
    }

    if (options.provider && this.repl.ai.setProvider) {
      const switched = this.repl.ai.setProvider(options.provider);
      if (!switched) {
        return {
          success: false,
          error: `Provider is not available for subagent: ${options.provider}`,
        };
      }
    }

    const context = await this.repl.getProjectContext?.(task);
    const systemPrompt = this.repl.getAgentDefinitionSystemPrompt
      ? this.repl.getAgentDefinitionSystemPrompt(agentDefinition, context || '')
      : this.buildFallbackSystemPrompt(agentDefinition, context || '');
    const messages = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          `Subagent task: ${task}`,
          options.context ? `Parent context:\n${options.context}` : '',
          `Constraints: maxSteps=${options.maxSteps}; cwd=${options.cwd}`,
          'Run independently. Use only your allowed tools. Return summary, changed files, verification, and blockers.',
        ].filter(Boolean).join('\n\n'),
      },
    ];

    const runtimeResult = await this.repl.runConversation(messages, `Subagent [${agentDefinition.id}]`, agentTools);
    return {
      success: true,
      agentId: options.agentId,
      role: agentDefinition.id,
      provider: this.repl.ai.getActiveProvider?.() || options.provider || 'unknown',
      allowedTools: agentTools.map(tool => tool.name),
      finalContent: runtimeResult.finalContent || '',
      summary: this.summarize(runtimeResult.finalContent),
      changedFiles: runtimeResult.changedFiles || [],
      usedTools: runtimeResult.usedTools === true,
      usedMutatingTools: runtimeResult.usedMutatingTools === true,
      autoVerified: runtimeResult.autoVerified === true,
      autoVerificationPassed: runtimeResult.autoVerificationPassed === true,
      toolSummaries: runtimeResult.toolSummaries || [],
      executedTools: runtimeResult.executedTools || [],
      usage: runtimeResult.usage || {},
    };
  }

  async runParallel(tasks = [], options = {}) {
    const normalized = Array.isArray(tasks) ? tasks : [];
    if (normalized.length === 0) {
      return { success: false, error: 'tasks array is required' };
    }
    const limit = Math.min(Math.max(1, parseInt(options.concurrency, 10) || normalized.length), 6);
    const results = [];
    let index = 0;
    const workers = Array.from({ length: Math.min(limit, normalized.length) }, async () => {
      while (index < normalized.length) {
        const current = normalized[index++];
        const task = typeof current === 'string' ? current : current.goal || current.task;
        results.push(await this.run(task, { ...options, ...(typeof current === 'object' ? current : {}) }));
      }
    });
    await Promise.all(workers);
    return {
      success: results.every(result => result.success !== false),
      status: 'completed',
      count: results.length,
      results,
      summary: results.map(result => `${result.agentId}: ${result.status} - ${result.summary || result.error || ''}`).join('\n'),
    };
  }

  async getAgentDefinition(role) {
    if (this.repl?.agentRegistry?.get) return this.repl.agentRegistry.get(role);
    const registry = new AgentDefinitionRegistry({ projectPath: this.repl?.projectPath || process.cwd() });
    return registry.get(role);
  }

  buildFallbackSystemPrompt(agentDefinition, context) {
    return [
      `You are Winter subagent "${agentDefinition.id}".`,
      agentDefinition.instructionsPrompt || '',
      `Allowed tools: ${(agentDefinition.tools || []).join(', ')}`,
      context ? `Project context:\n${context}` : '',
    ].filter(Boolean).join('\n\n');
  }

  summarize(text = '') {
    const value = String(text || '').trim().replace(/\s+/g, ' ');
    return value.length > 500 ? `${value.slice(0, 497)}...` : value;
  }

  async list() {
    const agents = [...this.running.values(), ...this.completed.values()];
    return {
      success: true,
      agents: agents.map(a => ({
        id: a.id,
        task: a.task?.slice(0, 80) || '',
        status: a.status,
        role: a.role,
        startedAt: a.startedAt,
        completedAt: a.completedAt,
      })),
      count: agents.length,
    };
  }

  async status(agentId) {
    if (!agentId) {
      return { success: false, error: 'agent_id is required' };
    }

    const agent = this.running.get(agentId) || this.completed.get(agentId);
    if (!agent) {
      return { success: false, error: `Agent not found: ${agentId}` };
    }

    return { success: true, agent };
  }
}
