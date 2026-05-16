/**
 * ❄️ AGENT TOOL ❄️
 * Full subagent orchestration tool
 */

import path from 'path';

export class AgentTool {
  constructor(repl) {
    this.repl = repl;
    this.running = new Map();
  }

  async run(task, options = {}) {
    if (!task || typeof task !== 'string' || task.trim() === '') {
      return { success: false, error: 'task description is required' };
    }

    const agentId = options.id || `agent-${Date.now()}-${String(Math.random()).slice(2, 6)}`;
    const maxSteps = Math.min(Math.max(1, parseInt(options.maxSteps, 10) || 10), 25);
    const provider = options.provider || this.repl?.ai?.getActiveProvider?.() || 'ollama';
    const cwd = options.cwd || process.cwd();

    return {
      success: true,
      agentId,
      status: 'running',
      task: task.trim(),
      workflow: [
        { phase: 'understand', description: 'Analyze the task and gather initial context' },
        { phase: 'inspect', description: 'Read relevant files to understand the codebase' },
        { phase: 'decompose', description: 'Break task into subtasks for sequential execution' },
        { phase: 'implement', description: 'Execute each subtask implementation' },
        { phase: 'verify', description: 'Verify changes and fix any issues' },
        { phase: 'report', description: 'Provide final summary of what was done' },
      ],
      maxSteps,
      provider,
      cwd,
      note: 'Agent execution is coordinated by the AI model via tool calls. Use the SWE agent for automated multi-step execution.',
    };
  }

  async list() {
    return {
      success: true,
      agents: [...this.running.values()].map(a => ({
        id: a.id,
        task: a.task?.slice(0, 80) || '',
        status: a.status,
        startedAt: a.startedAt,
      })),
      count: this.running.size,
    };
  }

  async status(agentId) {
    if (!agentId) {
      return { success: false, error: 'agent_id is required' };
    }

    const agent = this.running.get(agentId);
    if (!agent) {
      return { success: false, error: `Agent not found: ${agentId}` };
    }

    return { success: true, agent };
  }
}
