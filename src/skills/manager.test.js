import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';

import { SkillManager } from './manager.js';

test('SkillManager reads packaged skills from the npm package root', async () => {
  const manager = new SkillManager({ addToMemory() {} });
  const packaged = await manager.getPackagedSkills();

  assert(packaged.some(skill => skill.name === 'coding'));
  assert(packaged.some(skill => skill.name === 'debug'));
  assert(packaged.some(skill => skill.name === 'test'));
});

test('SkillManager merges packaged and user skills without duplicating builtin names', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'winter-skills-'));
  const manager = new SkillManager({ addToMemory() {} });
  manager.skillsDir = root;

  await writeFile(path.join(root, 'custom.md'), '# Custom Skill\n\n## Prompts\n\n- Do custom work\n');

  const skills = await manager.listSkills();
  const names = skills.map(skill => skill.name);

  assert.equal(names.filter(name => name === 'coding').length, 1);
  assert(names.includes('custom'));
});
