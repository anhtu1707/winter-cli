import test from 'node:test';
import assert from 'node:assert/strict';

import { SweAgent } from './swe-agent.js';

test('SweAgent decomposes coding tasks into inspect, implement, verify, and review steps', () => {
  const agent = new SweAgent();
  const plan = agent.buildPlan('fix provider routing test');

  assert(plan.some(step => step.phase === 'inspect'));
  assert(plan.some(step => step.phase === 'implement'));
  assert(plan.some(step => step.phase === 'verify'));
  assert(plan.some(step => step.phase === 'review'), 'should include a self-review phase');
  assert(plan.every(step => typeof step.instruction === 'string' && step.instruction.length > 0));
  assert.equal(plan.length, 7, 'should have 7 phases including review');
});

test('SweAgent builds a CoT prompt with thinking tags for weaker models', () => {
  const agent = new SweAgent();
  const prompt = agent.buildPrompt('fix failing repl test');

  assert.match(prompt, /<thinking>/);
  assert.match(prompt, /decompose/i);
  assert.match(prompt, /Self-review|self-review/i);
  assert.match(prompt, /Chain-of-Thought/);
  assert.match(prompt, /<analysis>/);
  assert.match(prompt, /<verification>/);
});

test('SweAgent buildSelfVerificationPrompt forces code review after implementation', () => {
  const agent = new SweAgent();
  const prompt = agent.buildSelfVerificationPrompt('fix login bug', ['src/auth.js', 'src/login.js']);

  assert.match(prompt, /Self-Verification/);
  assert.match(prompt, /<thinking>/);
  assert.match(prompt, /edge cases/);
  assert.match(prompt, /CONFIRM|REVISE/);
  assert.match(prompt, /src\/auth\.js/);
  assert.match(prompt, /src\/login\.js/);
});

test('SweAgent buildSelfVerificationPrompt handles empty changed files', () => {
  const agent = new SweAgent();
  const prompt = agent.buildSelfVerificationPrompt('simple task');

  assert.match(prompt, /simple task/);
  assert.match(prompt, /Self-Verification/);
  assert.match(prompt, /CONFIRM|REVISE/);
});

test('SweAgent extractStructuredOutput parses XML tags from model output', () => {
  const agent = new SweAgent();
  const output = [
    '<thinking>',
    'The current code uses an if-else chain. I should refactor this to use a switch statement.',
    '</thinking>',
    '',
    '<analysis>',
    'The authenticate() function has too many conditions.',
    '</analysis>',
  ].join('\n');

  const thinking = agent.extractStructuredOutput(output, 'thinking');
  const analysis = agent.extractStructuredOutput(output, 'analysis');
  const missing = agent.extractStructuredOutput(output, 'changes');

  assert(thinking.includes('refactor this'));
  assert(analysis.includes('authenticate'));
  assert.equal(missing, null);
});

test('SweAgent extractStructuredOutput handles null or empty input gracefully', () => {
  const agent = new SweAgent();

  assert.equal(agent.extractStructuredOutput(null, 'thinking'), null);
  assert.equal(agent.extractStructuredOutput('', 'thinking'), null);
  assert.equal(agent.extractStructuredOutput('no xml tags here', 'thinking'), null);
});

test('SweAgent buildPrompt includes review phase in plan', () => {
  const agent = new SweAgent();
  const prompt = agent.buildPrompt('add error handling');

  assert.match(prompt, /review/i);
  assert.match(prompt, /Self-review|self-review/i);
  assert.match(prompt, /edge cases/i);
});

test('SweAgent run without repl returns error', async () => {
  const agent = new SweAgent();
  const result = await agent.run('test task');

  assert.equal(result.success, false);
  assert.match(result.error, /REPL/);
});

test('SweAgent run with repl calls createPlan and runAgent', async () => {
  let createPlanCalled = false;
  let runAgentCalled = false;
  const mockRepl = {
    session: {
      createPlan: async (name, text) => {
        createPlanCalled = true;
        assert(name.includes('SWE'));
        assert(text.includes('understand'));
      },
    },
    runAgent: async (mode, prompt) => {
      runAgentCalled = true;
      assert.equal(mode, 'debug');
      assert(prompt.includes('Chain-of-Thought'));
    },
  };

  const agent = new SweAgent({ repl: mockRepl });
  const result = await agent.run('test task');

  assert(createPlanCalled);
  assert(runAgentCalled);
  assert(result.success);
  assert(result.plan);
  assert(result.prompt);
});
