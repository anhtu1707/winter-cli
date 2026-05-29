import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { DesignCommands } from './commands.js';

function captureConsole() {
  const original = console.log;
  const lines = [];
  console.log = (...args) => {
    lines.push(args.join(' '));
  };
  return {
    lines,
    restore() {
      console.log = original;
    },
  };
}

test('DesignCommands searches and previews local design brands', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'winter-design-'));
  const brandsDir = path.join(root, 'brands');
  await mkdir(path.join(brandsDir, 'Acme'), { recursive: true });
  await writeFile(path.join(brandsDir, 'Acme', 'DESIGN.md'), '# Acme\n\nUse crisp spacing.');
  const memories = [];
  const capture = captureConsole();
  const commands = new DesignCommands({
    session: { addToMemory: async (text, type) => memories.push({ text, type }) },
    config: {},
    chat: async () => {},
  });
  commands.brandsDir = brandsDir;

  try {
    await commands.search('ac');
    await commands.previewBrand('Acme');
  } finally {
    capture.restore();
  }

  assert(capture.lines.join('\n').includes('Acme'));
  assert.deepEqual(memories, [{ text: 'Searched design brands for: ac', type: 'search' }]);
});

test('DesignCommands treats /design <brand> as apply and unknown text as search', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'winter-design-direct-'));
  const brandsDir = path.join(root, 'brands');
  await mkdir(path.join(brandsDir, 'Figma'), { recursive: true });
  await mkdir(path.join(brandsDir, 'Linear'), { recursive: true });
  await writeFile(path.join(brandsDir, 'Figma', 'DESIGN.md'), '# Figma\n\nDesign system.');
  await writeFile(path.join(brandsDir, 'Linear', 'DESIGN.md'), '# Linear\n\nDesign system.');
  const chats = [];
  const memories = [];
  const capture = captureConsole();
  const commands = new DesignCommands({
    projectPath: root,
    session: { addToMemory: async (text, type) => memories.push({ text, type }) },
    config: {},
    chat: async value => chats.push(value),
  });
  commands.brandsDir = brandsDir;

  try {
    await commands.execute('Figma', []);
    await commands.execute('lin', []);
  } finally {
    capture.restore();
  }

  assert.equal(chats.length, 1);
  assert.match(chats[0], /Figma/);
  assert.match(chats[0], /real tool calls/);
  assert(capture.lines.join('\n').includes('Linear'));
  assert.deepEqual(memories, [{ text: 'Searched design brands for: lin', type: 'search' }]);
});

test('DesignCommands addBrand writes DESIGN.md into repl projectPath', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'winter-design-add-project-'));
  const project = path.join(root, 'project');
  const other = path.join(root, 'other');
  const brandsDir = path.join(root, 'brands');
  await mkdir(path.join(brandsDir, 'Nova'), { recursive: true });
  await mkdir(project, { recursive: true });
  await mkdir(other, { recursive: true });
  await writeFile(path.join(brandsDir, 'Nova', 'DESIGN.md'), '# Nova\n\nDesign rules.');
  const oldCwd = process.cwd();
  const capture = captureConsole();
  const commands = new DesignCommands({
    projectPath: project,
    session: { addToMemory: async () => {} },
    config: {},
    chat: async () => {},
  });
  commands.brandsDir = brandsDir;

  try {
    process.chdir(other);
    await commands.addBrand('Nova');
  } finally {
    process.chdir(oldCwd);
    capture.restore();
  }

  assert.equal(await readFile(path.join(project, 'DESIGN.md'), 'utf8'), '# Nova\n\nDesign rules.');
});

test('DesignCommands addBrand writes DESIGN.md into current project', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'winter-design-add-'));
  const project = path.join(root, 'project');
  const brandsDir = path.join(root, 'brands');
  await mkdir(path.join(brandsDir, 'Nova'), { recursive: true });
  await mkdir(project, { recursive: true });
  await writeFile(path.join(brandsDir, 'Nova', 'DESIGN.md'), '# Nova\n\nDesign rules.');
  const oldCwd = process.cwd();
  const capture = captureConsole();
  const commands = new DesignCommands({
    session: { addToMemory: async () => {} },
    config: {},
    chat: async () => {},
  });
  commands.brandsDir = brandsDir;

  try {
    process.chdir(project);
    await commands.addBrand('Nova');
  } finally {
    process.chdir(oldCwd);
    capture.restore();
  }

  assert.equal(await readFile(path.join(project, 'DESIGN.md'), 'utf8'), '# Nova\n\nDesign rules.');
  assert(capture.lines.join('\n').includes('Nova'));
});

test('DesignCommands applyBrand sends design-system prompt to chat', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'winter-design-apply-'));
  const brandsDir = path.join(root, 'brands');
  await mkdir(path.join(brandsDir, 'Orbit'), { recursive: true });
  await writeFile(path.join(brandsDir, 'Orbit', 'DESIGN.md'), '# Orbit\n\nMotion and layout.');
  let prompt = '';
  const commands = new DesignCommands({
    session: { addToMemory: async () => {} },
    config: {},
    chat: async value => {
      prompt = value;
    },
  });
  commands.brandsDir = brandsDir;
  const capture = captureConsole();

  try {
    await commands.applyBrand('Orbit');
  } finally {
    capture.restore();
  }

  assert.match(prompt, /Senior UI\/UX Engineer/);
  assert.match(prompt, /Orbit/);
  assert.match(prompt, /Motion and layout/);
});
