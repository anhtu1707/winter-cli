import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { CodebaseIndexer } from './indexer.js';
import { CodebaseSearch } from './search.js';

async function createProject() {
  const root = await mkdtemp(path.join(tmpdir(), 'winter-codebase-'));
  await mkdir(path.join(root, 'src'), { recursive: true });
  await mkdir(path.join(root, 'resources', 'local', 'dump'), { recursive: true });
  await mkdir(path.join(root, 'vscode-main', 'src'), { recursive: true });
  await mkdir(path.join(root, 'VSCode-win32-x64', 'resources'), { recursive: true });

  await writeFile(path.join(root, 'src', 'main.js'), [
    'export function winterSearchTarget() {',
    '  return "needle";',
    '}',
    '',
  ].join('\n'));
  await writeFile(path.join(root, 'resources', 'local', 'dump', 'noise.js'), 'export function noisyDump() {}\n');
  await writeFile(path.join(root, 'vscode-main', 'src', 'noise.js'), 'export function vscodeNoise() {}\n');
  await writeFile(path.join(root, 'VSCode-win32-x64', 'resources', 'noise.js'), 'export function binaryNoise() {}\n');
  return root;
}

test('CodebaseIndexer stores relative paths and ignores bundled heavy directories', async () => {
  const projectPath = await createProject();
  const indexer = new CodebaseIndexer({ projectPath });

  const stats = await indexer.indexAll();
  const indexedPaths = indexer.chunks.map(chunk => chunk.filePath);

  assert.equal(stats.totalFiles, 1);
  assert.deepEqual(indexedPaths, ['src/main.js']);
  assert.equal(indexer.fileHashes.has('src/main.js'), true);
  assert.equal(indexedPaths.some(filePath => path.isAbsolute(filePath)), false);
  assert.equal(indexedPaths.some(filePath => filePath.includes('resources/local')), false);
  assert.equal(indexedPaths.some(filePath => filePath.includes('vscode-main')), false);
  assert.equal(indexedPaths.some(filePath => filePath.includes('VSCode-win32-x64')), false);
});

test('CodebaseSearch getFileContext matches files indexed by indexAll', async () => {
  const projectPath = await createProject();
  const indexer = new CodebaseIndexer({ projectPath });
  const search = new CodebaseSearch({ projectPath, indexer });

  await search.reindex();

  const result = await search.query('winterSearchTarget');
  const context = search.getFileContext('src/main.js');
  const definition = await search.findSymbol('winterSearchTarget');

  assert.equal(result.totalFiles, 1);
  assert.equal(result.byFile[0].filePath, 'src/main.js');
  assert.equal(context.filePath, 'src/main.js');
  assert.equal(context.chunks.length, 1);
  assert.equal(definition[0].filePath, 'src/main.js');
});
