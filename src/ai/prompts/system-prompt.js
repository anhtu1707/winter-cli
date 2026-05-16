/**
 * Dynamic System Prompt Builder
 * Builds context-aware system prompts based on task, role, and session state.
 * Small models get compact structural guidance so the task stays in focus.
 */

import { isSmallModel, getModelCapabilityLabel } from '../model-capabilities.js';

const BASE_PRINCIPLES = [
  'Execute, don\'t describe - Do the work, don\'t write plans about doing the work',
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

function formatToolList(tools = []) {
  return tools.length > 0 ? tools.slice(0, 10).join(', ') : '';
}

function appendSharedContext(parts, { environment, session, design, resourceContext, context, includeResources = false } = {}) {
  parts.push('## Runtime Environment', environment || buildEnvironmentSummary(), '');

  if (session?.memory?.length) {
    parts.push('## Session Memory');
    session.memory.slice(-5).forEach(m => parts.push('- ' + String(m).slice(0, 100)));
    parts.push('');
  }

  if (session?.plans?.length) {
    parts.push('## Active Plans');
    session.plans.slice(-3).forEach(p => parts.push('- ' + (p.title || String(p).slice(0, 80))));
    parts.push('');
  }

  if (design) {
    parts.push('## Design Context');
    if (design.brand) {
      parts.push('Brand: ' + design.brand);
      parts.push(design.content.split('\n').filter(Boolean).slice(0, 18).join('\n'));
    } else if (design.type === 'design_hint') {
      parts.push('Available design systems: ' + design.brands.slice(0, 5).join(', '));
    }
    parts.push('');
  }

  if (includeResources && resourceContext) {
    parts.push(resourceContext.trim().slice(0, 1200), '');
  }

  if (context && typeof context === 'object') {
    parts.push('Task: ' + (context.category || 'coding') + ' / ' + (context.type || 'simple'), '');
  }
}

function buildCompactSmallModelPrompt(options = {}) {
  const { tools = [], modelTier } = options;
  const parts = [
    'You are Winter, an AI coding assistant running on a ' + getModelCapabilityLabel(modelTier) + '.',
    '',
    '## Operating Rules',
    '1. Understand the user request first. If project state matters, inspect files before answering.',
    '2. Keep context tight. Use only relevant tools and avoid long explanations.',
    '3. For coding: Read/Grep/Glob -> Edit/Write -> Bash/test. Do not guess file paths.',
    '4. Final answer in Vietnamese. Mention changed files and verification only.',
    '',
  ];

  const toolList = formatToolList(tools);
  if (toolList) parts.push('## Tools', toolList, '');
  appendSharedContext(parts, { ...options, includeResources: false });

  parts.push(
    '## Response Shape',
    '- If action is needed, use tools instead of describing the action.',
    '- Keep final output short and concrete.',
  );

  return parts.filter(Boolean).join('\n');
}

function buildStandardSystemPrompt(options = {}) {
  const { role = 'coding', tools = [], resourceContext } = options;
  const parts = [
    'You are Winter, an expert AI coding assistant.',
    '',
    '## Core Principles',
    ...BASE_PRINCIPLES.map((p, i) => (i + 1) + '. ' + p),
    '',
    '## Tool Usage',
    'Use tools when they materially improve correctness. Inspect before editing. Verify after changes.',
    'Never invent file paths, APIs, command output, or test results.',
    '',
  ];

  const toolList = formatToolList(tools);
  if (toolList) parts.push('## Tools', toolList, '');
  appendSharedContext(parts, { ...options, includeResources: Boolean(resourceContext) && (role === 'design' || role === 'ui') });

  parts.push('Always respond in Vietnamese.');
  return parts.filter(Boolean).join('\n');
}

export function buildSystemPrompt({
  role = 'coding',
  context,
  tools = [],
  session,
  environment,
  design,
  resourceContext,
  modelTier,
} = {}) {
  const options = { role, context, tools, session, environment, design, resourceContext, modelTier };
  return isSmallModel(modelTier)
    ? buildCompactSmallModelPrompt(options)
    : buildStandardSystemPrompt(options);
}

export function buildFastSystemPrompt({
  role = 'coding',
  tools = [],
  modelTier,
} = {}) {
  if (modelTier && isSmallModel(modelTier)) {
    return [
      'Winter (fast mode - small model). Be concise. Use tools when needed.',
      tools.length > 0 ? `Tools: ${tools.join(', ')}` : '',
      'Use a brief private plan, then answer in 1 sentence.',
    ].filter(Boolean).join('\n');
  }

  return [
    'You are Winter (fast mode). Be concise. Use tools when needed.',
    tools.length > 0 ? `Tools: ${tools.join(', ')}` : '',
    'Keep responses brief and focused on the immediate task.',
  ].filter(Boolean).join('\n');
}

export function buildAgentSystemPrompt(role, { tools = [], modelTier } = {}) {
  const roleConfigs = {
    plan: 'You analyze codebases and plan multi-step implementations. Output clear steps.',
    review: 'You review code for bugs, style issues, and improvements. Be critical but constructive.',
    debug: 'You are a debug specialist. Use systematic elimination to find root causes.',
    research: 'You search codebases and documentation to answer questions comprehensively.',
    browser: 'You interact with web pages via browser automation. Report findings clearly.',
    coding: 'You solve coding tasks directly. Inspect files, edit surgically, and verify.',
  };

  const base = roleConfigs[role] || roleConfigs.coding;
  const smallNote = modelTier && isSmallModel(modelTier)
    ? '\n\nYou are running on a small model. Keep context tight, use tools early, and keep final output short.'
    : '';

  return [
    `You are Winter (${role} agent).`,
    base,
    tools.length > 0 ? `\nTools: ${tools.join(', ')}` : '',
    smallNote,
    '\nCRITICAL: Output only the requested format. No extra commentary.',
  ].filter(Boolean).join('\n');
}

export { TOOL_CATEGORIES, BASE_PRINCIPLES };
