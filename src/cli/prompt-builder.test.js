import test from 'node:test';
import assert from 'node:assert/strict';
import { PromptBuilder } from './prompt-builder.js';

function createMockSession(memory = [], plans = [], context = {}) {
  return {
    getMemory: () => memory,
    getPlans: () => plans,
    getContext: () => context,
    getSessionId: () => 'test-session-id',
  };
}

test('PromptBuilder buildSessionSignalsPrompt returns formatted signals', () => {
  const builder = new PromptBuilder({
    session: createMockSession(),
    projectPath: '/test/project',
    sessionPermissionGrants: new Set(['Read', 'Write']),
  });
  const result = builder.buildSessionSignalsPrompt();

  assert(result.includes('Session Signals'));
  assert(result.includes('/test/project'));
  assert(result.includes('Read'));
  assert(result.includes('Write'));
});

test('PromptBuilder buildSessionSignalsPrompt handles empty grants', () => {
  const builder = new PromptBuilder({
    session: createMockSession(),
    projectPath: '/test',
    sessionPermissionGrants: new Set(),
  });
  const result = builder.buildSessionSignalsPrompt();

  assert(result.includes('none'));
});

test('PromptBuilder buildSystemPrompt includes core principles', () => {
  const builder = new PromptBuilder({
    session: createMockSession(),
    projectPath: '/test',
    compactText: (t) => t,
    summarizePrompts: () => '',
  });
  const result = builder.buildSystemPrompt();

  assert(result.includes('Winter'));
  assert(result.includes('Think Before Coding'));
  assert(result.includes('Simplicity First'));
  assert(result.includes('Surgical Changes'));
  assert(result.includes('Goal-Driven'));
  assert(result.includes('Agentic Execution'));
  assert(result.includes('Debug Excellence'));
  assert(result.includes('Design Excellence'));
  assert(result.includes('Image Inputs'));
  assert(result.includes('Vietnamese'));
  assert(result.includes('Do not claim completion without a tool result'));
});

test('PromptBuilder buildSystemPrompt includes project context when provided', () => {
  const builder = new PromptBuilder({
    session: createMockSession(),
    projectPath: '/test',
    compactText: (t) => t,
    summarizePrompts: () => '',
  });
  const result = builder.buildSystemPrompt('Some project specific context');

  assert(result.includes('Project Context'));
  assert(result.includes('Some project specific context'));
  assert(result.includes('Tool call compatibility'));
  assert(result.includes('CALL_TOOL Read'));
});

test('PromptBuilder buildFastSystemPrompt returns short Vietnamese prompt', () => {
  const builder = new PromptBuilder({
    session: createMockSession(),
    projectPath: '/test',
    summarizePrompts: () => '',
  });
  const result = builder.buildFastSystemPrompt();

  assert(result.includes('Winter'));
  assert(result.includes('tiếng Việt'));
  assert(result.includes('tool'));
  assert(result.includes('ảnh'));
});

test('PromptBuilder buildFastSystemPrompt includes memories when available', () => {
  const builder = new PromptBuilder({
    session: createMockSession([{ text: 'Remember to use React hooks' }]),
    projectPath: '/test',
    summarizePrompts: (items) => items.map(i => i.text).join(', '),
  });
  const result = builder.buildFastSystemPrompt();

  assert(result.includes('React hooks'));
});

test('PromptBuilder buildAgentSystemPrompt returns role-specific prompts', () => {
  const builder = new PromptBuilder({
    session: createMockSession(),
    projectPath: '/test',
    compactText: (t) => t,
    summarizePrompts: () => '',
  });
  const plan = builder.buildAgentSystemPrompt('plan');
  const review = builder.buildAgentSystemPrompt('review');
  const debug = builder.buildAgentSystemPrompt('debug');
  const browser = builder.buildAgentSystemPrompt('browser');

  assert(plan.includes('planning subagent'));
  assert(review.includes('review subagent'));
  assert(debug.includes('debugging subagent'));
  assert(browser.includes('BrowserDebug'));
});

test('PromptBuilder buildAgentSystemPrompt includes CRITICAL AI RULES', () => {
  const builder = new PromptBuilder({
    session: createMockSession(),
    projectPath: '/test',
    compactText: (t) => t,
    summarizePrompts: () => '',
  });
  const result = builder.buildAgentSystemPrompt('coding');

  assert(result.includes('CRITICAL AI RULES'));
  assert(result.includes('NO HALLUCINATION'));
  assert(result.includes('TOOL EXECUTION FIRST'));
  assert(result.includes('CODE QUALITY'));
  assert(result.includes('AGENT LOOP'));
  assert(result.includes('IMAGE INPUTS'));
});

test('PromptBuilder buildAgentSystemPrompt includes project context', () => {
  const builder = new PromptBuilder({
    session: createMockSession(),
    projectPath: '/test',
    compactText: (t) => t,
    summarizePrompts: () => '',
  });
  const result = builder.buildAgentSystemPrompt('coding', 'Custom context');
  assert(result.includes('Custom context'));
});

test('PromptBuilder buildAgentSystemPrompt handles unknown role with default', () => {
  const builder = new PromptBuilder({
    session: createMockSession(),
    projectPath: '/test',
    compactText: (t) => t,
    summarizePrompts: () => '',
  });
  const result = builder.buildAgentSystemPrompt('unknown-role');
  assert(result.includes('coding subagent'));
});

test('PromptBuilder buildSystemPrompt includes memories and plans', () => {
  const builder = new PromptBuilder({
    session: createMockSession(
      [{ text: 'Important memory' }],
      [{ status: 'active', title: 'Fix bug', description: 'Fix the login bug' }]
    ),
    projectPath: '/test',
    compactText: (t) => t,
    summarizePrompts: (items) => items.map(i => i.text || `${i.title}: ${i.description}`).join(', '),
  });
  const result = builder.buildSystemPrompt();

  assert(result.includes('Important memory'));
  assert(result.includes('Fix bug'));
});

test('PromptBuilder includes required local resource rules in all prompt modes', () => {
  const session = createMockSession([], [], {
    requiredLocalResources: '[Required Local Resource Rules]\n- karpathy-tools\n- awesome-design-md\n- agents.md',
  });
  const builder = new PromptBuilder({
    session,
    projectPath: '/test',
    compactText: (t) => t,
    summarizePrompts: () => '',
  });

  const system = builder.buildSystemPrompt();
  const fast = builder.buildFastSystemPrompt();
  const agent = builder.buildAgentSystemPrompt('coding');

  assert(system.includes('Required Local Resource Rules'));
  assert(system.includes('override generic behavior'));
  assert(system.includes('karpathy-tools'));
  assert(fast.includes('Required Local Resource Rules'));
  assert(agent.includes('REQUIRED LOCAL RESOURCES'));
  assert(agent.includes('awesome-design-md'));
});

test('PromptBuilder system prompt stays compact for small model context', () => {
  const builder = new PromptBuilder({
    session: createMockSession(),
    projectPath: '/test',
    compactText: (text, maxChars) => String(text).slice(0, maxChars),
    summarizePrompts: () => '',
  });
  const result = builder.buildSystemPrompt('x'.repeat(20000), { projectContextBudget: 1200 });

  assert(result.length < 3500);
  assert(!result.includes('CRITICAL AI RULES'));
});
