/**
 * ❄ INTERACTIVE TOOL TESTS ❄
 * Note: Tests that require stdin (promptSelect, promptText) are skipped
 * since there's no way to provide input in test mode.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InteractiveTool } from './interactive.js';

test('InteractiveTool askQuestion rejects null questions', async () => {
  const tool = new InteractiveTool(null);
  const result = await tool.askQuestion(null);
  assert.equal(result.success, false);
  assert.ok(result.error);
});

test('InteractiveTool askQuestion rejects empty array', async () => {
  const tool = new InteractiveTool(null);
  const result = await tool.askQuestion([]);
  assert.equal(result.success, false);
  assert.ok(result.error);
});

test('InteractiveTool askQuestion handles question without text', async () => {
  const tool = new InteractiveTool(null);
  const result = await tool.askQuestion({ id: 'no-text', type: 'text' });
  assert.equal(result.success, true);
  assert.equal(result.count, 1);
  assert.ok(result.answers['no-text'].error);
});

test('InteractiveTool askQuestion skips questions missing text', async () => {
  const tool = new InteractiveTool(null);
  const result = await tool.askQuestion([
    { id: 'q2', type: 'text' },
    { id: 'q3', type: 'select', options: [] },
  ]);
  assert.equal(result.success, true);
  assert.equal(result.count, 2);
  assert.ok(result.answers.q2.error);
  assert.ok(result.answers.q3.error);
});
