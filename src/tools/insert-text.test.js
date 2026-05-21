/**
 * ❄ INSERT TEXT TOOL TESTS ❄
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { mkdtemp } from 'fs/promises';
import { InsertTextTool } from './insert-text.js';

test('InsertTextTool insert at line position (1-based)', async () => {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'insert-text-'));
  const filePath = path.join(tmpDir, 'test.txt');
  await fs.writeFile(filePath, 'line1\nline2\nline3\n');

  const tool = new InsertTextTool();
  const result = await tool.insert(filePath, 'INSERTED', { mode: 'line', position: 2 });

  assert.equal(result.success, true);
  assert.equal(result.linesInserted, 1);
  const content = await fs.readFile(filePath, 'utf8');
  assert.equal(content, 'line1\nINSERTED\nline2\nline3\n');
});

test('InsertTextTool insert at line position (0-based)', async () => {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'insert-text-'));
  const filePath = path.join(tmpDir, 'test.txt');
  await fs.writeFile(filePath, 'line1\nline2\nline3\n');

  const tool = new InsertTextTool();
  const result = await tool.insert(filePath, 'INSERTED', { mode: 'line', position: 0, lineBased: false });

  assert.equal(result.success, true);
  const content = await fs.readFile(filePath, 'utf8');
  assert.equal(content, 'INSERTED\nline1\nline2\nline3\n');
});

test('InsertTextTool insert after search text', async () => {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'insert-text-'));
  const filePath = path.join(tmpDir, 'test.txt');
  await fs.writeFile(filePath, 'line1\nline2\nline3\n');

  const tool = new InsertTextTool();
  const result = await tool.insert(filePath, 'INSERTED', { mode: 'after', position: 'line2' });

  assert.equal(result.success, true);
  const content = await fs.readFile(filePath, 'utf8');
  assert.ok(content.includes('line2\nINSERTED\n'));
});

test('InsertTextTool insert before search text', async () => {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'insert-text-'));
  const filePath = path.join(tmpDir, 'test.txt');
  await fs.writeFile(filePath, 'line1\nline2\nline3\n');

  const tool = new InsertTextTool();
  const result = await tool.insert(filePath, 'INSERTED', { mode: 'before', position: 'line2' });

  assert.equal(result.success, true);
  const content = await fs.readFile(filePath, 'utf8');
  assert.ok(content.includes('line1\nINSERTED\nline2'));
});

test('InsertTextTool append to end of file', async () => {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'insert-text-'));
  const filePath = path.join(tmpDir, 'test.txt');
  await fs.writeFile(filePath, 'line1\nline2\n');

  const tool = new InsertTextTool();
  const result = await tool.insert(filePath, 'END', { mode: 'end' });

  assert.equal(result.success, true);
  const content = await fs.readFile(filePath, 'utf8');
  assert.ok(content.endsWith('END\n') || content.endsWith('END'));
});

test('InsertTextTool insert at beginning', async () => {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'insert-text-'));
  const filePath = path.join(tmpDir, 'test.txt');
  await fs.writeFile(filePath, 'line1\nline2\n');

  const tool = new InsertTextTool();
  const result = await tool.insert(filePath, 'BEGINNING', { mode: 'beginning' });

  assert.equal(result.success, true);
  const content = await fs.readFile(filePath, 'utf8');
  assert.ok(content.startsWith('BEGINNING'));
});

test('InsertTextTool rejects invalid mode', async () => {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'insert-text-'));
  const filePath = path.join(tmpDir, 'test.txt');
  await fs.writeFile(filePath, 'content\n');

  const tool = new InsertTextTool();
  const result = await tool.insert(filePath, 'x', { mode: 'invalid' });
  assert.equal(result.success, false);
  assert.ok(result.error);
});

test('InsertTextTool rejects empty filePath', async () => {
  const tool = new InsertTextTool();
  const result = await tool.insert('', 'text');
  assert.equal(result.success, false);
  assert.ok(result.error);
});

test('InsertTextTool after search not found returns error', async () => {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'insert-text-'));
  const filePath = path.join(tmpDir, 'test.txt');
  await fs.writeFile(filePath, 'line1\nline2\n');

  const tool = new InsertTextTool();
  const result = await tool.insert(filePath, 'text', { mode: 'after', position: 'nonexistent' });
  assert.equal(result.success, false);
  assert.ok(result.error.includes('not found'));
});
