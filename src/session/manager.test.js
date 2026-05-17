import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { SessionManager } from './manager.js';

function createConfigStub() {
  const state = {};
  return {
    state,
    async load() {
      return state;
    },
    async save(config) {
      Object.assign(state, config);
    },
    async setProjectCurrent(projectPath) {
      state.project = state.project || {};
      state.project.current = projectPath;
      state.project.lastOpenedAt = 'now';
    },
  };
}

test('new sessions remember the current project path in config', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'winter-session-project-'));
  const config = createConfigStub();
  const session = new SessionManager(config);
  session.winterDir = path.join(root, '.winter');
  session.sessionsDir = path.join(session.winterDir, 'sessions');

  const projectPath = path.join(root, 'demo-project');
  const created = await session.init({ project: projectPath });

  assert.equal(created, undefined);
  assert.equal(session.currentSession.project, projectPath);
  assert.equal(config.state.project.current, projectPath);
});

test('switchSession updates the remembered project anchor', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'winter-session-switch-'));
  const config = createConfigStub();
  const session = new SessionManager(config);
  session.winterDir = path.join(root, '.winter');
  session.sessionsDir = path.join(session.winterDir, 'sessions');

  const firstProject = path.join(root, 'project-a');
  const secondProject = path.join(root, 'project-b');

  await session.init({ project: firstProject });
  const firstSessionId = session.getSessionId();

  const secondSessionPath = path.join(session.sessionsDir, 'active', 'session-b.json');
  await writeFile(secondSessionPath, JSON.stringify({
    id: 'session-b',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    project: secondProject,
    context: {},
    plans: [],
    memory: [],
    history: [],
  }, null, 2));

  await session.switchSession('session-b');

  assert.notEqual(firstSessionId, 'session-b');
  assert.equal(session.getSessionId(), 'session-b');
  assert.equal(config.state.project.current, secondProject);
});

test('init resumes latest session for the same project so memories persist', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'winter-session-resume-'));
  const config = createConfigStub();
  const projectPath = path.join(root, 'project');

  const first = new SessionManager(config);
  first.winterDir = path.join(root, '.winter');
  first.sessionsDir = path.join(first.winterDir, 'sessions');
  await first.init({ project: projectPath });
  await first.addToMemory('persistent project memory');
  const firstSessionId = first.getSessionId();

  const second = new SessionManager(config);
  second.winterDir = first.winterDir;
  second.sessionsDir = first.sessionsDir;
  await second.init({ project: projectPath });

  assert.equal(second.getSessionId(), firstSessionId);
  assert.equal(second.getMemory().length, 1);
  assert.equal(second.getMemory()[0].text, 'persistent project memory');
});

test('init does not resume a session from a different project', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'winter-session-project-scope-'));
  const config = createConfigStub();
  const firstProject = path.join(root, 'project-a');
  const secondProject = path.join(root, 'project-b');

  const first = new SessionManager(config);
  first.winterDir = path.join(root, '.winter');
  first.sessionsDir = path.join(first.winterDir, 'sessions');
  await first.init({ project: firstProject });
  await first.addToMemory('project a memory');

  const second = new SessionManager(config);
  second.winterDir = first.winterDir;
  second.sessionsDir = first.sessionsDir;
  await second.init({ project: secondProject });

  assert.notEqual(second.getSessionId(), first.getSessionId());
  assert.equal(second.currentSession.project, secondProject);
  assert.deepEqual(second.getMemory(), []);
});

test('clearMemory removes stored memories and persists the change', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'winter-session-memory-'));
  const config = createConfigStub();
  const session = new SessionManager(config);
  session.winterDir = path.join(root, '.winter');
  session.sessionsDir = path.join(session.winterDir, 'sessions');

  await session.init({ project: path.join(root, 'project') });
  await session.addToMemory('keep this note');
  await session.addToMemory('remove this note');

  const removed = await session.clearMemory('remove this note');

  assert.equal(removed, 1);
  assert.equal(session.getMemory().length, 1);
  assert.equal(session.getMemory()[0].text, 'keep this note');

  const sessionPath = path.join(session.sessionsDir, 'active', `${session.getSessionId()}.json`);
  const saved = JSON.parse(await readFile(sessionPath, 'utf8'));
  assert.equal(saved.memory.length, 1);
  assert.equal(saved.memory[0].text, 'keep this note');
});
