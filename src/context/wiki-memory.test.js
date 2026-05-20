import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'fs';
import { mkdtemp } from 'fs/promises';
import path from 'path';
import { tmpdir } from 'os';

import { chunkMarkdown, estimateTokens, WikiMemoryStore } from './wiki-memory.js';

test('chunkMarkdown splits notes around the configured token budget', () => {
  const chunks = chunkMarkdown(['# Large note', 'x'.repeat(9000), 'y'.repeat(9000)].join('\n\n'), 1200);

  assert(chunks.length > 1);
  assert(chunks.every(chunk => estimateTokens(chunk) <= 1300));
});

test('WikiMemoryStore writes Obsidian-style markdown chunk tree', async () => {
  const projectPath = await mkdtemp(path.join(tmpdir(), 'winter-wiki-memory-'));
  const store = new WikiMemoryStore({
    projectPath,
    maxChunkTokens: 900,
    now: () => new Date('2026-05-19T00:00:00.000Z'),
  });

  const saved = await store.saveMarkdownChunks({
    title: 'Read src/index.js',
    type: 'tool-output',
    namespace: 'tool-output/read',
    markdown: `# Read src/index.js\n\n${'const value = 1;\n'.repeat(1200)}`,
    metadata: { tool: 'Read', source: 'src/index.js' },
  });

  assert(saved.parts > 1);
  assert(saved.links.every(link => /^\[\[tool-output\/read\/2026-05-19\//.test(link)));

  const first = await fs.readFile(saved.files[0].path, 'utf8');
  assert.match(first, /^---/);
  assert.match(first, /type: "tool-output"/);
  assert.match(first, /Backlinks: \[\[index\]\], \[\[tool-output\/read\/index\]\]/);

  const rootIndex = await fs.readFile(path.join(projectPath, '.winter', 'memory', 'index.md'), 'utf8');
  assert.match(rootIndex, /\[\[tool-output\/read\/2026-05-19\//);
});
