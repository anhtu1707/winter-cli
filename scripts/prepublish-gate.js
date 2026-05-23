#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import process from 'node:process';

const isWin = process.platform === 'win32';
const MAX_BUFFER = 50 * 1024 * 1024;

function run(command, args, label = `${command} ${args.join(' ')}`) {
  console.log(`\n› ${label}`);
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: MAX_BUFFER,
  });
}

function runNpm(args) {
  if (!isWin) {
    return run('npm', args, `npm ${args.join(' ')}`);
  }

  const commandLine = ['npm', ...args].join(' ');
  console.log(`\n› ${commandLine}`);
  return execFileSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', commandLine], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: MAX_BUFFER,
  });
}

function printOutput(output) {
  const text = String(output || '').trim();
  if (text) console.log(text);
}

try {
  printOutput(runNpm(['run', 'test']));
  printOutput(runNpm(['run', 'smoke:package']));
  console.log('\nPrepublish gate passed.');
} catch (error) {
  console.error(`\nPrepublish gate failed: ${error.message}`);
  process.exit(1);
}
