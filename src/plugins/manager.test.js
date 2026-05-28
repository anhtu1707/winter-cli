import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { PluginManager } from './manager.js';

test('PluginManager loads builtin and local plugin modules', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'winter-plugins-'));
  const manager = new PluginManager({ addToMemory: async () => {} });
  manager.pluginsDir = root;
  await writeFile(path.join(root, 'sample.js'), [
    'export default {',
    '  name: "sample-plugin",',
    '  version: "2.0.0",',
    '  description: "Sample",',
    '  hooks: { beforeRun: async ctx => ({ ok: ctx.ok }) },',
    '  commands: { sample: () => "command" },',
    '  tools: { sampleTool: {} }',
    '};',
  ].join('\n'));

  const plugins = await manager.listPlugins();
  const loaded = await manager.loadPlugin('sample-plugin');
  const hookResults = await manager.executeHook('beforeRun', { ok: true });

  assert(plugins.some(plugin => plugin.name === 'winter-core'));
  assert.equal(loaded.name, 'sample-plugin');
  assert.deepEqual(hookResults, [{ plugin: 'sample-plugin', result: { ok: true } }]);
  assert.equal(typeof manager.getPluginCommands().sample, 'function');
  assert.deepEqual(manager.getPluginTools().sampleTool, {});
});

test('PluginManager install and remove write session memory', async () => {
  const memories = [];
  const manager = new PluginManager({
    addToMemory: async (text, type) => memories.push({ text, type }),
  });

  await manager.installPlugin('local-tool');
  await manager.removePlugin('local-tool');

  assert.deepEqual(memories, [
    { text: 'Installed plugin: local-tool', type: 'plugin' },
    { text: 'Removed plugin: local-tool', type: 'plugin' },
  ]);
});
