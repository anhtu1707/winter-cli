import test from 'node:test';
import assert from 'node:assert/strict';

import {
  detectCurrentShell,
  detectTerminalApp,
  formatRuntimeEnvironmentSummary,
  getRuntimeEnvironment,
} from './runtime-env.js';

test('detectCurrentShell identifies PowerShell on Windows', () => {
  const shell = detectCurrentShell({
    WINTER_PARENT_PROCESS: 'powershell.exe',
    ComSpec: 'C:\\Windows\\System32\\cmd.exe',
  }, 'win32');

  assert.equal(shell.kind, 'powershell');
});

test('detectCurrentShell identifies cmd.exe on Windows', () => {
  const shell = detectCurrentShell({
    WINTER_PARENT_PROCESS: 'cmd.exe',
    ComSpec: 'C:\\Windows\\System32\\cmd.exe',
  }, 'win32');

  assert.equal(shell.kind, 'cmd');
});

test('detectTerminalApp identifies common terminal hosts', () => {
  assert.equal(detectTerminalApp({ WT_SESSION: 'abc' }, 'win32'), 'Windows Terminal');
  assert.equal(detectTerminalApp({ VSCODE_PID: '123' }, 'win32'), 'VS Code integrated terminal');
});

test('runtime summary includes shell-specific Bash rules', () => {
  const profile = getRuntimeEnvironment({
    WT_SESSION: 'abc',
    WINTER_PARENT_PROCESS: 'powershell.exe',
    ComSpec: 'C:\\Windows\\System32\\cmd.exe',
  }, 'win32');
  const summary = formatRuntimeEnvironmentSummary(profile);

  assert.match(summary, /Host OS: Windows/);
  assert.match(summary, /Terminal app: Windows Terminal/);
  assert.match(summary, /Detected current shell: powershell\.exe \[powershell\]/);
  assert.match(summary, /Bash default execution shell: powershell/);
  assert.match(summary, /shell:"cmd"/);
});
