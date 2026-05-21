/**
 * ❄ SKILL MANAGER ❄
 * Manage Winter CLI skills
 */

import { promises as fs } from 'fs';
import path from 'path';
import { homedir } from 'os';
import { colors, statusIcons } from '../cli/snowflake-logo.js';

export class SkillManager {
  constructor(session) {
    this.session = session;
    this.skillsDir = path.join(homedir(), '.winter', 'skills');
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
        description: 'Code refactoring and improvements',
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
    const customSkills = await this.getCustomSkills();
    return [...this.builtinSkills, ...customSkills];
  }

  async getCustomSkills() {
    try {
      await fs.mkdir(this.skillsDir, { recursive: true });
      const files = await fs.readdir(this.skillsDir);
      const skills = [];

      for (const file of files) {
        if (file.endsWith('.md')) {
          const content = await fs.readFile(path.join(this.skillsDir, file), 'utf8');
          const name = file.replace('.md', '');
          skills.push({
            name,
            icon: '$',
            description: this.extractDescription(content),
            isCustom: true,
          });
        }
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
                  (await this.getCustomSkills()).find(s => s.name === name);

    return skill?.prompts || [];
  }

  getSkillByName(name) {
    return this.builtinSkills.find(s => s.name === name);
  }
}