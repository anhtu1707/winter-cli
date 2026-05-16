import test from 'node:test';
import assert from 'node:assert/strict';
import { renderBox, stripAnsi, visibleWidth, wrapText } from './terminal-ui.js';

test('visibleWidth ignores ANSI styling', () => {
  assert.equal(visibleWidth('\u001b[36mWinter\u001b[0m'), 6);
});

test('visibleWidth counts emoji as wider cells', () => {
  assert.equal(visibleWidth('⚠'), 2);
  assert.equal(visibleWidth('✓'), 1);
  assert.equal(visibleWidth('⚙'), 2);
});

test('wrapText splits long lines by visible width', () => {
  assert.deepEqual(wrapText('winter cli is surprisingly compact', 10), [
    'winter cli',
    'is',
    'surprising',
    'ly compact',
  ]);
});

test('renderBox keeps borders balanced', () => {
  const box = renderBox({
    title: 'Demo',
    width: 40,
    body: ['hello world'],
    borderColor: '',
    titleColor: '',
    reset: '',
  });

  const lines = box.split('\n');
  assert.equal(stripAnsi(lines[0]).startsWith('╭'), true);
  assert.equal(stripAnsi(lines[lines.length - 1]).startsWith('╰'), true);
  assert.equal(stripAnsi(lines[1]).includes('Demo'), true);
  assert.equal(stripAnsi(lines[3]).includes('hello world'), true);
});

test('renderBox stays aligned with emoji-heavy tool output', () => {
  const box = renderBox({
    title: 'AGENT TOOLS EXECUTION',
    width: 60,
    body: ['⚠ AI muốn chạy: Get-Date -Format "dddd, dd/MM/yyyy"', '✓ Saturday'],
    borderColor: '',
    titleColor: '',
    reset: '',
  });

  const lines = box.split('\n');
  assert.equal(stripAnsi(lines[0]).startsWith('╭'), true);
  assert.equal(stripAnsi(lines[lines.length - 1]).startsWith('╰'), true);
  for (const line of lines) {
    const stripped = stripAnsi(line);
    if (stripped.startsWith('╭') || stripped.startsWith('╰') || stripped.startsWith('├')) continue;
    assert.match(stripped, /^│.*│$/);
  }
});
