/**
 * Dynamic System Prompt Builder
 * Builds context-aware system prompts based on task, role, and session state.
 * Winter always gives every model the strongest available agent instructions.
 */

import { formatRuntimeEnvironmentSummary, getRuntimeEnvironment } from '../../cli/runtime-env.js';
import { getModelBudgetMultiplier } from '../model-capabilities.js';

const BASE_PRINCIPLES = [
  'Execute, don\'t describe - Do the work, don\'t write plans about doing the work',
  'Agent Loop - Inspect real state, hypothesize, act with tools, verify, then answer',
  'Think Before Coding - State assumptions only when they affect the next action',
  'Simplicity First - Minimum code that solves the problem',
  'Surgical Changes - Touch only what you must',
  'Goal-Driven Execution - Define success criteria, verify results',
  'Debug Excellence - Reproduce/inspect the failing path, patch root cause, verify with the closest command',
  'Design Excellence - Inspect existing UI/resources, then build polished responsive interfaces',
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
  return [
    formatRuntimeEnvironmentSummary(getRuntimeEnvironment()),
    `Node: ${process.version}`,
  ].join('\n');
}

function getPromptBudgets(modelTier = '') {
  const scale = getModelBudgetMultiplier(modelTier);
  const compactSystemPrompt = scale <= 0.75;

  return {
    compactSystemPrompt,
    projectContextBudget: Math.round(3200 * scale),
    resourceContextBudget: Math.round(1200 * scale),
  };
}

function formatToolList(tools = []) {
  return tools.length > 0 ? tools.slice(0, 10).join(', ') : '';
}

function appendSharedContext(parts, { environment, session, design, resourceContext, context, includeResources = false, resourceContextBudget = 1200 } = {}) {
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
    parts.push(resourceContext.trim().slice(0, resourceContextBudget), '');
  }

  if (context && typeof context === 'object') {
    parts.push('Task: ' + (context.category || 'coding') + ' / ' + (context.type || 'simple'), '');
  }
}

function buildStandardSystemPrompt(options = {}) {
  const { role = 'coding', tools = [], resourceContext, modelTier = '' } = options;
  const budgets = getPromptBudgets(modelTier);
  const projectContextBudget = options.projectContextBudget ?? budgets.projectContextBudget;
  const compactSystemPrompt = options.compactSystemPrompt ?? budgets.compactSystemPrompt;
  const parts = [
    'You are Winter, an expert AI coding assistant.',
    '',
    '## Core Principles',
    ...BASE_PRINCIPLES.map((p, i) => (i + 1) + '. ' + p),
    '',
    '## Tool Usage',
    'Use tools when they materially improve correctness. Inspect before editing. Verify after changes.',
    'Use maximum reasoning discipline for every model tier, including tiny, local, free, and routed models.',
    'Never invent file paths, APIs, command output, or test results.',
    'For debug work, locate the first hard failure, patch the root cause, and verify with the closest test/build/browser smoke.',
    'For design/UI work, inspect the existing interface and design resources first; avoid generic placeholder layouts.',
    'If the user attaches or pastes an image, analyze it as primary evidence.',
    '',
  ];

  const toolList = formatToolList(tools);
  if (toolList) parts.push('## Tools', toolList, '');
  appendSharedContext(parts, {
    ...options,
    includeResources: Boolean(resourceContext) && (role === 'design' || role === 'ui'),
    resourceContextBudget: budgets.resourceContextBudget,
  });

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
  const budgets = getPromptBudgets(modelTier);
  const options = { role, context, tools, session, environment, design, resourceContext, modelTier };
  options.projectContextBudget = options.projectContextBudget ?? budgets.projectContextBudget;
  options.compactSystemPrompt = options.compactSystemPrompt ?? budgets.compactSystemPrompt;
  return buildStandardSystemPrompt(options);
}

export function buildFastSystemPrompt({
  role = 'coding',
  tools = [],
  modelTier,
} = {}) {
  return [
    'You are Winter (fast mode with maximum correctness). Be concise, but inspect and use tools when needed.',
    tools.length > 0 ? `Tools: ${tools.join(', ')}` : '',
    'Use a brief private plan, then execute or answer with concrete evidence.',
  ].filter(Boolean).join('\n');
}

export function buildAgentSystemPrompt(role, { tools = [], modelTier } = {}) {
  const roleConfigs = {
    plan: 'You analyze codebases and plan multi-step implementations. Output clear steps.',
    review: 'You review code for bugs, style issues, and improvements. Be critical but constructive.',
    debug: 'You are a debug specialist. Use systematic elimination to find root causes.',
    design: 'You are a design implementation specialist. Inspect the current UI, reuse the design system, and ship polished responsive interfaces.',
    research: 'You search codebases and documentation to answer questions comprehensively.',
    browser: 'You interact with web pages via browser automation. Report findings clearly.',
    coding: 'You solve coding tasks directly. Inspect files, edit surgically, and verify.',
  };

  const base = roleConfigs[role] || roleConfigs.coding;
  const strengthNote = '\n\nWinter Strength Mode: use the full agent loop, inspect real code, reason carefully, verify results, and avoid unsupported claims regardless of base model size.';

  return [
    `You are Winter (${role} agent).`,
    base,
    tools.length > 0 ? `\nTools: ${tools.join(', ')}` : '',
    strengthNote,
    '\nCRITICAL: Output only the requested format. No extra commentary.',
  ].filter(Boolean).join('\n');
}

export { TOOL_CATEGORIES, BASE_PRINCIPLES };
