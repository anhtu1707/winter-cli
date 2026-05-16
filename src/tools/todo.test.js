/**
 * ❄️ TODO TOOL TESTS ❄️
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { mkdtemp } from 'fs/promises';
import { TodoTool } from './todo.js';

test('TodoTool write creates new todo', async () => {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'todo-test-'));
  const tool = new TodoTool(tmpDir);

  const result = await tool.write('Test task', 'pending', 'high');

  assert.equal(result.success, true);
  assert.equal(result.todo.title, 'Test task');
  assert.equal(result.todo.status, 'pending');
  assert.equal(result.todo.priority, 'high');
  assert.equal(result.todo.id, '1');
  assert.ok(result.todo.createdAt);
});

test('TodoTool write rejects empty title', async () => {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'todo-test-'));
  const tool = new TodoTool(tmpDir);

  const result = await tool.write('');
  assert.equal(result.success, false);
  assert.ok(result.error);
});

test('TodoTool write accepts valid status and priority defaults', async () => {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'todo-test-'));
  const tool = new TodoTool(tmpDir);

  const result = await tool.write('Default task');

  assert.equal(result.todo.status, 'pending');
  assert.equal(result.todo.priority, 'medium');
});

test('TodoTool write validates status', async () => {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'todo-test-'));
  const tool = new TodoTool(tmpDir);

  const result = await tool.write('Invalid status', 'invalid_status');
  assert.equal(result.todo.status, 'pending'); // defaults to pending
});

test('TodoTool list returns all todos', async () => {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'todo-test-'));
  const tool = new TodoTool(tmpDir);
  await tool.write('Task 1');
  await tool.write('Task 2', 'completed');
  await tool.write('Task 3', 'in_progress');

  const result = await tool.list();
  assert.equal(result.success, true);
  assert.equal(result.count, 3);
});

test('TodoTool list filters by status', async () => {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'todo-test-'));
  const tool = new TodoTool(tmpDir);
  await tool.write('Task 1');
  await tool.write('Task 2', 'completed');
  await tool.write('Task 3', 'completed');

  const result = await tool.list('completed');
  assert.equal(result.count, 2);
  assert.ok(result.todos.every(t => t.status === 'completed'));
});

test('TodoTool update modifies existing todo', async () => {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'todo-test-'));
  const tool = new TodoTool(tmpDir);
  await tool.write('Initial title', 'pending', 'low');

  const result = await tool.update('1', { title: 'Updated title', status: 'in_progress', priority: 'high' });

  assert.equal(result.success, true);
  assert.equal(result.todo.title, 'Updated title');
  assert.equal(result.todo.status, 'in_progress');
  assert.equal(result.todo.priority, 'high');
});

test('TodoTool update returns error for nonexistent todo', async () => {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'todo-test-'));
  const tool = new TodoTool(tmpDir);

  const result = await tool.update('999', { title: 'Nope' });
  assert.equal(result.success, false);
  assert.ok(result.error.includes('not found'));
});

test('TodoTool delete removes todo', async () => {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'todo-test-'));
  const tool = new TodoTool(tmpDir);
  await tool.write('Delete me');

  const deleteResult = await tool.delete('1');
  assert.equal(deleteResult.success, true);
  assert.equal(deleteResult.todo.id, '1');

  const listResult = await tool.list();
  assert.equal(listResult.count, 0);
});

test('TodoTool delete returns error for nonexistent todo', async () => {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'todo-test-'));
  const tool = new TodoTool(tmpDir);

  const result = await tool.delete('999');
  assert.equal(result.success, false);
  assert.ok(result.error.includes('not found'));
});

test('TodoTool persists todos to disk', async () => {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'todo-test-'));
  const tool1 = new TodoTool(tmpDir);
  await tool1.write('Persistent task');

  const tool2 = new TodoTool(tmpDir);
  const result = await tool2.list();
  assert.equal(result.count, 1);
  assert.equal(result.todos[0].title, 'Persistent task');
});
