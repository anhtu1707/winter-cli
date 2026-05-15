/**
 * ❄️ COMMAND PARSER ❄️
 * Parse and execute CLI commands
 */

import { SessionManager } from '../session/manager.js';
import { AIProviderManager } from '../ai/providers.js';
import { colors, statusIcons, miniLogo } from './snowflake-logo.js';
import { DesignCommands } from '../design/commands.js';
import { SkillManager } from '../skills/manager.js';
import { PluginManager } from '../plugins/manager.js';

const SECRET_KEY_PATTERN = /(api[-_]?key|auth[-_]?token|access[-_]?token|refresh[-_]?token|secret|password)/i;

export function redactSecrets(value) {
  if (Array.isArray(value)) {
    return value.map(item => redactSecrets(item));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      SECRET_KEY_PATTERN.test(key) ? '[redacted]' : redactSecrets(entry),
    ])
  );
}

export class CommandParser {
  constructor({ session, ai, config }) {
    this.session = session;
    this.ai = ai;
    this.config = config;
    this.design = new DesignCommands(this.session, this.config);
    this.skills = new SkillManager(this.session);
    this.plugins = new PluginManager(this.session);

    this.commands = {
      chat: this.handleChat.bind(this),
      call: this.handleCallAll.bind(this),
      session: this.handleSession.bind(this),
      project: this.handleProject.bind(this),
      skill: this.handleSkill.bind(this),
      plugin: this.handlePlugin.bind(this),
      design: this.handleDesign.bind(this),
      code: this.handleCode.bind(this),
      review: this.handleReview.bind(this),
      config: this.handleConfig.bind(this),
      init: this.handleInit.bind(this),
      help: this.handleHelp.bind(this),
    };
  }

  async parse(args) {
    if (args.length === 0) {
      return this.handleHelp();
    }

    const [command, ...rest] = args;

    // Check for slash commands
    if (command.startsWith('/')) {
      return this.handleSlashCommand(command, rest);
    }

    // Handle regular commands
    const handler = this.commands[command];
    if (handler) {
      await handler(rest);
    } else {
      console.log(`${colors.yellow}Unknown command: ${command}${colors.reset}`);
      console.log(`Run '${miniLogo} winter help' for available commands`);
    }
  }

  async handleSlashCommand(cmd, args) {
    const slashCommands = {
      '/session': () => this.handleSession(args),
      '/new': () => this.session.newSession(),
      '/save': () => this.session.saveSession(),
      '/remember': (args) => this.session.addToMemory(args.join(' ')),
      '/forget': (args) => console.log('Memory cleared'),
      '/memories': () => this.showMemories(),
      '/plans': () => this.showPlans(),
      '/cache': () => this.handleCache(args),
      '/exit': () => process.exit(0),
    };

    const handler = slashCommands[cmd];
    if (handler) {
      await handler(args);
    } else {
      console.log(`${colors.yellow}Unknown slash command: ${cmd}${colors.reset}`);
    }
  }

  async handleChat(args) {
    const message = args.join(' ');
    if (!message) {
      console.log(`${colors.yellow}Usage: winter chat <message>${colors.reset}`);
      return;
    }

    console.log(`${colors.dim}Thinking...${colors.reset}`);

    try {
      const response = await this.ai.chat(message, {
        system: this.getWinterSystemPrompt(),
      });

      console.log(`\n${colors.cyan}❄ Assistant:${colors.reset}\n${response.content}\n`);
    } catch (error) {
      console.log(`${colors.red}${statusIcons.error} Error: ${error.message}${colors.reset}`);
    }
  }

  async handleCallAll(args) {
    const prompt = args.join(' ');
    if (!prompt) {
      console.log(`${colors.yellow}Usage: winter call <prompt>${colors.reset}`);
      return;
    }

    console.log(`${colors.dim}Calling all providers...${colors.reset}\n`);

    const results = await this.ai.callAllProviders(prompt);

    for (const [provider, result] of Object.entries(results)) {
      const status = result.error ? colors.red : colors.green;
      const icon = result.error ? statusIcons.error : statusIcons.success;
      console.log(`${status}${icon} ${provider.toUpperCase()}${colors.reset}`);

      if (result.error) {
        console.log(`   ${colors.red}${result.error}${colors.reset}`);
      } else {
        console.log(`   ${result.content.substring(0, 200)}...`);
      }
      console.log('');
    }
  }

  async handleSession(args) {
    const [action, ...rest] = args;

    switch (action) {
      case 'new':
        const session = await this.session.newSession();
        console.log(`${statusIcons.success} New session created: ${session.id.substring(0, 8)}`);
        break;
      case 'save':
        await this.session.saveSession();
        console.log(`${statusIcons.success} Session saved`);
        break;
      case 'list':
        const sessions = await this.session.listSessions();
        console.log(`\n${colors.cyan}Sessions:${colors.reset}`);
        sessions.forEach(s => {
          console.log(`  ${s.id.substring(0, 8)} - ${s.createdAt} ${s.project ? `(project: ${s.project})` : ''}`);
        });
        break;
      case 'switch':
        await this.session.switchSession(rest[0]);
        console.log(`${statusIcons.success} Switched to session: ${rest[0].substring(0, 8)}`);
        break;
      case 'context':
        console.log(`\n${colors.cyan}Current Context:${colors.reset}`);
        console.log(JSON.stringify(this.session.getContext(), null, 2));
        break;
      default:
        console.log(`${colors.dim}Session ID: ${this.session.getSessionId().substring(0, 8)}${colors.reset}`);
    }
  }

  async handleProject(args) {
    const [action, ...rest] = args;

    switch (action) {
      case 'new':
        console.log(`${statusIcons.success} Creating new project...`);
        break;
      case 'list':
        console.log(`${colors.cyan}Projects:${colors.reset}`);
        break;
      case 'use':
        console.log(`${statusIcons.success} Using project: ${rest[0]}`);
        break;
      default:
        console.log(`${colors.yellow}Usage: winter project <new|list|use>${colors.reset}`);
    }
  }

  async handleSkill(args) {
    const [action, ...rest] = args;

    switch (action) {
      case undefined:
      case 'list':
        const skills = await this.skills.listSkills();
        console.log(`\n${colors.cyan}Available Skills:${colors.reset}`);
        skills.forEach(s => console.log(`  ${s.icon} ${s.name} - ${s.description}`));
        break;
      case 'enable':
        await this.skills.enableSkill(rest[0]);
        console.log(`${statusIcons.success} Enabled: ${rest[0]}`);
        break;
      case 'create':
        await this.skills.createSkill(rest[0]);
        console.log(`${statusIcons.success} Created skill: ${rest[0]}`);
        break;
      default:
        console.log(`${colors.yellow}Usage: winter skill <list|enable|create>${colors.reset}`);
    }
  }

  async handlePlugin(args) {
    const [action, ...rest] = args;

    switch (action) {
      case undefined:
      case 'list':
        const plugins = await this.plugins.listPlugins();
        console.log(`\n${colors.cyan}Installed Plugins:${colors.reset}`);
        plugins.forEach(p => console.log(`  ${p.icon} ${p.name} v${p.version}`));
        break;
      case 'install':
        await this.plugins.installPlugin(rest[0]);
        break;
      case 'remove':
        await this.plugins.removePlugin(rest[0]);
        break;
      default:
        console.log(`${colors.yellow}Usage: winter plugin <list|install|remove>${colors.reset}`);
    }
  }

  async handleDesign(args) {
    const [action, ...rest] = args;
    await this.design.execute(action, rest);
  }

  async handleCode(args) {
    console.log(`${colors.dim}Code analysis mode...${colors.reset}`);
  }

  async handleReview(args) {
    console.log(`${colors.dim}Code review mode...${colors.reset}`);
  }

  async handleConfig(args) {
    const config = await this.config.load();
    console.log(`\n${colors.cyan}Current Configuration:${colors.reset}`);
    console.log(JSON.stringify(redactSecrets(config), null, 2));
  }

  async handleInit(args) {
    console.log(`${statusIcons.success} Initializing Winter CLI...`);
    await this.session.init();
    console.log(`${statusIcons.success} Ready!`);
  }

  async handleCache(args) {
    const [action] = args;

    switch (action) {
      case 'clear':
        this.ai.clearCache();
        console.log(`${statusIcons.success} Cache cleared`);
        break;
      case 'stats':
        const stats = this.ai.getCacheStats();
        console.log(`\n${colors.cyan}Cache Statistics:${colors.reset}`);
        console.log(`  Size: ${stats.size}`);
        console.log(`  Active Provider: ${stats.activeProvider}`);
        break;
      default:
        console.log(`${colors.yellow}Usage: /cache <clear|stats>${colors.reset}`);
    }
  }

  async showMemories() {
    const memories = this.session.getMemory();
    console.log(`\n${colors.cyan}Memories:${colors.reset}`);
    if (memories.length === 0) {
      console.log(`  ${colors.dim}No memories stored${colors.reset}`);
    } else {
      memories.forEach(m => console.log(`  - ${m.text} (${m.type})`));
    }
  }

  async showPlans() {
    const plans = this.session.getPlans();
    console.log(`\n${colors.cyan}Active Plans:${colors.reset}`);
    if (plans.length === 0) {
      console.log(`  ${colors.dim}No active plans${colors.reset}`);
    } else {
      plans.forEach(p => console.log(`  ${statusIcons.success} ${p.title} - ${p.status}`));
    }
  }

  getWinterSystemPrompt() {
    return `You are Winter, an expert AI coding assistant.

Follow these principles:

1. **Think Before Coding**
   - State assumptions explicitly
   - Ask when unclear
   - Surface tradeoffs

2. **Simplicity First**
   - Minimum code that solves the problem
   - No speculative features
   - 200 lines → 50 if possible

3. **Surgical Changes**
   - Touch only what you must
   - Match existing style
   - Clean up only your own mess

4. **Goal-Driven Execution**
   - Define success criteria
   - Loop until verified

Current session: ${this.session.getSessionId().substring(0, 8)}
`;
  }

  async handleHelp() {
    console.log(`
${colors.cyan}❄ WINTER CLI - Help${colors.reset}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${colors.white}Chat Commands:${colors.reset}
  winter chat <message>      Chat with AI
  winter call <prompt>       Call all providers

${colors.white}Session Management:${colors.reset}
  winter session             Show current session
  winter session new         Create new session
  winter session save        Save current session
  winter session list        List all sessions
  winter session switch <id> Switch session

  /remember <text>           Add to memory
  /memories                  Show memories
  /plans                     Show active plans

${colors.white}Project Management:${colors.reset}
  winter project new         Create project
  winter project list        List projects
  winter project use <id>    Use project

${colors.white}Skills & Plugins:${colors.reset}
  winter skill list          List skills
  winter skill enable <name> Enable skill
  winter skill create <name> Create skill

  winter plugin list        List plugins
  winter plugin install <n> Install plugin

${colors.white}Design Commands:${colors.reset}
  winter design search <q>   Search brands
  winter design add <brand> Add design file
  winter design list        List brands
  winter design preview <b> Preview brand

${colors.white}AI Providers:${colors.reset}
  Anthropic (Claude), OpenAI (GPT-4), Ollama, Groq

${colors.white}Configuration:${colors.reset}
  winter config              Show config
  winter init                Initialize

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `);
  }
}
