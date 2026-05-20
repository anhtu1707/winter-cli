#!/usr/bin/env node

import { execFileSync } from 'child_process';

const output = process.platform === 'win32'
  ? execFileSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'npm pack --dry-run --json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  : execFileSync('npm', ['pack', '--dry-run', '--json'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
  });

const [pack] = JSON.parse(output);
const files = pack.files || [];
const blockedPrefixes = [
  'VSCode-win32-x64/',
  'vscode-main/',
  '.winter/',
  '.git/',
];
const blockedPatterns = [
  /(^|\/)src\/.*\.test\.js$/,
  /(^|\/)node_modules\//,
  /(^|\/).*\.tgz$/,
];

const violations = files
  .map(file => file.path)
  .filter(filePath => (
    blockedPrefixes.some(prefix => filePath.startsWith(prefix)) ||
    blockedPatterns.some(pattern => pattern.test(filePath))
  ));

if (violations.length > 0) {
  console.error('Package audit failed. Blocked files would be published:');
  for (const filePath of violations.slice(0, 50)) {
    console.error(`- ${filePath}`);
  }
  if (violations.length > 50) {
    console.error(`... and ${violations.length - 50} more`);
  }
  process.exit(1);
}

console.log(`Package audit passed: ${files.length} files, ${(pack.size / 1024 / 1024).toFixed(2)} MB tgz, ${(pack.unpackedSize / 1024 / 1024).toFixed(2)} MB unpacked.`);
