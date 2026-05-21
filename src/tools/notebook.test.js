/**
 * ❄ NOTEBOOK TOOL TESTS ❄
 */

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { mkdtemp } from 'fs/promises';
import { NotebookTool } from './notebook.js';

const SAMPLE_NOTEBOOK = {
  cells: [
    {
      cell_type: 'code',
      source: ['print("hello world")\n'],
      outputs: [{ output_type: 'stream', text: ['hello world\n'], name: 'stdout' }],
      execution_count: 1,
      metadata: {},
    },
    {
      cell_type: 'markdown',
      source: ['# Title\n', 'Some **bold** text\n'],
      outputs: [],
      execution_count: null,
      metadata: {},
    },
    {
      cell_type: 'code',
      source: ['import numpy as np\n', 'arr = np.array([1, 2, 3])\n', 'print(arr)\n'],
      outputs: [],
      execution_count: 2,
      metadata: {},
    },
  ],
  metadata: {
    kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' },
    language_info: { name: 'python', version: '3.10.0' },
  },
  nbformat: 4,
  nbformat_minor: 5,
};

test('NotebookTool read returns cells with correct metadata', async () => {
  const tmpDir = await trackedMkdtemp('notebook-test-');
  const nbPath = path.join(tmpDir, 'test.ipynb');
  await fs.writeFile(nbPath, JSON.stringify(SAMPLE_NOTEBOOK));

  const tool = new NotebookTool();
  const result = await tool.read(nbPath);

  assert.equal(result.success, true);
  assert.equal(result.path, nbPath);
  assert.equal(result.cellCount, 3);
  assert.equal(result.cells[0].type, 'code');
  assert.equal(result.cells[0].source, 'print("hello world")\n');
  assert.equal(result.cells[1].type, 'markdown');
  assert.equal(result.cells[1].source, '# Title\nSome **bold** text\n');
  assert.equal(result.cells[2].execution_count, 2);
  assert.equal(result.metadata.kernelspec.display_name, 'Python 3');
  assert.equal(result.nbformat, 4);
});

test('NotebookTool read fails gracefully on invalid path', async () => {
  const tool = new NotebookTool();
  const result = await tool.read('/nonexistent/path.ipynb');
  assert.equal(result.success, false);
  assert.ok(result.error);
});

test('NotebookTool read fails gracefully on invalid JSON', async () => {
  const tmpDir = await trackedMkdtemp('notebook-test-');
  const nbPath = path.join(tmpDir, 'invalid.ipynb');
  await fs.writeFile(nbPath, 'not json');

  const tool = new NotebookTool();
  const result = await tool.read(nbPath);
  assert.equal(result.success, false);
  assert.ok(result.error);
});

test('NotebookTool edit modifies cell source', async () => {
  const tmpDir = await trackedMkdtemp('notebook-test-');
  const nbPath = path.join(tmpDir, 'test.ipynb');
  await fs.writeFile(nbPath, JSON.stringify(SAMPLE_NOTEBOOK));

  const tool = new NotebookTool();
  const result = await tool.edit(nbPath, 'cell-0', 'print("edited")\n');

  assert.equal(result.success, true);
  assert.equal(result.cellId, 'cell-0');
  assert.equal(result.oldSource, 'print("hello world")\n');
  assert.equal(result.newSource, 'print("edited")\n');  // Verify file was updated
      const updated = JSON.parse(await fs.readFile(nbPath, 'utf8'));
      const actualSource = Array.isArray(updated.cells[0].source) ? updated.cells[0].source.join('') : updated.cells[0].source;
      assert.ok(actualSource.includes('print("edited")'), `Expected source to contain 'print("edited")', got: ${JSON.stringify(actualSource)}`);
});

test('NotebookTool edit invalid cell returns error', async () => {
  const tmpDir = await trackedMkdtemp('notebook-test-');
  const nbPath = path.join(tmpDir, 'test.ipynb');
  await fs.writeFile(nbPath, JSON.stringify(SAMPLE_NOTEBOOK));

  const tool = new NotebookTool();
  const result = await tool.edit(nbPath, 'cell-99', 'new content');
  assert.equal(result.success, false);
  assert.ok(result.error.includes('not found'));
});

test('NotebookTool execute returns cell info', async () => {
  const tmpDir = await trackedMkdtemp('notebook-test-');
  const nbPath = path.join(tmpDir, 'test.ipynb');
  await fs.writeFile(nbPath, JSON.stringify(SAMPLE_NOTEBOOK));

  const tool = new NotebookTool();
  const result = await tool.execute(nbPath, 'cell-0');

  assert.equal(result.success, true);
  assert.equal(result.cellType, 'code');
  assert.equal(result.cellId, 'cell-0');
  assert.ok(result.source.includes('hello world'));
  assert.equal(result.outputs.length, 1);
  assert.equal(result.outputs[0].output_type, 'stream');
});

test('NotebookTool listCells returns cell summaries', async () => {
  const tmpDir = await trackedMkdtemp('notebook-test-');
  const nbPath = path.join(tmpDir, 'test.ipynb');
  await fs.writeFile(nbPath, JSON.stringify(SAMPLE_NOTEBOOK));

  const tool = new NotebookTool();
  const result = await tool.listCells(nbPath);

  assert.equal(result.success, true);
  assert.equal(result.cellCount, 3);
  assert.equal(result.kernel, 'Python 3');
  assert.equal(result.language, 'python');
  assert.ok(result.cells[0].id, 'cell-0');
  assert.ok(result.cells[1].hasOutputs === false);
});

const tmpDirs = [];
const trackedMkdtemp = async (prefix) => {
  const dir = await mkdtemp(path.join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
};

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});
