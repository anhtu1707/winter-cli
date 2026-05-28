#!/usr/bin/env node

import { execFileSync } from 'child_process';

const PACK_STDIO_OPTIONS = {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
  maxBuffer: 50 * 1024 * 1024,
};

const output = process.platform === 'win32'
  ? execFileSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'npm pack --dry-run --json'], PACK_STDIO_OPTIONS)
  : execFileSync('npm', ['pack', '--dry-run', '--json'], PACK_STDIO_OPTIONS);

const [pack] = JSON.parse(output);
const files = pack.files || [];
const blockedPrefixes = [
  'VSCode-win32-x64/',
  'vscode-main/',
  '.winter/',
  '.git/',
  '.github/',
  '.claude/',
  '.codegraph/',
  'extensions/vscode/node_modules/',
  'extensions/vscode/out/',
  'resources/local/codex/config.toml',
  'resources/local/codex/memories/',
  'resources/local/claude/settings.json',
  'resources/local/claude/tasks/',
  'resources/local/claude/todos/',
  'resources/local/ecc/node_modules/',
  'resources/local/gsap-skills/.git/',
  'resources/local/hermes-agent-core/.git/',
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

const requiredPrefixes = [
  'resources/local/agents.md/',
  'resources/local/awesome-design-md/',
  'resources/local/codex/AGENTS.md',
  'resources/local/codex/models_cache.json',
  'resources/local/codex/plugins/',
  'resources/local/codex/rules/',
  'resources/local/codex/skills/',
  'resources/local/claude/plugins/',
  'resources/local/claude/skills/',
  'resources/local/karpathy-tools/',
  'resources/local/page-agent/',
  'resources/local/ecc/',
  'resources/local/gsap-skills/',
  'resources/local/hermes-agent-core/',
  'docs/',
  'rules/',
  'scripts/smoke-browser.js',
  'extensions/vscode/',
  'skills/',
  'memories/',
  'CLAUDE.md',
  'design.md',
  'skill.md',
  'rule.md',
];

const missingRequired = requiredPrefixes
  .filter(prefix => !files.some(file => file.path.startsWith(prefix)));

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

if (missingRequired.length > 0) {
  console.error('Package audit failed. Required packaged paths are missing:');
  for (const prefix of missingRequired) {
    console.error(`- ${prefix}`);
  }
  process.exit(1);
}

console.log(`Package audit passed: ${files.length} files, ${(pack.size / 1024 / 1024).toFixed(2)} MB tgz, ${(pack.unpackedSize / 1024 / 1024).toFixed(2)} MB unpacked.`);
