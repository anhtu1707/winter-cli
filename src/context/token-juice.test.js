import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'fs';
import { mkdtemp } from 'fs/promises';
import path from 'path';
import { tmpdir } from 'os';

import { TokenJuice } from './token-juice.js';
import { WikiMemoryStore } from './wiki-memory.js';

test('TokenJuice leaves small tool results inline', async () => {
  const projectPath = await mkdtemp(path.join(tmpdir(), 'winter-tokenjuice-small-'));
  const tokenJuice = new TokenJuice({ projectPath, inlineBudgetTokens: 1000 });

  const result = await tokenJuice.compressToolResult({
    toolName: 'Read',
    result: { success: true, path: 'small.js', content: 'const ok = true;' },
    promptResult: { success: true, path: 'small.js', content: 'const ok = true;' },
  });

  assert.equal(result.content, 'const ok = true;');
  assert.equal(result.tokenJuice, undefined);
});

test('TokenJuice stores large tool output in wiki memory and returns compact prompt payload', async () => {
  const projectPath = await mkdtemp(path.join(tmpdir(), 'winter-tokenjuice-large-'));
  const store = new WikiMemoryStore({
    projectPath,
    maxChunkTokens: 900,
    now: () => new Date('2026-05-19T01:02:03.000Z'),
  });
  const tokenJuice = new TokenJuice({ projectPath, store, inlineBudgetTokens: 400 });
  const largeContent = [
    'import fs from "fs";',
    'export function run() { return true; }',
    'x'.repeat(9000),
    'throw new Error("boom");',
  ].join('\n');

  const result = await tokenJuice.compressToolResult({
    toolName: 'Read',
    result: { success: true, path: 'src/large.js', content: largeContent, lines: 4, size: largeContent.length },
    promptResult: { success: true, path: 'src/large.js', content: largeContent.slice(0, 500), lines: 4, size: largeContent.length },
  });

  assert.equal(result.success, true);
  assert.equal(result.path, 'src/large.js');
  assert.equal(result.tokenJuice.compressed, true);
  assert(result.tokenJuice.originalTokens > result.tokenJuice.inlineTokens);
  assert(result.tokenJuice.memoryLinks.length > 1);
  assert.match(result.content, /TokenJuice losslessly stored/);
  assert.match(result.content, /Full detail chunks/);
  assert.match(result.content, /Chunk map/);
  assert.match(result.content, /Read on the memory file/);
  assert.match(result.content, /L1: import fs from/);
  assert.match(result.content, /Representative excerpts/);
  assert.equal(result.tokenJuice.detailRetrieval, 'Read the listed memoryFiles for exact omitted content.');

  const stored = await fs.readFile(path.join(projectPath, '.winter', 'memory', result.tokenJuice.memoryFiles[0]), 'utf8');
  assert.match(stored, /# Read src\/large\.js/);
  assert.match(stored, /```text/);
});
