#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const isWin = process.platform === 'win32';
const nodeCmd = process.execPath;
const MAX_BUFFER = 50 * 1024 * 1024;

function run(command, args, options = {}) {
  const label = [path.basename(command), ...args].join(' ');
  console.log(`\n› ${label}`);
  return execFileSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: MAX_BUFFER,
    ...options,
  });
}

function runNpm(args) {
  if (!isWin) return run('npm', args);
  const commandLine = ['npm', ...args].join(' ');
  console.log(`\n› ${commandLine}`);
  return execFileSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', commandLine], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: MAX_BUFFER,
  });
}

function assertIncludes(output, expected, label) {
  if (!output.includes(expected)) {
    throw new Error(`${label} did not include ${JSON.stringify(expected)}. Output:\n${output}`);
  }
}

function printOutput(output) {
  const text = String(output || '').trim();
  if (text) console.log(text);
}

try {
  const winterBin = path.join(root, 'bin', 'winter.js');
  if (!existsSync(winterBin)) {
    throw new Error(`Missing CLI entrypoint: ${winterBin}`);
  }

  printOutput(run(nodeCmd, ['--check', winterBin]));
  printOutput(run(nodeCmd, ['--check', path.join(root, 'src', 'tools', 'executor.js')]));

  const versionOutput = run(nodeCmd, [winterBin, '--version']);
  printOutput(versionOutput);
  assertIncludes(versionOutput, 'Winter CLI v', 'version smoke');

  const helpOutput = run(nodeCmd, [winterBin, '--help']);
  printOutput(helpOutput);
  assertIncludes(helpOutput, 'WINTER CLI', 'help smoke');
  assertIncludes(helpOutput, 'winter doctor [full|tools]', 'help smoke');

  const auditOutput = runNpm(['run', 'pack:audit']);
  printOutput(auditOutput);
  assertIncludes(auditOutput, 'Package audit passed', 'pack audit');

  const packOutput = runNpm(['pack', '--dry-run', '--json']);
  const [pack] = JSON.parse(packOutput);
  if (!pack?.filename) {
    throw new Error(`npm pack dry-run did not return a package filename. Output:\n${packOutput}`);
  }
  console.log(`\nPackage dry-run passed: ${pack.filename} (${pack.files?.length || 0} files)`);

  console.log('\nSmoke package gate passed.');
} catch (error) {
  console.error(`\nSmoke package gate failed: ${error.message}`);
  process.exit(1);
}
