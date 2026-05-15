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

test('Edit accepts common model argument aliases', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'winter-edit-alias-'));
  await writeFile(path.join(root, 'file.txt'), 'hello world\n');

  const tools = new ToolExecutor({ projectPath: root });
  const result = await tools.execute('Edit', {
    path: 'file.txt',
    find: 'hello',
    replacement: 'hi',
  });

  assert.equal(result.success, true);
  const read = await tools.execute('Read', { path: 'file.txt' });
  assert.equal(read.content, 'hi world\n');
});

test('Edit accepts nested and batch edit arguments', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'winter-edit-batch-'));
  await writeFile(path.join(root, 'file.txt'), 'alpha beta gamma\n');

  const tools = new ToolExecutor({ projectPath: root });
  const result = await tools.execute('replace_in_file', {
    arguments: {
      file_path: 'file.txt',
      edits: [
        { old_str: 'alpha', new_str: 'one' },
        { text_to_replace: 'gamma', replace_with: 'three' },
      ],
    },
  });

  assert.equal(result.success, true);
  assert.equal(result.replacements, 2);
  const read = await tools.execute('Read', { path: 'file.txt' });
  assert.equal(read.content, 'one beta three\n');
});

test('Edit missing strings returns recovery guidance', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'winter-edit-recovery-'));
  await writeFile(path.join(root, 'file.txt'), 'hello\n');

  const tools = new ToolExecutor({ projectPath: root });
  const result = await tools.execute('Edit', { path: 'file.txt' });

  assert.equal(result.success, false);
  assert.match(result.error, /Accepted aliases/);
  assert.match(result.error, /Write instead of Edit/);
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

test('LSP reports the requested operation and file path', async () => {
  const tools = new ToolExecutor({ projectPath: process.cwd() });
  const result = await tools.execute('LSP', {
    operation: 'goto_definition',
    file_path: 'src/cli/repl.js',
    line: 1,
    character: 1,
  });

  assert.equal(result.success, true);
  assert.equal(result.operation, 'goto_definition');
  assert.match(result.filePath, /src[\\/]cli[\\/]repl\.js$/);
});

test('Task tools create, update, and list session plans', async () => {
  const plans = [];
  const repl = {
    projectPath: process.cwd(),
    session: {
      createPlan: async (title, description) => {
        const plan = { id: `plan-${plans.length + 1}`, title, description, status: 'pending' };
        plans.push(plan);
        return plan;
      },
      updatePlan: async (id, updates) => {
        const plan = plans.find(item => item.id === id);
        if (!plan) return null;
        Object.assign(plan, updates);
        return plan;
      },
      getPlans: () => plans,
    },
  };
  const tools = new ToolExecutor(repl);

  const created = await tools.execute('TaskCreate', { title: 'Bootstrap Winter', description: 'Verify task tools' });
  assert.equal(created.success, true);
  assert.equal(created.task.title, 'Bootstrap Winter');

  const updated = await tools.execute('TaskUpdate', { task_id: created.task.id, status: 'completed' });
  assert.equal(updated.success, true);
  assert.equal(updated.task.status, 'completed');

  const listed = await tools.execute('TaskList', {});
  assert.equal(listed.success, true);
  assert.equal(listed.tasks.length, 1);
});

test('WebFetch strips markup and returns page text', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    async text() {
      return '<html><head><style>body{color:red}</style></head><body><h1>Hello</h1><script>console.log(1)</script><p>World</p></body></html>';
    },
  });

  try {
    const tools = new ToolExecutor({ projectPath: process.cwd() });
    const result = await tools.execute('WebFetch', { url: 'https://example.test', prompt: 'summarize' });

    assert.equal(result.success, true);
    assert.equal(result.url, 'https://example.test');
    assert.match(result.content, /Hello/);
    assert.match(result.content, /World/);
    assert(!result.content.includes('<script>'));
    assert(!result.content.includes('<style>'));
    assert.equal(result.length, result.content.length);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('WebSearch returns parsed search results', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    async text() {
      return '<a rel="nofollow" class="result__a" href="/l/?uddg=https%3A%2F%2Fexample.com">Example Title</a>';
    },
  });

  try {
    const tools = new ToolExecutor({ projectPath: process.cwd() });
    const result = await tools.execute('WebSearch', { query: 'winter cli' });

    assert.equal(result.success, true);
    assert.equal(result.count, 1);
    assert.equal(result.results[0].title, 'Example Title');
    assert.equal(result.results[0].url, 'https://example.com');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('BrowserDebug can inspect a simple data URL', async (t) => {
  const tools = new ToolExecutor({ projectPath: process.cwd() });
  const result = await tools.execute('BrowserDebug', {
    url: 'data:text/html,<html><body><h1 id="title">Winter</h1><script>console.error("boom")</script></body></html>',
    action: 'document.querySelector("#title").textContent',
  });

  if (result.success === false) {
    t.skip(`BrowserDebug unavailable in this environment: ${result.error}`);
    return;
  }

  assert.equal(result.success, true);
  assert.equal(result.actionResult, 'Winter');
  assert.match(result.domSnippet, /Winter/);
});
