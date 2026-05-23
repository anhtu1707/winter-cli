/**
 * ❄ SKILL MANAGER ❄
 * Manage Winter CLI skills
 */

import { promises as fs } from 'fs';
import path from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { colors, statusIcons } from '../cli/snowflake-logo.js';

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export class SkillManager {
  constructor(session) {
    this.session = session;
    this.skillsDir = path.join(homedir(), '.winter', 'skills');
    this.packagedSkillsDir = path.join(PACKAGE_ROOT, 'skills');
    this.builtinSkills = this.getBuiltinSkills();
  }

  getBuiltinSkills() {
    return [
      {
        name: 'coding',
        icon: '■',
        description: 'Code analysis, generation, and review',
        prompts: [
          'Analyze this code for issues',
          'Generate code for the following specification',
          'Review and suggest improvements',
        ],
      },
      {
        name: 'design',
        icon: '*',
        description: 'Design system and brand guidelines',
        prompts: [
          'Apply {brand} design patterns',
          'Create consistent UI components',
          'Follow accessibility guidelines',
        ],
      },
      {
        name: 'debug',
        icon: '$',
        description: 'Debugging and error analysis',
        prompts: [
          'Find the root cause of this error',
          'Suggest fixes for this bug',
          'Add appropriate logging',
        ],
      },
      {
        name: 'refactor',
        icon: '♻',
        description: 'AI-assisted refactoring and behavior-safe cleanup',
        mode: 'AI-assisted',
        prompts: [
          'Simplify this function',
          'Extract reusable components',
          'Improve code structure',
        ],
      },
      {
        name: 'test',
        icon: '✅',
        description: 'Test generation and coverage',
        prompts: [
          'Write tests for this module',
          'Increase test coverage',
          'Add edge case tests',
        ],
      },
      {
        name: 'security',
        icon: '#',
        description: 'Security analysis and best practices',
        prompts: [
          'Find potential security vulnerabilities',
          'Suggest security improvements',
          'Check for common attack vectors',
        ],
      },
      {
        name: 'performance',
        icon: '▶',
        description: 'Performance optimization',
        prompts: [
          'Identify performance bottlenecks',
          'Suggest optimization strategies',
          'Profile and improve speed',
        ],
      },
    ];
  }

  async listSkills() {
    const packagedSkills = await this.getPackagedSkills();
    const customSkills = await this.getCustomSkills();
    const byName = new Map();
    for (const skill of [...this.builtinSkills, ...packagedSkills, ...customSkills]) {
      if (!byName.has(skill.name)) byName.set(skill.name, skill);
    }
    return [...byName.values()];
  }

  async getPackagedSkills() {
    return this.getMarkdownSkillsFromDirectory(this.packagedSkillsDir, {
      icon: '*',
      isPackaged: true,
    });
  }

  async getCustomSkills() {
    try {
      await fs.mkdir(this.skillsDir, { recursive: true });
      return this.getMarkdownSkillsFromDirectory(this.skillsDir, {
        icon: '$',
        isCustom: true,
      });
    } catch {
      return [];
    }
  }

  async getMarkdownSkillsFromDirectory(directory, defaults = {}) {
    try {
      const files = await fs.readdir(directory);
      const skills = [];

      for (const file of files) {
        if (!file.endsWith('.md')) continue;
        const content = await fs.readFile(path.join(directory, file), 'utf8');
        const name = file.replace(/\.md$/i, '');
        skills.push({
          name,
          icon: defaults.icon || '$',
          description: this.extractDescription(content),
          prompts: this.extractPrompts(content),
          path: path.join(directory, file),
          ...defaults,
        });
      }

      return skills;
    } catch {
      return [];
    }
  }

  extractDescription(content) {
    const match = content.match(/^#\s+(.+)/m);
    return match ? match[1] : 'Custom skill';
  }

  extractPrompts(content) {
    const lines = String(content || '').split(/\r?\n/);
    const prompts = [];
    let inPrompts = false;
    for (const line of lines) {
      if (/^##\s+prompts\b/i.test(line)) {
        inPrompts = true;
        continue;
      }
      if (inPrompts && /^##\s+/.test(line)) break;
      if (!inPrompts) continue;
      const match = line.match(/^\s*[-*]\s+(.+)/);
      if (match) prompts.push(match[1].trim());
    }
    return prompts;
  }

  async createSkill(name, options = {}) {
    const skillPath = path.join(this.skillsDir, `${name}.md`);

    const template = `# ${name}

${options.description || 'Custom skill for Winter CLI'}

## Usage

Describe how to use this skill here.

## Prompts

- ${options.prompt || 'Describe the main use case'}

## Rules

- Follow Winter CLI principles
- Be concise and focused
`;

    await fs.writeFile(skillPath, template);
    console.log(`${statusIcons.success} Created skill: ${name}`);
    await this.session.addToMemory(`Created skill: ${name}`, 'skill');
  }

  async enableSkill(name) {
    const skill = this.builtinSkills.find(s => s.name === name) ||
                  (await this.getCustomSkills()).find(s => s.name === name);

    if (!skill) {
      console.log(`${colors.red}${statusIcons.error} Skill "${name}" not found${colors.reset}`);
      return false;
    }

    await this.session.updateContext('activeSkill', name);
    console.log(`${statusIcons.success} Enabled skill: ${name}`);
    return true;
  }

  async disableSkill(name) {
    await this.session.updateContext('activeSkill', null);
    console.log(`${statusIcons.success} Disabled skill: ${name}`);
  }

  async getSkillPrompts(name) {
    const skill = this.builtinSkills.find(s => s.name === name) ||
                  (await this.getPackagedSkills()).find(s => s.name === name) ||
                  (await this.getCustomSkills()).find(s => s.name === name);

    return skill?.prompts || [];
  }

  getSkillByName(name) {
    return this.builtinSkills.find(s => s.name === name);
  }
}
