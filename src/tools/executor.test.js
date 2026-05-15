import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { ToolExecutor } from './executor.js';

test('Bash validates missing command instead of throwing', async () => {
  const tools = new ToolExecutor({ projectPath: process.cwd() });
  const result = await tools.execute('Bash', {});

  assert.equal(result.success, false);
  assert.equal(result.error, 'command is required');
});

test('unknown tools return recovery guidance instead of a bare failure', async () => {
  const tools = new ToolExecutor({ projectPath: process.cwd() });
  const result = await tools.execute('bad_tool_name', {});

  assert.equal(result.success, false);
  assert.equal(result.error, 'Unknown tool: bad_tool_name');
  assert(result.availableTools.includes('Write'));
  assert.match(result.recovery, /Write/);
});

test('tool names accept common model aliases', () => {
  const tools = new ToolExecutor({ projectPath: process.cwd() });

  assert.equal(tools.normalizeToolName('read_file'), 'Read');
  assert.equal(tools.normalizeToolName('write_to_file'), 'Write');
  assert.equal(tools.normalizeToolName('replace_in_file'), 'Edit');
  assert.equal(tools.normalizeToolName('command_executor'), 'Bash');
  assert.equal(tools.normalizeToolName('execute_command'), 'Bash');
  assert.equal(tools.normalizeToolName('list_files'), 'Glob');
  assert.equal(tools.normalizeToolName('search_files'), 'Grep');
  assert.equal(tools.normalizeToolName('shell'), 'Bash');
  assert.equal(tools.normalizeToolName('web-search'), 'WebSearch');
});

test('Bash supports model-style heredoc file writes', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'winter-heredoc-'));
  const tools = new ToolExecutor({ projectPath: root });
  const result = await tools.execute('command_executor', {
    command: "cat > src/components/InstallSection.tsx << 'EOF'\nconst ok = true;\nEOF",
  });

  assert.equal(result.success, true);
  assert.equal(result.path, path.join(root, 'src', 'components', 'InstallSection.tsx'));

  const read = await tools.execute('Read', { file_path: 'src/components/InstallSection.tsx' });
  assert.equal(read.content, 'const ok = true;\n');
});

test('Windows Bash runs PowerShell commands and translates ls flags', async (t) => {
  if (process.platform !== 'win32') {
    t.skip('Windows-only shell behavior');
    return;
  }

  const root = await mkdtemp(path.join(tmpdir(), 'winter-powershell-'));
  await mkdir(path.join(root, 'src', 'components'), { recursive: true });
  await writeFile(path.join(root, 'src', 'components', 'a.txt'), 'hello');

  const tools = new ToolExecutor({ projectPath: root });
  const ls = await tools.execute('Bash', { command: 'ls -la src/components/' });
  assert.equal(ls.success, true);
  assert.match(ls.stdout, /a\.txt/);

  const ps = await tools.execute('Bash', { command: 'Get-ChildItem -Path src/components/ -Name' });
  assert.equal(ps.success, true);
  assert.match(ps.stdout, /a\.txt/);
});

test('Windows Bash accepts explicit cmd and PowerShell shells', async (t) => {
  if (process.platform !== 'win32') {
    t.skip('Windows-only shell behavior');
    return;
  }

  const root = await mkdtemp(path.join(tmpdir(), 'winter-shells-'));
  const tools = new ToolExecutor({ projectPath: root });

  const cmd = await tools.execute('Bash', {
    shell: 'cmd',
    command: 'echo hello>cmd.txt && type cmd.txt',
  });
  assert.equal(cmd.success, true);
  assert.match(cmd.stdout, /hello/);

  const ps = await tools.execute('Bash', {
    shell: 'powershell',
    command: "Set-Content -LiteralPath ps.txt -Value 'world'; Get-Content -LiteralPath ps.txt",
  });
  assert.equal(ps.success, true);
  assert.match(ps.stdout, /world/);
});

test('Windows Bash auto-detects cmd chaining syntax', async (t) => {
  if (process.platform !== 'win32') {
    t.skip('Windows-only shell behavior');
    return;
  }

  const root = await mkdtemp(path.join(tmpdir(), 'winter-cmd-auto-'));
  const tools = new ToolExecutor({ projectPath: root });
  const result = await tools.execute('Bash', {
    command: 'echo auto>auto.txt && type auto.txt',
  });

  assert.equal(result.success, true);
  assert.match(result.stdout, /auto/);
});

test('Read lists directories instead of failing on directory paths', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'winter-tools-'));
  await mkdir(path.join(root, 'sub'));
  await writeFile(path.join(root, 'a.txt'), 'hello');

  const tools = new ToolExecutor({ projectPath: root });
  const result = await tools.execute('Read', { file_path: root });

  assert.equal(result.success, true);
  assert.equal(result.isDirectory, true);
  assert.match(result.content, /\[file\] a\.txt/);
  assert.match(result.content, /\[dir\]\s+sub/);
});
