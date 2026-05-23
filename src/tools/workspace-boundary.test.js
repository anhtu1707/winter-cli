import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ToolExecutor } from './executor.js';

async function createWorkspace() {
  const root = await mkdtemp(path.join(tmpdir(), 'winter-boundary-'));
  const outside = await mkdtemp(path.join(tmpdir(), 'winter-outside-'));
  return { root, outside };
}

function createTools(projectPath, config = {}) {
  return new ToolExecutor({
    projectPath,
    config: {
      load: async () => ({
        sandbox: {
          enabled: true,
          restrictToWorkspace: true,
          allowedCommands: ['node'],
        },
        ...config,
      }),
    },
  });
}

async function cleanup(...dirs) {
  await Promise.all(dirs.map(dir => rm(dir, { recursive: true, force: true })));
}

test('Write allows paths inside the workspace', async () => {
  const { root, outside } = await createWorkspace();
  try {
    const tools = createTools(root);
    const result = await tools.execute('Write', {
      file_path: 'src/inside.txt',
      content: 'ok',
    });

    assert.equal(result.success, true);
    assert.equal(path.resolve(result.path), path.join(root, 'src', 'inside.txt'));
  } finally {
    await cleanup(root, outside);
  }
});

test('Write blocks paths outside the workspace', async () => {
  const { root, outside } = await createWorkspace();
  try {
    const tools = createTools(root);
    const result = await tools.execute('Write', {
      file_path: path.join(outside, 'blocked.txt'),
      content: 'nope',
    });

    assert.equal(result.success, false);
    assert.match(result.error, /Write path is outside the workspace/);
  } finally {
    await cleanup(root, outside);
  }
});

test('Edit blocks paths outside the workspace', async () => {
  const { root, outside } = await createWorkspace();
  try {
    const outsideFile = path.join(outside, 'blocked.txt');
    await writeFile(outsideFile, 'before', 'utf8');

    const tools = createTools(root);
    const result = await tools.execute('Edit', {
      file_path: outsideFile,
      old_string: 'before',
      new_string: 'after',
    });

    assert.equal(result.success, false);
    assert.match(result.error, /Edit path is outside the workspace/);
  } finally {
    await cleanup(root, outside);
  }
});

test('Bash allows cwd inside the workspace', async () => {
  const { root, outside } = await createWorkspace();
  try {
    const tools = createTools(root);
    const result = await tools.execute('Bash', {
      command: 'node --version',
      cwd: root,
    });

    assert.equal(result.success, true);
    assert.match(result.stdout, /^v\d+/);
  } finally {
    await cleanup(root, outside);
  }
});

test('Bash blocks cwd outside the workspace', async () => {
  const { root, outside } = await createWorkspace();
  try {
    const tools = createTools(root);
    const result = await tools.execute('Bash', {
      command: 'node --version',
      cwd: outside,
    });

    assert.equal(result.success, false);
    assert.match(result.error, /working directory is outside the workspace|Bash cwd is outside the workspace/);
  } finally {
    await cleanup(root, outside);
  }
});

test('sandbox.restrictToWorkspace=false allows outside paths', async () => {
  const { root, outside } = await createWorkspace();
  try {
    const tools = createTools(root, {
      sandbox: {
        enabled: true,
        restrictToWorkspace: false,
        allowedCommands: ['node'],
      },
    });
    const result = await tools.execute('Write', {
      file_path: path.join(outside, 'allowed.txt'),
      content: 'ok',
    });

    assert.equal(result.success, true);
  } finally {
    await cleanup(root, outside);
  }
});
