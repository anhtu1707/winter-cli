import test from 'node:test';
import assert from 'node:assert/strict';
import { renderBox, stripAnsi, supportsUnicodeUi, visibleWidth, wrapText } from './terminal-ui.js';

test('visibleWidth ignores ANSI styling', () => {
  assert.equal(visibleWidth('\u001b[36mWinter\u001b[0m'), 6);
});

test('visibleWidth counts emoji and CJK characters as wider cells', () => {
  assert.equal(visibleWidth('\u26a0'), 2);
  assert.equal(visibleWidth('\u2713'), 1);
  assert.equal(visibleWidth('\u96ea'), 2);
});

test('supportsUnicodeUi defaults to Unicode unless explicitly disabled', () => {
  assert.equal(supportsUnicodeUi({}, 'win32'), true);
  assert.equal(supportsUnicodeUi({ WT_SESSION: '1' }, 'win32'), true);
  assert.equal(supportsUnicodeUi({ WINTER_UNICODE_UI: '1' }, 'win32'), true);
  assert.equal(supportsUnicodeUi({ WINTER_ASCII_UI: '1', WT_SESSION: '1' }, 'win32'), false);
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
    boxChars: {
      topLeft: '+',
      topRight: '+',
      bottomLeft: '+',
      bottomRight: '+',
      horizontal: '-',
      vertical: '|',
      teeLeft: '+',
      teeRight: '+',
    },
  });

  const lines = box.split('\n');
  assert.equal(stripAnsi(lines[0]).startsWith('+'), true);
  assert.equal(stripAnsi(lines[lines.length - 1]).startsWith('+'), true);
  assert.equal(stripAnsi(lines[1]).includes('Demo'), true);
  assert.equal(stripAnsi(lines[3]).includes('hello world'), true);
});

test('renderBox stays aligned with wide terminal output', () => {
  const box = renderBox({
    title: 'AGENT TOOLS EXECUTION',
    width: 60,
    body: ['AI wants to run: Get-Date -Format "dddd, dd/MM/yyyy"', 'OK Saturday'],
    borderColor: '',
    titleColor: '',
    reset: '',
    boxChars: {
      topLeft: '+',
      topRight: '+',
      bottomLeft: '+',
      bottomRight: '+',
      horizontal: '-',
      vertical: '|',
      teeLeft: '+',
      teeRight: '+',
    },
  });

  const lines = box.split('\n');
  assert.equal(stripAnsi(lines[0]).startsWith('+'), true);
  assert.equal(stripAnsi(lines[lines.length - 1]).startsWith('+'), true);
  for (const line of lines) {
    const stripped = stripAnsi(line);
    if (stripped.startsWith('+')) continue;
    assert.match(stripped, /^\|.*\|$/);
  }
});
