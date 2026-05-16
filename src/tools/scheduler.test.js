/**
 * ❄️ SCHEDULER TOOL TESTS ❄️
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { mkdtemp } from 'fs/promises';
import { SchedulerTool } from './scheduler.js';

test('SchedulerTool parseDelay handles milliseconds', () => {
  const tool = new SchedulerTool();
  assert.equal(tool.parseDelay(5000), 5000);
  assert.equal(tool.parseDelay(1000), 1000);
  assert.equal(tool.parseDelay(0), 1000); // minimum 1000
});

test('SchedulerTool parseDelay handles string formats', () => {
  const tool = new SchedulerTool();
  assert.equal(tool.parseDelay('30s'), 30000);
  assert.equal(tool.parseDelay('5m'), 300000);
  assert.equal(tool.parseDelay('1h'), 3600000);
  assert.equal(tool.parseDelay('2d'), 172800000);
  assert.equal(tool.parseDelay('500ms'), 500);
});

test('SchedulerTool parseDelay rejects invalid format', () => {
  const tool = new SchedulerTool();
  assert.equal(tool.parseDelay('not-a-delay'), null);
  assert.equal(tool.parseDelay(''), null);
});

test('SchedulerTool schedule creates scheduled item', async () => {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'scheduler-test-'));
  const tool = new SchedulerTool(tmpDir);

  const result = await tool.schedule('60s', 'Test reminder', false);

  assert.equal(result.success, true);
  assert.equal(result.schedule.prompt, 'Test reminder');
  assert.equal(result.schedule.recurring, false);
  assert.equal(result.schedule.status, 'scheduled');
  assert.equal(result.schedule.id, '1');
  assert.ok(result.schedule.triggerAt);

  // Cleanup timer
  tool.destroy();
});

test('SchedulerTool schedule rejects invalid delay format', async () => {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'scheduler-test-'));
  const tool = new SchedulerTool(tmpDir);

  const result = await tool.schedule('invalid', 'bad format', false);
  assert.equal(result.success, false);
  assert.ok(result.error.includes('delay'));
});

test('SchedulerTool schedule rejects empty prompt', async () => {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'scheduler-test-'));
  const tool = new SchedulerTool(tmpDir);

  const result = await tool.schedule('60s', '', false);
  assert.equal(result.success, false);
  assert.ok(result.error.includes('prompt'));
});

test('SchedulerTool list returns schedules', async () => {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'scheduler-test-'));
  const tool = new SchedulerTool(tmpDir);

  await tool.schedule('60s', 'Reminder 1', false);
  await tool.schedule('120s', 'Reminder 2', true);

  const result = await tool.list();
  assert.equal(result.success, true);
  assert.equal(result.count, 2);

  tool.destroy();
});

test('SchedulerTool delete removes schedule and timer', async () => {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'scheduler-test-'));
  const tool = new SchedulerTool(tmpDir);

  await tool.schedule('60s', 'Delete me', false);
  const result = await tool.delete('1');

  assert.equal(result.success, true);
  assert.equal(result.schedule.id, '1');

  const listResult = await tool.list();
  assert.equal(listResult.count, 0);

  tool.destroy();
});

test('SchedulerTool delete returns error for nonexistent schedule', async () => {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'scheduler-test-'));
  const tool = new SchedulerTool(tmpDir);

  const result = await tool.delete('999');
  assert.equal(result.success, false);
  assert.ok(result.error.includes('not found'));
});

test('SchedulerTool clearAll removes everything', async () => {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'scheduler-test-'));
  const tool = new SchedulerTool(tmpDir);

  await tool.schedule('60s', 'Reminder 1', false);
  await tool.schedule('120s', 'Reminder 2', false);

  const clearResult = await tool.clearAll();
  assert.equal(clearResult.success, true);

  const listResult = await tool.list();
  assert.equal(listResult.count, 0);

  tool.destroy();
});

test('SchedulerTool persists schedules to disk', async () => {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'scheduler-test-'));
  const tool1 = new SchedulerTool(tmpDir);
  await tool1.schedule('60s', 'Persistent schedule', false);
  tool1.destroy();

  const tool2 = new SchedulerTool(tmpDir);
  const result = await tool2.list();
  assert.equal(result.count, 1);
  assert.equal(result.schedules[0].prompt, 'Persistent schedule');
  tool2.destroy();
});
