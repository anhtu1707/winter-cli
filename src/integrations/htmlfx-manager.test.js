import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { HtmlFxManager } from './htmlfx-manager.js';

test('HtmlFxManager reports install paths and missing binary state', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'winter-htmlfx-'));
  const manager = new HtmlFxManager({ projectPath: root });

  const info = await manager.info();

  assert.equal(info.installed, false);
  assert.equal(info.binaryReady, false);
  assert.match(info.repoPath, /html-effectiveness-scripts/);
  assert.match(info.binaryPath, /html-effectiveness/);
});

test('HtmlFxManager validates compile inputs before running binary', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'winter-htmlfx-compile-'));
  const manager = new HtmlFxManager({ projectPath: root });

  const missingBinary = await manager.compile({ inputPath: 'in.html', outputPath: 'out.html' });

  assert.equal(missingBinary.success, false);
  assert.match(missingBinary.error, /binary not found/);
});

test('HtmlFxManager lists output_goal html files when installed', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'winter-htmlfx-list-'));
  const manager = new HtmlFxManager({ projectPath: root });
  const outputDir = path.join(manager.getRepoPath(), 'output_goal');
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, 'b.html'), '<b></b>');
  await writeFile(path.join(outputDir, 'a.html'), '<a></a>');
  await writeFile(path.join(outputDir, 'note.txt'), 'skip');

  const result = await manager.listOutputGoal();

  assert.equal(result.success, true);
  assert.deepEqual(result.files, ['a.html', 'b.html']);
  assert.equal(result.count, 2);
});
