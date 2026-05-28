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

test('browser launch requests use OpenBrowser instead of shell launch commands', async () => {
  const tools = new ToolExecutor({ projectPath: process.cwd() });

  const blocked = await tools.execute('Bash', { command: 'Start-Process chrome' });
  assert.equal(blocked.success, false);
  assert.match(blocked.error, /OpenBrowser/);
  assert.match(blocked.recovery, /"browser":"chrome"/);

  const launch = tools.buildBrowserLaunchCommand('about:blank', 'chrome', 'win32');
  assert.deepEqual(launch, {
    command: 'cmd',
    args: ['/c', 'start', '', 'chrome', 'about:blank'],
  });

  const definition = tools.getToolDefinitions().find(tool => tool.name === 'OpenBrowser');
  assert.ok(definition);
  assert.match(definition.description, /mở chrome/);
});

test('VisibleBrowser is exposed for real visible browser control', async () => {
  const tools = new ToolExecutor({ projectPath: process.cwd() });

  const definition = tools.getToolDefinitions().find(tool => tool.name === 'VisibleBrowser');
  assert.ok(definition);
  assert.match(definition.description, /real visible/);
  assert.equal(tools.normalizeToolName('browser_control'), 'VisibleBrowser');
  assert.equal(tools.normalizeToolName('chromecontrol'), 'VisibleBrowser');
  assert.deepEqual(tools.normalizeToolInput('VisibleBrowser', 'https://example.com'), { url: 'https://example.com' });

  const preflight = await tools.preflightValidateToolArgs('VisibleBrowser', {
    href: 'https://example.com',
    action: 'click',
    selector: 'button',
  }, { cwd: process.cwd() });

  assert.equal(preflight.success, true);
  assert.equal(preflight.args.url, 'https://example.com');
  assert.equal(preflight.args.action, 'click');
  assert.equal(preflight.args.selector, 'button');
});

test('Bash rejects npm run scripts that are not defined in package.json', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'winter-missing-script-'));
  await writeFile(path.join(root, 'package.json'), JSON.stringify({
    scripts: {
      test: 'node --test',
      lint: 'eslint .',
    },
  }));
  const tools = new ToolExecutor({ projectPath: root });

  const result = await tools.execute('Bash', { command: 'npm run review' }, { cwd: root });

  assert.equal(result.success, false);
  assert.match(result.error, /review/);
  assert.match(result.recovery, /npm run test/);
  assert.match(result.recovery, /npm run lint/);
});

test('Read validates missing file path before execution', async () => {
  const tools = new ToolExecutor({ projectPath: process.cwd() });
  const result = await tools.execute('Read', {});

  assert.equal(result.success, false);
  assert.match(result.error, /Missing required argument/);
  assert.match(result.recovery, /Read/);
});

test('Read missing file returns recovery guidance and nearby candidates', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'winter-read-missing-'));
  await mkdir(path.join(root, 'src', 'app', 'api', 'users'), { recursive: true });
  await writeFile(path.join(root, 'src', 'app', 'api', 'users', 'route.ts'), 'export const GET = true;\n');
  const tools = new ToolExecutor({ projectPath: root });

  const result = await tools.execute('Read', { file_path: 'src/app/api/route.ts' }, { cwd: root });

  assert.equal(result.success, false);
  assert.equal(result.code, 'ENOENT');
  assert.match(result.error, /File not found/);
  assert.match(result.recovery, /Do not retry the same missing path/);
  assert.match(result.recovery, /Glob or Grep/);
  assert(result.suggestions.some(item => item.replace(/\\/g, '/').endsWith('src/app/api/users/route.ts')));
});

test('HtmlEffectiveness validates missing input/output paths', async () => {
  const tools = new ToolExecutor({ projectPath: process.cwd() });
  const result = await tools.execute('HtmlEffectiveness', { input_path: 'a.md' });

  assert.equal(result.success, false);
  assert.match(result.error, /input_path and output_path/);
});

test('strict preflight coerces common alias keys to canonical args', async () => {
  const tools = new ToolExecutor({ projectPath: process.cwd() });

  const seen = [];
  tools.readFile = async (filePath) => {
    seen.push({ tool: 'Read', filePath });
    return { success: true, path: filePath, lines: 1, size: 1, content: 'ok' };
  };
  tools.bash = async (command) => {
    seen.push({ tool: 'Bash', command });
    return { success: true, stdout: 'ok', stderr: '', exitCode: 0 };
  };
  tools.grep = async (pattern, searchPath) => {
    seen.push({ tool: 'Grep', pattern, searchPath });
    return { success: true, pattern, path: searchPath, matches: [], count: 0, output_mode: 'content' };
  };

  await tools.execute('Read', { path: 'README.md' }, { cwd: process.cwd() });
  await tools.execute('Bash', { cmd: 'npm test' });
  await tools.execute('Grep', { query: 'Winter' }, { cwd: process.cwd() });

  assert.equal(seen[0].tool, 'Read');
  assert.match(seen[0].filePath, /README\.md$/);
  assert.deepEqual(seen[1], { tool: 'Bash', command: 'npm test' });
  assert.equal(seen[2].tool, 'Grep');
  assert.equal(seen[2].pattern, 'Winter');
});

test('unknown tools return recovery guidance instead of a bare failure', async () => {
  const tools = new ToolExecutor({ projectPath: process.cwd() });
  const result = await tools.execute('bad_tool_name', {});

  assert.equal(result.success, false);
  assert.equal(result.error, 'Unknown tool: bad_tool_name');
  assert(result.availableTools.includes('Write'));
  assert.match(result.recovery, /Write/);
});

test('agent delegation tools are exposed and preflight aliases normalize goals', async () => {
  const tools = new ToolExecutor({ projectPath: process.cwd() });
  const names = tools.getToolDefinitions().map(tool => tool.name);

  assert.ok(names.includes('Agent'));
  assert.ok(names.includes('DelegateTask'));
  assert.ok(names.includes('ParallelAgent'));
  assert.equal(tools.normalizeToolName('delegate'), 'DelegateTask');
  assert.equal(tools.normalizeToolName('multi_agent'), 'ParallelAgent');
  assert.deepEqual(tools.normalizeToolInput('DelegateTask', 'inspect bug'), { task: 'inspect bug' });

  const delegated = await tools.preflightValidateToolArgs('DelegateTask', { goal: 'inspect bug' }, { cwd: process.cwd() });
  assert.equal(delegated.success, true);
  assert.equal(delegated.args.task, 'inspect bug');

  const parallel = await tools.preflightValidateToolArgs('ParallelAgent', { tasks: [{ goal: 'a' }] }, { cwd: process.cwd() });
  assert.equal(parallel.success, true);
});

test('MCP timeout returns targeted recovery and resets cached client', async () => {
  const config = {
    async load() {
      return {
        mcp: { servers: [{ name: 'chrome-devtools', command: 'node', args: ['server.js'] }] },
        permissions: { allowlist: { mcpServers: ['chrome-devtools'] } },
        reliability: { retryAttempts: 3, retryBaseDelayMs: 0 },
      };
    },
  };
  const tools = new ToolExecutor({ projectPath: process.cwd(), config });
  let calls = 0;
  let closed = false;
  tools.mcpClients.set('chrome-devtools', {
    async callTool() {
      calls += 1;
      const error = new Error('MCP request timed out after 30000ms: tools/call on chrome-devtools');
      error.code = 'MCP_REQUEST_TIMEOUT';
      error.timeoutMs = 30000;
      throw error;
    },
    async close() {
      closed = true;
    },
  });

  const result = await tools.execute('MCP', {
    server: 'chrome-devtools',
    tool: 'take_snapshot',
    arguments: {},
  });

  assert.equal(calls, 1);
  assert.equal(closed, true);
  assert.equal(tools.mcpClients.has('chrome-devtools'), false);
  assert.equal(result.success, false);
  assert.equal(result.code, 'MCP_REQUEST_TIMEOUT');
  assert.equal(result.server, 'chrome-devtools');
  assert.equal(result.tool, 'take_snapshot');
  assert.match(result.recovery, /Do not blindly retry/);
  assert.match(result.recovery, /\/mcp tools chrome-devtools/);
});

test('tool names accept common model aliases', () => {
  const tools = new ToolExecutor({ projectPath: process.cwd() });

  assert.equal(tools.normalizeToolName('read_file'), 'Read');
  assert.equal(tools.normalizeToolName('tool.read_file_content'), 'Read');
  assert.equal(tools.normalizeToolName('write_to_file'), 'Write');
  assert.equal(tools.normalizeToolName('replace_in_file'), 'Edit');
  assert.equal(tools.normalizeToolName('command_executor'), 'Bash');
  assert.equal(tools.normalizeToolName('execute_command'), 'Bash');
  assert.equal(tools.normalizeToolName('run_terminal_cmd'), 'Bash');
  assert.equal(tools.normalizeToolName('list_files'), 'Glob');
  assert.equal(tools.normalizeToolName('search_files'), 'Grep');
  assert.equal(tools.normalizeToolName('grep_search'), 'Grep');
  assert.equal(tools.normalizeToolName('shell'), 'Bash');
  assert.equal(tools.normalizeToolName('web-search'), 'WebSearch');
  assert.equal(tools.normalizeToolName('htmlfx'), 'HtmlEffectiveness');
});

test('tools coerce string inputs into valid arguments', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'winter-string-tool-'));
  await writeFile(path.join(root, 'README.md'), 'Winter CLI\n');
  const tools = new ToolExecutor({ projectPath: root });

  const read = await tools.execute('Read', 'README.md');
  const bash = await tools.execute('Bash', process.platform === 'win32' ? 'echo ok' : 'printf ok');

  assert.equal(read.success, true);
  assert.equal(read.content, 'Winter CLI\n');
  assert.equal(bash.success, true);
  assert.deepEqual(tools.normalizeToolInput('WebSearch', 'winter cli'), { query: 'winter cli' });
  assert.deepEqual(tools.normalizeToolInput('WebFetch', 'https://example.com'), { url: 'https://example.com' });
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

test('Windows Bash runs PowerShell commands and translates ls flags', async () => {
  if (process.platform !== 'win32') {
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

test('Windows Bash accepts explicit cmd and PowerShell shells', async () => {
  if (process.platform !== 'win32') {
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
  assert.equal(cmd.shell, 'cmd');

  const ps = await tools.execute('Bash', {
    shell: 'powershell',
    command: "Set-Content -LiteralPath ps.txt -Value 'world'; Get-Content -LiteralPath ps.txt",
  });
  assert.equal(ps.success, true);
  assert.match(ps.stdout, /world/);
  assert.equal(ps.shell, 'powershell');
});

test('Windows Bash auto-detects cmd chaining syntax', async () => {
  if (process.platform !== 'win32') {
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

test('Windows Bash runs quoted cmd directory listings without breaking path quotes', async () => {
  if (process.platform !== 'win32') {
    return;
  }

  const root = await mkdtemp(path.join(tmpdir(), 'winter-quoted-dir-'));
  await writeFile(path.join(root, 'a.txt'), 'hello');
  const tools = new ToolExecutor({ projectPath: root });
  const result = await tools.execute('Bash', {
    command: `dir /b "${root}"`,
  });

  assert.equal(result.success, true);
  assert.equal(result.shell, 'cmd');
  assert.match(result.stdout, /a\.txt/);
});

test('Windows Bash treats where as an allowlisted cmd command', async () => {
  if (process.platform !== 'win32') {
    return;
  }

  const root = await mkdtemp(path.join(tmpdir(), 'winter-where-'));
  const tools = new ToolExecutor({ projectPath: root });
  const result = await tools.execute('Bash', {
    command: 'where cmd',
  });

  assert.equal(result.success, true);
  assert.equal(result.shell, 'cmd');
  assert.match(result.stdout, /cmd\.exe/i);
});

test('Windows Bash allows PowerShell -Format arguments', async () => {
  if (process.platform !== 'win32') {
    return;
  }

  const root = await mkdtemp(path.join(tmpdir(), 'winter-format-'));
  const tools = new ToolExecutor({ projectPath: root });
  const result = await tools.execute('Bash', {
    shell: 'powershell',
    command: 'Get-Date -Format "yyyy-MM-dd"',
  });

  assert.equal(result.success, true);
  assert.match(result.stdout, /\d{4}-\d{2}-\d{2}/);
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

test('Parallel validates missing tool names before execution', async () => {
  const tools = new ToolExecutor({ projectPath: process.cwd() });
  const result = await tools.execute('Parallel', { tools: [{ input: { file_path: 'README.md' } }] });

  assert.equal(result.success, false);
  assert.match(result.error, /missing name/);
  assert.equal(result.index, 0);
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

test('BrowserDebug can inspect a simple data URL', async () => {
  const tools = new ToolExecutor({ projectPath: process.cwd() });
  const result = await tools.execute('BrowserDebug', {
    url: 'data:text/html,<html><body><h1 id="title">Winter</h1><script>console.error("boom")</script></body></html>',
    action: 'document.querySelector("#title").textContent',
  });

  assert.equal(result.success, true);
  assert.equal(result.actionResult, 'Winter');
  assert.match(result.domSnippet, /Winter/);
});

test('Grep full: basic regex search', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'winter-grep-test-'));
  await mkdir(path.join(dir, 'sub'), { recursive: true });
  await writeFile(path.join(dir, 'test.js'), 'const x = 1;\nconst y = 2;\n// comment\nconst z = 3;\n');
  await writeFile(path.join(dir, 'sub', 'other.js'), 'const a = 10;\nfunction foo() { return a; }\n');

  const tools = new ToolExecutor({ projectPath: dir });
  const result = await tools.execute('Grep', { pattern: 'const', path: dir });
  assert.equal(result.success, true);
  assert.equal(result.count, 4);
  assert.ok(result.matches.some(m => m.includes('test.js:1:')));
});

test('Grep full: case insensitive search', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'winter-grep-ci-'));
  await writeFile(path.join(dir, 'test.txt'), 'Hello\nhello\nHELLO\nWorld\n');

  const tools = new ToolExecutor({ projectPath: dir });
  const result = await tools.execute('Grep', { pattern: 'hello', path: dir, case_insensitive: true });
  assert.equal(result.success, true);
  assert.equal(result.count, 3);
});

test('Grep full: case sensitive by default', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'winter-grep-cs-'));
  await writeFile(path.join(dir, 'test.txt'), 'Hello\nhello\nHELLO\n');

  const tools = new ToolExecutor({ projectPath: dir });
  const result = await tools.execute('Grep', { pattern: 'hello', path: dir });
  assert.equal(result.success, true);
  assert.equal(result.count, 1);
});

test('Grep full: invert match', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'winter-grep-inv-'));
  await writeFile(path.join(dir, 'test.txt'), 'apple\nbanana\ncherry\ndate');

  const tools = new ToolExecutor({ projectPath: dir });
  const result = await tools.execute('Grep', { pattern: 'banana', path: dir, invert_match: true });
  assert.equal(result.success, true);
  assert.equal(result.count, 3);
  assert.ok(result.matches.some(m => m.includes('apple')));
  assert.ok(result.matches.some(m => m.includes('cherry')));
});

test('Grep full: fixed string (no regex)', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'winter-grep-fixed-'));
  await writeFile(path.join(dir, 'test.txt'), 'hello.world\nhello_world\nhelloworld\n');

  const tools = new ToolExecutor({ projectPath: dir });
  // Without fixed: any char matches
  const result = await tools.execute('Grep', { pattern: 'hello.world', path: dir, fixed_string: true });
  assert.equal(result.success, true);
  assert.equal(result.count, 1);
});

test('Grep full: context lines (before+after)', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'winter-grep-ctx-'));
  const lines = [];
  for (let i = 1; i <= 10; i++) lines.push(`line ${i}`);
  await writeFile(path.join(dir, 'test.txt'), lines.join('\n'));
  await writeFile(path.join(dir, 'other.txt'), 'irrelevant\n');

  const tools = new ToolExecutor({ projectPath: dir });
  const result = await tools.execute('Grep', { pattern: 'line 5', path: dir, context_lines: 2 });
  assert.equal(result.success, true);
  assert.equal(result.count, 1);
  // Context lines include lines 3-7 (2 before + 1 match + 2 after)
  const match = String(result.matches[0]);
  assert.ok(match.includes('line 3'), 'Should include context before');
  assert.ok(match.includes('line 5'), 'Should include match');
  assert.ok(match.includes('line 7'), 'Should include context after');
});

test('Grep full: max_results limit', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'winter-grep-max-'));
  await writeFile(path.join(dir, 'test.txt'), Array(100).fill('match line').join('\n'));

  const tools = new ToolExecutor({ projectPath: dir });
  const result = await tools.execute('Grep', { pattern: 'match', path: dir, max_results: 10 });
  assert.equal(result.success, true);
  assert.equal(result.count, 10);
});

test('Grep full: line_numbers toggle off', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'winter-grep-ln-'));
  await writeFile(path.join(dir, 'file.js'), 'const x = 1;\nconst y = 2;\n');

  const tools = new ToolExecutor({ projectPath: dir });
  const result = await tools.execute('Grep', { pattern: 'const', path: dir, line_numbers: false });
  assert.equal(result.success, true);
  // Results should not contain line number format
  assert.ok(!result.matches[0].includes(':1:'), 'Should not include line numbers');
});

test('Grep full: invalid regex returns error', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'winter-grep-inv-regex-'));
  await writeFile(path.join(dir, 'test.txt'), 'some content\n');

  const tools = new ToolExecutor({ projectPath: dir });
  const result = await tools.execute('Grep', { pattern: '[invalid', path: dir });
  assert.equal(result.success, true);
  assert.ok(result.matches.length > 0);
  // Should return an error entry instead of crashing
  assert.ok(result.matches.some(m => m.error && m.error.includes('Invalid regex')));
});

test('Grep full: output_mode files_with_matches', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'winter-grep-fwm-'));
  await writeFile(path.join(dir, 'a.js'), 'const x = 1;\n');
  await writeFile(path.join(dir, 'b.txt'), 'no match here\n');

  const tools = new ToolExecutor({ projectPath: dir });
  const result = await tools.execute('Grep', { pattern: 'const', path: dir, output_mode: 'files_with_matches' });
  assert.equal(result.success, true);
  assert.equal(result.count, 1);
  assert.ok(String(result.matches[0]).includes('a.js'));
});

test('Grep full: output_mode count', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'winter-grep-cnt-'));
  await writeFile(path.join(dir, 'data.txt'), Array(5).fill('match line').join('\n'));

  const tools = new ToolExecutor({ projectPath: dir });
  const result = await tools.execute('Grep', { pattern: 'match', path: dir, output_mode: 'count' });
  assert.equal(result.success, true);
  assert.equal(result.count, 5);
  assert.equal(result.matches.length, 0);
});

test('Grep full: normalizeToolName for advanced aliases', async (t) => {
  const tools = new ToolExecutor({ projectPath: process.cwd() });
  assert.equal(tools.normalizeToolName('rgfull'), 'Grep');
  assert.equal(tools.normalizeToolName('searchadvanced'), 'Grep');
  assert.equal(tools.normalizeToolName('advancedsearch'), 'Grep');
  assert.equal(tools.normalizeToolName('grepadvanced'), 'Grep');
  assert.equal(tools.normalizeToolName('grepfull'), 'Grep');
  assert.equal(tools.normalizeToolName('findinfile'), 'Grep');
});
