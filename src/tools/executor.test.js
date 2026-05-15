import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { ToolExecutor } from './executor.js';

test('Bash validates missing command instead of throwing', async () => {
  const tools = new ToolExecutor({ projectPath: process.cwd() });
  const result = await tools.execute('Bash', {});

  assert.equal(result.success, false);
  assert.equal(result.error, 'command is required');
});

test('tool names accept common model aliases', () => {
  const tools = new ToolExecutor({ projectPath: process.cwd() });

  assert.equal(tools.normalizeToolName('read_file'), 'Read');
  assert.equal(tools.normalizeToolName('shell'), 'Bash');
  assert.equal(tools.normalizeToolName('web-search'), 'WebSearch');
});

test('Read lists directories instead of failing on directory paths', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'winter-tools-'));
  await mkdir(path.join(root, 'sub'));
  await writeFile(path.join(root, 'a.txt'), 'hello');

  const tools = new ToolExecutor({ projectPath: root });
  const result = await tools.execute('Read', { file_path: root });

  assert.equal(result.success, true);
  assert.equal(result.isDirectory, true);
  assert.match(result.content, /\[file\] a\.txt/);
  assert.match(result.content, /\[dir\]\s+sub/);
});
