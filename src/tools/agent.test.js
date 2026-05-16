/**
 * ❄️ AGENT TOOL TESTS ❄️
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AgentTool } from './agent.js';

test('AgentTool run creates agent with correct structure', async () => {
  const tool = new AgentTool(null);
  const result = await tool.run('Refactor the authentication module');

  assert.equal(result.success, true);
  assert.ok(result.agentId);
  assert.equal(result.task, 'Refactor the authentication module');
  assert.equal(result.status, 'running');
  assert.equal(result.maxSteps, 10);
  assert.equal(result.workflow.length, 6);
  assert.equal(result.workflow[0].phase, 'understand');
  assert.equal(result.workflow[3].phase, 'implement');
  assert.equal(result.workflow[4].phase, 'verify');
});

test('AgentTool run rejects empty task', async () => {
  const tool = new AgentTool(null);
  const result = await tool.run('');
  assert.equal(result.success, false);
  assert.ok(result.error);
});

test('AgentTool run rejects whitespace-only task', async () => {
  const tool = new AgentTool(null);
  const result = await tool.run('   ');
  assert.equal(result.success, false);
  assert.ok(result.error);
});

test('AgentTool run respects maxSteps option', async () => {
  const tool = new AgentTool(null);
  const result = await tool.run('Do something', { maxSteps: 5 });
  assert.equal(result.maxSteps, 5);
});

test('AgentTool run caps maxSteps at 25', async () => {
  const tool = new AgentTool(null);
  const result = await tool.run('Do something', { maxSteps: 100 });
  assert.equal(result.maxSteps, 25);
});

test('AgentTool run enforces minimum maxSteps of 1', async () => {
  const tool = new AgentTool(null);
  const result = await tool.run('Do something', { maxSteps: -5 });
  assert.equal(result.maxSteps, 1);
});

test('AgentTool run includes default provider when repl not available', async () => {
  const tool = new AgentTool(null);
  const result = await tool.run('Do something');
  assert.equal(result.provider, 'ollama');
});

test('AgentTool list returns empty when no agents running', async () => {
  const tool = new AgentTool(null);
  const result = await tool.list();
  assert.equal(result.success, true);
  assert.equal(result.count, 0);
});

test('AgentTool status returns error for unknown agent', async () => {
  const tool = new AgentTool(null);
  const result = await tool.status('nonexistent');
  assert.equal(result.success, false);
  assert.ok(result.error);
});

test('AgentTool status requires agentId', async () => {
  const tool = new AgentTool(null);
  const result = await tool.status();
  assert.equal(result.success, false);
  assert.ok(result.error);
});
