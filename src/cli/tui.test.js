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
  assert.equal(snapshot.sessionShort, '12345678');
  assert.equal(snapshot.queueText, 'queue:1');
  assert.equal(snapshot.processing, true);
  assert.equal(snapshot.statusText, 'working');
  assert.equal(snapshot.codebaseFiles, 12);
  assert.equal(snapshot.recentHistory.length, 2);
  assert.match(snapshot.toolSummary, /Read/);
  assert.match(snapshot.toolSummary, /Grep failed/);
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

test('renderInputPanel keeps bottom sidebar controls visible', () => {
  const panel = renderInputPanel({
    provider: 'ollama',
    model: 'google/gemma-3-4b',
    projectName: 'winter',
    sessionShort: 'abcd1234',
    queueText: 'ready',
  }, { colors, width: 90 });

  assert.match(panel.top, /WINTER/);
  assert.match(panel.status, /ollama\/google\/gemma-3-4b/);
  assert.match(panel.hint, /\^V img/);
  assert.match(panel.hint, /\/tui/);
  assert.match(panel.prompt, /winter/);
  assert.match(panel.bottom, /^\x1b\[[0-9;]*m\+/);
});

test('renderStatusPanel summarizes project and model state', () => {
  const output = renderStatusPanel({
    projectName: 'winter',
    projectPath: 'E:\\dev\\app\\winter',
    provider: 'custom',
    model: 'm2',
    modelTier: 'medium',
    sessionShort: 'sess',
    queueText: 'ready',
    codebaseFiles: 10,
    codebaseChunks: 20,
    compact: true,
  }, { colors, width: 88 });

  assert.match(output, /Winter TUI/);
  assert.match(output, /custom\/m2/);
  assert.match(output, /10 files, 20 chunks/);
  assert.match(output, /TokenJuice:compact/);
  assert.match(output, /Activity/);
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
      { role: 'assistant', content: 'Rồi rồi.' },
    ],
  };
  const landing = renderLandingTui(snapshot, { colors, width: 96 });
  const commands = renderCommandCenter({ colors, width: 96 });

  assert.match(landing, /WINTER/);
  assert.match(landing, /Winter Agent Console/);
  assert.match(landing, /Conversation/);
  assert.match(landing, /Activity/);
  assert.match(landing, /custom\/minimax-m2\.5/);
  assert.match(commands, /Command Center/);
  assert.match(commands, /\/auto/);
  assert.match(commands, /\/doctor full/);
});

test('renderStartupTui keeps startup compact and leaves dashboard to slash command', () => {
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

  assert.match(output, /WINTER/);
  assert.match(output, /custom\/minimax-m2\.5/);
  assert.match(output, /\^V img/);
  assert.doesNotMatch(output, /COMMAND/);
  assert.doesNotMatch(output, /Fast Actions/);
  assert.ok(output.split('\n').length >= 10);
});

test('renderConversationStartup shows real transcript without a fake input dock', () => {
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
      { role: 'assistant', content: 'Rá»“i rá»“i.' },
    ],
    startupNotices: ['4 recent messages'],
  }, { colors, width: 96 });

  assert.match(output, /Conversation/);
  assert.match(output, /You/);
  assert.match(output, /Winter/);
  assert.match(output, /Rá»“i rá»“i/);
  assert.match(output, /Winter/);
  assert.match(output, /╭|╰|\+/);
  assert.doesNotMatch(output, /INPUT winter >/);
});

test('renderShellTui lays out header sidebar main area and input dock', () => {
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

  assert.match(output, /WINTER/);
  assert.match(output, /MODEL/);
  assert.match(output, /SESSION/);
  assert.match(output, /Conversation/);
  assert.match(output, /custom\/model-x/);
  assert.match(output, /INPUT/);
  assert.match(output, /winter >/);
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

  assert.match(assistant, /Assistant/);
  assert.match(assistant, /10ms/);
  assert.match(tool, /Agent Tools/);
  assert.match(tool, /README\.md loaded/);
});
