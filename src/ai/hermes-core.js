export const HERMES_CORE_RESOURCE = 'hermes-agent-core';

export const HERMES_CORE_PATTERNS = [
  {
    key: 'self_improving_loop',
    label: 'Closed learning loop',
    rule: 'After non-trivial work, capture reusable procedures, failure modes, and verification evidence so future turns start smarter.',
  },
  {
    key: 'skill_lifecycle',
    label: 'Skill lifecycle',
    rule: 'Promote repeated workflows into skills, improve skills when they fail, and keep skill instructions operational rather than decorative.',
  },
  {
    key: 'session_search',
    label: 'Session search and compression',
    rule: 'Search or summarize prior context before broad guessing; compress long trajectories into high-signal facts and decisions.',
  },
  {
    key: 'delegation',
    label: 'Subagent delegation',
    rule: 'Split independent workstreams into bounded subagents or parallel tool calls, then merge evidence before finalizing.',
  },
  {
    key: 'automation_triggers',
    label: 'Automation triggers',
    rule: 'For recurring checks, scheduled work, webhook-like events, or background audits, design a trigger, context injection, verification, and delivery path.',
  },
  {
    key: 'tui_gateway',
    label: 'TUI gateway separation',
    rule: 'Keep UI rendering, command registry, model loop, tools, and session state as separable surfaces with explicit events and status.',
  },
  {
    key: 'tool_gateway',
    label: 'Tool gateway discipline',
    rule: 'Treat MCP/tools as a gateway with allowlists, diagnostics, retries, timeouts, and concrete tool-result evidence.',
  },
];

export function detectHermesCoreSignals({ taskText = '', projectSignals = [] } = {}) {
  const text = `${String(taskText || '')}\n${(projectSignals || []).join('\n')}`.toLowerCase();
  const has = (...keywords) => keywords.some(keyword => text.includes(keyword));

  return {
    agent: has('agent', 'subagent', 'multi-agent', 'multi agent', 'ai assistant', 'coding assistant'),
    skills: has('skill', 'skills', 'procedural memory', 'self-improv', 'self improv', 'learning loop'),
    memory: has('memory', 'memories', 'session search', 'conversation history', 'compress context', 'trajectory'),
    automation: has('cron', 'schedule', 'scheduled', 'webhook', 'routine', 'automation', 'background job'),
    gateway: has('gateway', 'telegram', 'discord', 'slack', 'whatsapp', 'signal', 'messaging'),
    tui: has('tui', 'terminal ui', 'ink', 'composer', 'slash command', 'autocomplete'),
    mcp: has('mcp', 'tool gateway', 'toolset', 'tool registry', 'tool calling'),
  };
}

export function shouldApplyHermesCore(input = {}) {
  const signals = detectHermesCoreSignals(input);
  return Object.values(signals).some(Boolean);
}

export function buildHermesCoreContract({ compact = false } = {}) {
  const selected = compact
    ? HERMES_CORE_PATTERNS.filter(pattern => ['self_improving_loop', 'skill_lifecycle', 'delegation', 'tool_gateway'].includes(pattern.key))
    : HERMES_CORE_PATTERNS;

  const lines = [
    '## Hermes Core Agent Contract',
    '- Apply Hermes-inspired core behavior directly inside Winter: self-improving skills, searchable memory, delegated workstreams, scheduled automation thinking, and tool-gateway discipline.',
    ...selected.map(pattern => `- ${pattern.label}: ${pattern.rule}`),
  ];

  if (!compact) {
    lines.push('- UI/TUI work: expose model state, tool progress, interrupts, command discovery, and evidence without fake progress text.');
  }

  return lines.join('\n');
}
