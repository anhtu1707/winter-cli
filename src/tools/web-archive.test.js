/**
 * ❄ WEB ARCHIVE TOOL TESTS ❄
 */

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { mkdtemp } from 'fs/promises';
import { WebArchiveTool } from './web-archive.js';

const testUrl = 'https://example.com';
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

test('WebArchiveTool reject empty URL', async () => {
  const tool = new WebArchiveTool();
  const result = await tool.fetch('');
  assert.equal(result.success, false);
  assert.ok(result.error);
});

test('WebArchiveTool reject null URL', async () => {
  const tool = new WebArchiveTool();
  const result = await tool.fetch(null);
  assert.equal(result.success, false);
  assert.ok(result.error);
});

test('WebArchiveTool cacheKey generates consistent MD5', async () => {
  const tool = new WebArchiveTool();
  const key1 = tool.cacheKey(testUrl);
  const key2 = tool.cacheKey(testUrl);
  assert.equal(key1, key2);
  assert.equal(key1.length, 32); // MD5 hex
});

test('WebArchiveTool write and read cache', async () => {
  const tmpDir = await trackedMkdtemp('web-archive-');
  const tool = new WebArchiveTool(tmpDir);

  await tool.writeCache(testUrl, { source: 'test', content: 'test content' });
  const cached = await tool.readCache(testUrl);

  assert.ok(cached);
  assert.equal(cached.source, 'test');
  assert.equal(cached.content, 'test content');
  assert.ok(cached.cachedAt);
});

test('WebArchiveTool readCache returns null for unknown URL', async () => {
  const tmpDir = await trackedMkdtemp('web-archive-');
  const tool = new WebArchiveTool(tmpDir);

  const cached = await tool.readCache('https://nonexistent.example.com');
  assert.equal(cached, null);
});

test('WebArchiveTool clearCache single entry', async () => {
  const tmpDir = await trackedMkdtemp('web-archive-');
  const tool = new WebArchiveTool(tmpDir);

  await tool.writeCache(testUrl, { content: 'test' });
  const result = await tool.clearCache(testUrl);

  assert.equal(result.success, true);
  assert.equal(result.cleared, 1);
});

test('WebArchiveTool clearCache all entries', async () => {
  const tmpDir = await trackedMkdtemp('web-archive-');
  const tool = new WebArchiveTool(tmpDir);

  await tool.writeCache(testUrl, { content: 'test' });
  const result = await tool.clearCache();

  assert.equal(result.success, true);
});

test('WebArchiveTool fetch returns error for unreachable URL', async () => {
  const tmpDir = await trackedMkdtemp('web-archive-');
  const tool = new WebArchiveTool(tmpDir);

  const result = await tool.fetch('https://this-domain-does-not-exist-12345.com', { preferDirect: true });
  assert.equal(result.success, false);
  assert.ok(result.error);
});

test('WebArchiveTool fetchFromWayback returns null for unknown URL', async () => {
  const tool = new WebArchiveTool();
  const result = await tool.fetchFromWayback('https://this-domain-probably-not-archived-xyz.com');
  assert.equal(result, null);
});

test('WebArchiveTool clearCache option in fetch clears all', async () => {
  const tmpDir = await trackedMkdtemp('web-archive-');
  const tool = new WebArchiveTool(tmpDir);

  await tool.writeCache(testUrl, { content: 'cached' });
  const result = await tool.fetch(testUrl, { clearCache: true });

  assert.equal(result.success, true);
  // clearCache:true without specific URL clears all cache (returns -1)
  assert.equal(result.cleared, -1);
});

test('WebArchiveTool cache hit returns cached content', async () => {
  const tmpDir = await trackedMkdtemp('web-archive-');
  const tool = new WebArchiveTool(tmpDir);

  await tool.writeCache(testUrl, { content: 'cached content', source: 'test' });
  const result = await tool.fetch(testUrl);

  assert.equal(result.success, true);
  assert.equal(result.source, 'cache');
  assert.equal(result.content, 'cached content');
});
