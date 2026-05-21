/**
 * ❄ STRING REPLACE ALL TOOL TESTS ❄
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { mkdtemp } from 'fs/promises';
import { StrReplaceAllTool } from './str-replace-all.js';

test('StrReplaceAllTool replaces all occurrences', async () => {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'str-replace-all-'));
  const filePath = path.join(tmpDir, 'test.txt');
  await fs.writeFile(filePath, 'foo bar foo bar foo');

  const tool = new StrReplaceAllTool();
  const result = await tool.replaceAll(filePath, 'foo', 'baz');

  assert.equal(result.success, true);
  assert.equal(result.replacements, 3);
  const content = await fs.readFile(filePath, 'utf8');
  assert.equal(content, 'baz bar baz bar baz');
});

test('StrReplaceAllTool single occurrence', async () => {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'str-replace-all-'));
  const filePath = path.join(tmpDir, 'test.txt');
  await fs.writeFile(filePath, 'hello world');

  const tool = new StrReplaceAllTool();
  const result = await tool.replaceAll(filePath, 'hello', 'goodbye');

  assert.equal(result.success, true);
  assert.equal(result.replacements, 1);
  const content = await fs.readFile(filePath, 'utf8');
  assert.equal(content, 'goodbye world');
});

test('StrReplaceAllTool no match returns error', async () => {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'str-replace-all-'));
  const filePath = path.join(tmpDir, 'test.txt');
  await fs.writeFile(filePath, 'hello world');

  const tool = new StrReplaceAllTool();
  const result = await tool.replaceAll(filePath, 'nonexistent', 'replacement');
  assert.equal(result.success, false);
  assert.ok(result.error.includes('not found'));
});

test('StrReplaceAllTool rejects empty filePath', async () => {
  const tool = new StrReplaceAllTool();
  const result = await tool.replaceAll('', 'old', 'new');
  assert.equal(result.success, false);
  assert.ok(result.error);
});

test('StrReplaceAllTool rejects empty oldString', async () => {
  const tool = new StrReplaceAllTool();
  const result = await tool.replaceAll('/tmp/test.txt', '', 'new');
  assert.equal(result.success, false);
  assert.ok(result.error);
});

test('StrReplaceAllTool multiline replacement', async () => {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'str-replace-all-'));
  const filePath = path.join(tmpDir, 'test.txt');
  await fs.writeFile(filePath, 'line1\nold\nline3\nold\nline5');

  const tool = new StrReplaceAllTool();
  const result = await tool.replaceAll(filePath, 'old', 'new');

  assert.equal(result.success, true);
  assert.equal(result.replacements, 2);
  const content = await fs.readFile(filePath, 'utf8');
  assert.equal(content, 'line1\nnew\nline3\nnew\nline5');
});

test('StrReplaceAllTool replaces empty newString (deletion)', async () => {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'str-replace-all-'));
  const filePath = path.join(tmpDir, 'test.txt');
  await fs.writeFile(filePath, 'remove-me keep-me remove-me keep-me');

  const tool = new StrReplaceAllTool();
  const result = await tool.replaceAll(filePath, 'remove-me ', '');

  assert.equal(result.success, true);
  assert.equal(result.replacements, 2);
  const content = await fs.readFile(filePath, 'utf8');
  assert.equal(content, 'keep-me keep-me');
});

test('StrReplaceAllTool nonexistent file returns error', async () => {
  const tool = new StrReplaceAllTool();
  const result = await tool.replaceAll('/nonexistent/path.txt', 'old', 'new');
  assert.equal(result.success, false);
  assert.ok(result.error);
});
