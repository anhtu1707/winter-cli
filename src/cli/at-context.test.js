import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { AtContextResolver } from './at-context.js';

test('AtContextResolver resolves bare @file mentions like Freebuff', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'winter-at-'));
  await writeFile(path.join(root, 'README.md'), '# Demo\n', 'utf8');

  const resolver = new AtContextResolver({ projectPath: root });
  const parsed = await resolver.parse('review @README.md please');

  assert.equal(parsed.input, 'review  please');
  assert.equal(parsed.hasAtReferences, true);
  assert.equal(parsed.contexts[0].type, 'file');
  assert.equal(parsed.contexts[0].path, 'README.md');
  assert.match(parsed.contexts[0].content, /Demo/);
});
