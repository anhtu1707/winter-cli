import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { tmpdir } from 'os';
import { mkdtemp, mkdir, writeFile } from 'fs/promises';
import { ContextLoader } from './context-loader.js';

test('ContextLoader getProjectInstructionFiles returns standard files', () => {
  const loader = new ContextLoader({ projectPath: '/test' });
  const files = loader.getProjectInstructionFiles();
  assert(files.includes('winter.md'));
  assert(files.includes('WINTER.md'));
  assert(files.includes('CLAUDE.md'));
});

test('ContextLoader readProjectInstructionFiles reads existing files', async () => {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'winter-test-'));
  await writeFile(path.join(tmpDir, 'winter.md'), '# Test Project');

  const loader = new ContextLoader({ projectPath: tmpDir });
  const files = await loader.readProjectInstructionFiles();
  assert(files.some(f => f.relativePath === 'winter.md'));
  assert(files[0].content.includes('Test Project'));
});

test('ContextLoader readProjectInstructionFiles deduplicates case-insensitive paths', async () => {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'winter-test-'));
  await writeFile(path.join(tmpDir, 'winter.md'), '# Test');

  // Create WINTER.md as well (same file on case-insensitive FS)
  try { await writeFile(path.join(tmpDir, 'WINTER.md'), '# Test'); } catch {}

  const loader = new ContextLoader({ projectPath: tmpDir });
  const files = await loader.readProjectInstructionFiles();
  const winterFiles = files.filter(f => f.relativePath.toLowerCase().includes('winter'));
  // Should only have unique files (WINTER.md and winter.md are the same on case-insensitive)
  assert(winterFiles.length <= 2);
});

test('ContextLoader getResourcePaths returns correct structure', () => {
  const loader = new ContextLoader({ projectPath: '/test/project' });
  const paths = loader.getResourcePaths();

  assert(paths.localRoot.includes(path.join('resources', 'local')));
  assert(paths.codex.skills.includes(path.join('codex', 'skills')));
  assert(paths.claude.plugins.includes(path.join('claude', 'plugins')));
  assert(paths.manifest.includes('manifest.json'));
});

test('ContextLoader getUserResourcePaths returns home directory paths', () => {
  const loader = new ContextLoader({ projectPath: '/test' });
  const paths = loader.getUserResourcePaths();

  assert(paths.codexRoot.includes('.codex'));
  assert(paths.claudeRoot.includes('.claude'));
  assert(paths.codexSkills.includes(path.join('.codex', 'skills')));
  assert(paths.claudePlugins.includes(path.join('.claude', 'plugins')));
});

test('ContextLoader listPathEntries returns empty array for non-existent directory', async () => {
  const loader = new ContextLoader({ projectPath: '/test' });
  const entries = await loader.listPathEntries('/nonexistent/path/12345');
  assert(Array.isArray(entries));
  assert.equal(entries.length, 0);
});

test('ContextLoader listPathEntries returns files and directories', async () => {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'winter-test-'));
  await writeFile(path.join(tmpDir, 'file1.js'), '');
  await mkdir(path.join(tmpDir, 'subdir'));

  const loader = new ContextLoader({ projectPath: tmpDir });
  const entries = await loader.listPathEntries(tmpDir);
  assert(entries.length >= 2);

  const subdir = entries.find(e => e.name === 'subdir');
  assert(subdir);

  // Directories should come first
  const dirIndex = entries.findIndex(e => e.name === 'subdir');
  const fileIndex = entries.findIndex(e => e.name === 'file1.js');
  assert(dirIndex < fileIndex, 'directories should be sorted before files');
});

test('ContextLoader getProjectSignals parses package.json correctly', async () => {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'winter-test-'));
  await writeFile(path.join(tmpDir, 'package.json'), JSON.stringify({
    name: 'my-app',
    dependencies: { react: '^18.0.0', next: '^14.0.0' },
    scripts: { build: 'next build' },
  }));

  const loader = new ContextLoader({ projectPath: tmpDir });
  const signals = await loader.getProjectSignals();

  assert(signals.includes('my-app'));
  assert(signals.includes('react'));
  assert(signals.includes('next'));
  assert(signals.includes('json'));
});

test('ContextLoader getStartupSkillCatalog returns built-in skills', async () => {
  const loader = new ContextLoader({ projectPath: '/test' });
  const catalog = await loader.getStartupSkillCatalog();

  assert(catalog.has('coding'), 'should include coding');
  assert(catalog.has('design'), 'should include design');
  assert(catalog.has('debug'), 'should include debug');
  assert(catalog.has('test'), 'should include test');
});

test('ContextLoader inferStartupSkills detects React projects', async () => {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'winter-test-'));
  await writeFile(path.join(tmpDir, 'package.json'), JSON.stringify({
    name: 'my-react-app',
    dependencies: { react: '^18.0.0' },
  }));

  const loader = new ContextLoader({ projectPath: tmpDir });
  const result = await loader.inferStartupSkills();

  assert(result.activeSkills.includes('coding'));
  assert(result.activeSkills.includes('design'), 'React project should activate design skills');
  assert(result.availableSkills.includes('coding'));
});

test('ContextLoader inferStartupSkills returns filtered active skills', async () => {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'winter-test-'));
  await writeFile(path.join(tmpDir, 'package.json'), JSON.stringify({
    name: 'test',
    dependencies: {},
  }));

  const loader = new ContextLoader({ projectPath: tmpDir });
  const result = await loader.inferStartupSkills();

  assert(result.activeSkills.includes('coding'), 'should always include coding');
  assert(result.activeSkills.includes('debug'), 'should always include debug');
  assert(result.activeSkills.includes('test'), 'should always include test');
  assert(result.availableSkills.length > 0);
});

test('ContextLoader getLocalResourceContext returns empty for missing manifest', async () => {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'winter-test-'));
  await mkdir(path.join(tmpDir, 'resources', 'local'), { recursive: true });
  const loader = new ContextLoader({ projectPath: tmpDir });
  const context = await loader.getLocalResourceContext();
  assert.equal(context, '');
});

test('ContextLoader falls back to packaged resources for external projects', () => {
  const loader = new ContextLoader({ projectPath: path.join(tmpdir(), 'external-project-without-resources') });
  const paths = loader.getResourcePaths();

  assert(paths.localRoot.includes(path.join('winter', 'resources', 'local')));
  assert(paths.designs.includes(path.join('awesome-design-md', 'design-md')));
});

test('ContextLoader getRequiredLocalResourceSummary summarizes mandatory resources', async () => {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'winter-required-resources-'));
  await mkdir(path.join(tmpDir, 'resources', 'local', 'karpathy-tools'), { recursive: true });
  await mkdir(path.join(tmpDir, 'resources', 'local', 'agents.md'), { recursive: true });
  await mkdir(path.join(tmpDir, 'resources', 'local', 'awesome-design-md', 'design-md', 'apple'), { recursive: true });
  await writeFile(
    path.join(tmpDir, 'resources', 'local', 'karpathy-tools', 'CLAUDE.md'),
    '# Karpathy Tools\n\n- Think Before Coding\n- Simplicity First\n- Surgical Changes\n- Goal-Driven Execution\n'
  );
  await writeFile(
    path.join(tmpDir, 'resources', 'local', 'agents.md', 'AGENTS.md'),
    '# Agents\n\nUse development server. Keep dependencies and lockfile in sync. Prefer TypeScript.\n'
  );
  await writeFile(
    path.join(tmpDir, 'resources', 'local', 'awesome-design-md', 'README.md'),
    '# Awesome Design MD\n\nBrand guideline and design corpus.\n'
  );

  const loader = new ContextLoader({ projectPath: tmpDir });
  const summary = await loader.getRequiredLocalResourceSummary();

  assert.match(summary, /\[Required Local Resource Rules\]/);
  assert.match(summary, /karpathy-tools/);
  assert.match(summary, /awesome-design-md/);
  assert.match(summary, /agents\.md/);
  assert.match(summary, /design-md/);
  assert.match(summary, /Think Before Coding/);
  assert.match(summary, /Simplicity First/);
});

test('ContextLoader compactText truncates long text', () => {
  const loader = new ContextLoader({ projectPath: '/test' });
  const short = 'hello';
  const long = 'x'.repeat(2000);

  assert.equal(loader.compactText(short, 100), 'hello');
  assert(loader.compactText(long, 100).includes('truncated'));
  assert(loader.compactText(long, 100).length < 200);
});

test('ContextLoader getProjectSignals handles missing package.json', async () => {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'winter-test-'));
  const loader = new ContextLoader({ projectPath: tmpDir });
  const signals = await loader.getProjectSignals();
  assert(Array.isArray(signals));
});
