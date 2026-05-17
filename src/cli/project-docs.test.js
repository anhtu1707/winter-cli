import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  buildProjectDocs,
  isWinterGeneratedProjectDoc,
} from './project-docs.js';

function createContextLoader(skills = ['coding', 'debug', '.system', 'design']) {
  return {
    async getStartupSkillCatalog() {
      return new Set(skills);
    },
  };
}

test('buildProjectDocs generates useful design, skill, and rule guidance', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'winter-project-docs-'));
  const localRoot = path.join(root, 'resources', 'local');
  const designs = path.join(localRoot, 'awesome-design-md', 'design-md');
  const karpathy = path.join(localRoot, 'karpathy-tools');
  const agents = path.join(localRoot, 'agents.md');
  const codexRules = path.join(localRoot, 'codex', 'rules');

  await mkdir(path.join(designs, 'apple'), { recursive: true });
  await mkdir(path.join(designs, 'linear.app'), { recursive: true });
  await mkdir(karpathy, { recursive: true });
  await mkdir(agents, { recursive: true });
  await mkdir(codexRules, { recursive: true });
  await writeFile(path.join(codexRules, 'repo.md'), '# repo rule');
  await writeFile(path.join(localRoot, 'manifest.json'), JSON.stringify({
    root: 'resources/local',
    localResources: [
      { name: 'awesome-design-md', files: 142, bytes: 1912402 },
      { name: 'agents.md', files: 90, bytes: 2546038 },
    ],
  }));

  const docs = await buildProjectDocs({
    projectPath: root,
    resourcePaths: {
      localRoot,
      designs,
      karpathy,
      agents,
      manifest: path.join(localRoot, 'manifest.json'),
      codex: { rules: codexRules },
    },
    userResourcePaths: {},
    contextLoader: createContextLoader(),
    readProjectInstructionFiles: async () => [
      { relativePath: 'design.md' },
      { relativePath: 'rule.md' },
    ],
  });

  const design = docs.find(doc => doc.filename === 'design.md').content;
  const skill = docs.find(doc => doc.filename === 'skill.md').content;
  const rule = docs.find(doc => doc.filename === 'rule.md').content;

  assert.match(design, /Design Guidance/);
  assert.match(design, /apple/);
  assert.match(design, /linear\.app/);
  assert.match(design, /142 files/);
  assert.doesNotMatch(design, /Available Brands \(0\)/);

  assert.match(skill, /Skill Guidance/);
  assert.match(skill, /Model nhỏ vẫn phải theo cùng tiêu chuẩn/);
  assert.match(skill, /\*\*coding\*\*/);
  assert.doesNotMatch(skill, /\.system/);

  assert.match(rule, /Project Operating Rules/);
  assert.match(rule, /Không nói đã sửa/);
  assert.match(rule, /repo\.md/);
  assert.doesNotMatch(rule, /\[rule\.md\]/);
});

test('isWinterGeneratedProjectDoc detects old generated docs but not user docs', () => {
  assert.equal(isWinterGeneratedProjectDoc('*File này được tự động tạo bởi Winter CLI.*'), true);
  assert.equal(isWinterGeneratedProjectDoc('*File nÃ y Ä‘Æ°á»£c tá»± Ä‘á»™ng táº¡o bá»Ÿi Winter CLI.*'), true);
  assert.equal(isWinterGeneratedProjectDoc('# My custom project rules\nDo not overwrite this.'), false);
});
