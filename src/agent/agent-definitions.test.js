import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { AgentDefinitionRegistry, normalizeAgentDefinition } from './agent-definitions.js';

test('normalizeAgentDefinition accepts Codebuff-style toolNames and instructionsPrompt', () => {
  const agent = normalizeAgentDefinition({
    id: 'git-committer',
    displayName: 'Git Committer',
    toolNames: ['Read', 'Bash'],
    instructionsPrompt: 'Create meaningful commits.',
  }, '.winter/agents/git-committer.js');

  assert.equal(agent.id, 'git-committer');
  assert.equal(agent.displayName, 'Git Committer');
  assert.deepEqual(agent.tools, ['Read', 'Bash']);
  assert.match(agent.instructionsPrompt, /meaningful commits/);
  assert.equal(agent.source, '.winter/agents/git-committer.js');
});

test('AgentDefinitionRegistry loads builtin and project JSON agents', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'winter-agents-'));
  await mkdir(path.join(root, '.winter', 'agents'), { recursive: true });
  await writeFile(path.join(root, '.winter', 'agents', 'ui-debugger.json'), JSON.stringify({
    id: 'ui-debugger',
    displayName: 'UI Debugger',
    tools: ['Read', 'BrowserDebug'],
    instructions: 'Debug visible UI issues from screenshots and browser evidence.',
  }));

  const registry = new AgentDefinitionRegistry({ projectPath: root });
  const agents = await registry.list();
  const custom = await registry.get('ui-debugger');

  assert(agents.some(agent => agent.id === 'debug'));
  assert.equal(custom.id, 'ui-debugger');
  assert.deepEqual(custom.tools, ['Read', 'BrowserDebug']);
  assert.match(custom.instructionsPrompt, /visible UI/);
});
