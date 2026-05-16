/**
 * Dynamic System Prompt Builder
 * Builds context-aware system prompts based on task, role, and session state.
 * Small models get aggressive structural guidance to compensate for limited capability.
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

/**
 * Build a "boosted" system prompt for small/tiny models.
 * Small models need: more explicit structure, strict formats, explicit step-by-step forcing.
 */
function buildSmallModelSystemPrompt({
  role = 'coding',
  context,
  tools = [],
  session,
  environment,
  design,
  resourceContext,
  modelTier,
} = {}) {
  const parts = [
    `You are Winter, an expert AI coding assistant. You are running on a ${getModelCapabilityLabel(modelTier)}.`,
    '',
    '## CRITICAL: YOU MUST THINK STEP BY STEP',
    '',
    'Because you are a smaller model, you MUST use structured thinking to produce quality results.',
    'Before any response, use <thinking> tags to reason through the problem.',
    '',
    'Your thinking must cover:',
    '1. What does the user want? (restate briefly)',
    '2. What files/tools do I need to use?',
    '3. What is the best approach?',
    '4. What could go wrong? Edge cases?',
    '5. Is my solution complete and correct?',
    '',
    'After thinking, THEN act. Never skip the thinking step.',
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

  if (design) {
    parts.push('## Design Guidelines');
    if (design.brand) {
      parts.push(`Brand: ${design.brand}`);
      parts.push('');
      const lines = design.content.split('\n').filter(Boolean);
      const preview = lines.slice(0, 40).join('\n');
      parts.push(preview);
      if (lines.length > 40) parts.push('... (design file truncated)');
    } else if (design.type === 'design_hint') {
      parts.push('Design-related task detected. Consider applying one of the available design systems.');
      parts.push(`Available: ${design.brands.join(', ')}`);
    }
    parts.push('');
  }

  if (resourceContext) {
    parts.push(resourceContext);
  }

  parts.push(
    '## Execution Rules (STRICT)',
    '- EXECUTE FIRST. Read files, then edit. Do NOT describe what you will do — just do it.',
    '- Keep explanations under 2 sentences. Say what you changed, not what you could do.',
    '- After using tools, give only a one-line summary of what was done.',
    '- Answer questions directly — no disclaimers or warnings.',
    '- If a request is unsafe, refuse briefly and stop.',
    '',
    '## Thinking Format (MANDATORY)',
    '<thinking>',
    'Step-by-step reasoning here...',
    '</thinking>',
    '[Your action/answer here]',
  );

  return parts.join('\n');
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
  // ALL models get the deep-thinking system prompt for maximum code quality
  return buildSmallModelSystemPrompt({
    role,
    context,
    tools,
    session,
    environment,
    design,
    resourceContext,
    modelTier,
  });
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
      'THINK inside <thinking> before acting. Keep responses to 1 sentence.',
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
  };

  const base = roleConfigs[role] || roleConfigs.coding;
  const smallNote = modelTier && isSmallModel(modelTier)
    ? '\n\nYou are running on a small model. Use <thinking> tags and reason step by step before each action.'
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
