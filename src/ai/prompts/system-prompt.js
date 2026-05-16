/**
 * Dynamic System Prompt Builder
 * Builds context-aware system prompts based on task, role, and session state.
 */

const BASE_PRINCIPLES = [
  'Think Before Coding - State assumptions, ask when unclear',
  'Simplicity First - Minimum code that solves the problem',
  'Surgical Changes - Touch only what you must',
  'Goal-Driven Execution - Define success criteria, verify results',
];

const TOOL_CATEGORIES = {
  file: ['Read', 'Write', 'Edit', 'InsertText', 'StrReplaceAll'],
  shell: ['Bash', 'Glob', 'Grep'],
  task: ['TaskCreate', 'TaskUpdate', 'TaskList'],
  web: ['WebFetch', 'WebSearch', 'WebArchive'],
  context: ['LSP', 'MCP', 'Parallel', 'Agent'],
  plan: ['TodoWrite', 'TodoList', 'ScheduleWakeup'],
  notebook: ['NotebookRead', 'NotebookEdit'],
};

function buildEnvironmentSummary() {
  const os = process.platform === 'win32' ? 'Windows'
    : process.platform === 'darwin' ? 'macOS'
    : process.platform === 'linux' ? 'Linux' : process.platform;

  const shellHint = process.platform === 'win32'
    ? 'Use shell:"powershell" for PowerShell, shell:"cmd" for cmd.exe'
    : `Shell: ${process.env.SHELL || 'bash'}`;

  return [
    `Host OS: ${os}`,
    `Node: ${process.version}`,
    shellHint,
  ].join('\n');
}

export function buildSystemPrompt({
  role = 'coding',
  context,
  tools = [],
  session,
  environment,
} = {}) {
  const parts = [
    `You are Winter, an expert AI coding assistant.`,
    '',
    '## Core Principles',
    ...BASE_PRINCIPLES.map((p, i) => `${i + 1}. ${p}`),
    '',
    '## Runtime Environment',
    environment || buildEnvironmentSummary(),
    '',
  ];

  if (tools.length > 0) {
    parts.push('## Available Tools', tools.join(', '), '');
  }

  if (session?.memory?.length) {
    parts.push('## Session Memory');
    session.memory.forEach(m => parts.push(`  - ${m.substring(0, 120)}`));
    parts.push('');
  }

  if (session?.plans?.length) {
    parts.push('## Active Plans');
    session.plans.forEach(p => parts.push(`  - ${p.title || p.substring(0, 80)}`));
    parts.push('');
  }

  parts.push(
    '## Guidelines',
    '- After using tools, always provide a direct final answer to the user.',
    '- Answer normal questions directly without unnecessary legal or policy disclaimers.',
    '- If a request is illegal, unsafe, or harmful, refuse briefly and offer a safe alternative.',
    '- Be proactive: anticipate what the user needs next.',
  );

  return parts.join('\n');
}

export function buildFastSystemPrompt({
  role = 'coding',
  tools = [],
} = {}) {
  return [
    'You are Winter (fast mode). Be concise. Use tools when needed.',
    tools.length > 0 ? `Tools: ${tools.join(', ')}` : '',
    'Keep responses brief and focused on the immediate task.',
  ].filter(Boolean).join('\n');
}

export function buildAgentSystemPrompt(role, { tools = [] } = {}) {
  const roleConfigs = {
    plan: 'You analyze codebases and plan multi-step implementations. Output clear steps.',
    review: 'You review code for bugs, style issues, and improvements. Be critical but constructive.',
    debug: 'You are a debug specialist. Use systematic elimination to find root causes.',
    research: 'You search codebases and documentation to answer questions comprehensively.',
    browser: 'You interact with web pages via browser automation. Report findings clearly.',
  };

  const base = roleConfigs[role] || roleConfigs.coding;
  return [
    `You are Winter (${role} agent).`,
    base,
    tools.length > 0 ? `\nTools: ${tools.join(', ')}` : '',
    '\nCRITICAL: Output only the requested format. No extra commentary.',
  ].filter(Boolean).join('\n');
}

export { TOOL_CATEGORIES, BASE_PRINCIPLES };
