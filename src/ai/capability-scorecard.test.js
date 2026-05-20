import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assessWinterCapabilities,
  formatCapabilityScorecard,
  WINTER_CAPABILITY_TARGET,
} from './capability-scorecard.js';

test('capability scorecard reaches Winter target when core agent gates are present', async () => {
  const repl = {
    projectPath: process.cwd(),
    agentRuntime: {},
    tools: {
      getToolDefinitions: () => [
        { name: 'Read' },
        { name: 'Agent' },
        { name: 'BrowserDebug' },
      ],
    },
    ai: {
      switchProvider: async () => 'custom',
    },
    tokenJuice: {},
    agentRegistry: {},
    inputController: {},
    runConversation: async () => ({}),
    runToolDoctor: async () => ({}),
    ensureCodebaseIndex: async () => ({}),
    buildCodebaseContext: async () => '',
    compressSessionContext: async () => {},
    getAgentTools: () => [
      { name: 'Read' },
      { name: 'Agent' },
      { name: 'BrowserDebug' },
    ],
    getSlashSuggestions: () => [{ cmd: '/doctor' }],
    handleDirectClipboardPaste: async () => false,
    runAutoHealing: async () => {},
  };

  const report = await assessWinterCapabilities(repl);

  assert.equal(report.status, 'ready');
  assert.equal(report.overall >= WINTER_CAPABILITY_TARGET, true);
  assert.equal(report.gaps.length, 0);
});

test('capability scorecard formatting exposes target and area names', async () => {
  const report = await assessWinterCapabilities({ projectPath: process.cwd() });
  const output = formatCapabilityScorecard(report);

  assert.match(output, /Winter capability scorecard/);
  assert.match(output, /target/);
  assert.match(output, /Agent runtime loop/);
  assert.match(output, /Codebase intelligence/);
});
