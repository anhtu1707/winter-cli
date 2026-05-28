import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTuiSnapshot,
  renderAssistantPanel,
  renderCommandCenter,
  renderConversationStartup,
  renderHistoryPanel,
  renderInputPanel,
  renderLandingTui,
  renderShellTui,
  renderStartupTui,
  renderStatusPanel,
  renderToolPanel,
} from './tui.js';
import { colors } from './snowflake-logo.js';

test('buildTuiSnapshot extracts stable REPL state', () => {
  const snapshot = buildTuiSnapshot({
    projectPath: 'E:\\dev\\app\\winter',
    taskQueue: [{ id: 1 }],
    isProcessing: true,
    ai: {
      _modelTier: 'small',
      getActiveProvider: () => 'custom2',
      providers: { custom2: { model: 'gpt-5.4-medium' } },
    },
    session: {
      getSessionId: () => '12345678-aaaa',
      getToolEvents: () => [{ tool: 'Read', success: true }, { toolName: 'Grep', success: false }],
      getHistory: () => [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi' },
      ],
    },
    codebaseSearcher: {
      indexer: {
        getStats: () => ({ totalFiles: 12, totalChunks: 40 }),
      },
    },
  });

  assert.equal(snapshot.provider, 'custom2');
  assert.equal(snapshot.model, 'gpt-5.4-medium');
  assert.equal(snapshot.projectName, 'winter');
  assert.equal(snapshot.modelTier, 'small');
  assert.equal(snapshot.statusText, 'running');
  assert.equal(snapshot.queueText, '1 queued');
  assert.equal(snapshot.codebaseFiles, 12);
  assert.equal(snapshot.codebaseChunks, 40);
  assert.match(snapshot.toolSummary, /Read:ok/);
  assert.match(snapshot.toolSummary, /Grep:fail/);
  assert(snapshot.recentHistory.some(line => line.includes('You: hello')));
});

test('renderHistoryPanel uses content fields from conversation entries', () => {
  const output = renderHistoryPanel([
    { role: 'user', content: 'hello there' },
    { role: 'assistant', content: 'winter here' },
  ], { colors, width: 82 });

  assert.match(output, /hello there/);
  assert.match(output, /winter here/);
  assert.doesNotMatch(output, /undefined/);
});

test('renderCommandCenter exposes Hermes-style agent core controls', () => {
  const output = renderCommandCenter({ colors, width: 96 });

  assert.match(output, /Agent/);
  assert.match(output, /hermes-agent/);
  assert.match(output, /\/mcp/);
  assert.match(output, /\/resources/);
  assert.match(output, /Gateway/);
  assert.match(output, /doctor tools/);
});

test('renderInputPanel keeps bottom sidebar controls visible', () => {
  const panel = renderInputPanel({
    provider: 'ollama',
    model: 'google/gemma-3-4b',
    projectName: 'winter',
    sessionShort: 'abcd1234',
    queueText: 'ready',
  }, { colors, width: 90 });

  assert.ok(panel.top.length > 0);
  assert.match(panel.status, /WINTER/);
  assert.match(panel.hint, /Ctrl\+V/);
});

test('renderStatusPanel summarizes project and model state', () => {
  const output = renderStatusPanel({
    projectName: 'winter',
    projectPath: 'E:\\dev\\app\\winter',
    provider: 'custom',
    model: 'm2',
    modelTier: 'medium',
    sessionShort: 'sess',
    queueText: 'empty',
    codebaseFiles: 10,
    codebaseChunks: 20,
    compact: true,
  }, { colors, width: 88 });

  assert.ok(output.length > 0);
  assert.match(output, /custom\/m2/);
  assert.match(output, /10 files, 20 chunks/);
});

test('renderLandingTui and command center present a compact dashboard', () => {
  const snapshot = {
    projectName: 'winter',
    projectPath: 'E:\\dev\\app\\winter',
    provider: 'custom',
    model: 'minimax-m2.5',
    modelTier: 'flagship',
    sessionShort: 'abcd1234',
    queueText: 'ready',
    compact: false,
    recentHistory: [
      { role: 'user', content: 'alo' },
      { role: 'assistant', content: 'hello' },
    ],
  };
  const landing = renderLandingTui(snapshot, { colors, width: 96 });
  const commands = renderCommandCenter({ colors, width: 96 });

  assert.match(landing, /Winter dashboard/);
  assert.match(landing, /AGENT CORE/);
  assert.match(landing, /COMMAND CENTER/);
  assert.match(commands, /hermes-agent/);
});

test('renderStartupTui keeps startup usable and command-centered', () => {
  const output = renderStartupTui({
    projectName: 'winter',
    projectPath: 'E:\\dev\\app\\winter',
    provider: 'custom',
    model: 'minimax-m2.5',
    modelTier: 'flagship',
    sessionShort: 'abcd1234',
    queueText: 'ready',
    codebaseFiles: 12,
    codebaseChunks: 40,
    startupNotices: ['updated skill.md', '4 recent messages'],
  }, { colors, width: 96 });

  assert.ok(output.length > 0);
  assert.match(output, /Winter dashboard/);
  assert.match(output, /COMMAND CENTER/);
  assert.doesNotMatch(output, /undefined/);
});

test('renderConversationStartup shows real transcript without undefined placeholders', () => {
  const output = renderConversationStartup({
    projectName: 'winter',
    projectPath: 'E:\\dev\\app\\winter',
    provider: 'custom',
    model: 'minimax-m2.5',
    modelTier: 'flagship',
    sessionShort: 'abcd1234',
    queueText: 'ready',
    codebaseFiles: 12,
    codebaseChunks: 40,
    recentHistory: [
      { role: 'user', content: 'alo' },
      { role: 'assistant', content: 'hello' },
    ],
    startupNotices: ['4 recent messages'],
  }, { colors, width: 96 });

  assert.ok(output.length > 0);
  assert.match(output, /You: alo/);
  assert.match(output, /Winter: hello/);
  assert.doesNotMatch(output, /undefined/);
});

test('renderShellTui renders the dashboard shell without undefined placeholders', () => {
  const output = renderShellTui({
    projectName: 'winter',
    projectPath: 'E:\\dev\\app\\winter',
    provider: 'custom',
    model: 'model-x',
    modelTier: 'flagship',
    sessionShort: 'abcd1234',
    queueText: 'ready',
    codebaseFiles: 12,
    codebaseChunks: 40,
    compact: false,
  }, { colors, width: 100, title: 'Winter Dashboard' });

  assert.ok(output.length > 0);
  assert.match(output, /Winter dashboard/);
  assert.match(output, /custom\/model-x/);
  assert.doesNotMatch(output, /undefined/);
});

test('renderAssistantPanel and renderToolPanel use boxed output', () => {
  const assistant = renderAssistantPanel({
    content: '# Done\n\nResult',
    footer: '10ms',
    colors,
    width: 80,
  });
  const tool = renderToolPanel({
    toolName: '[Read] Read',
    summary: 'README.md loaded',
    success: true,
    colors,
    width: 80,
  });

  assert.match(assistant, /ASSISTANT/);
  assert.match(assistant, /10ms/);
  assert.ok(tool.length > 0);
  assert.match(tool, /README\.md loaded/);
});
