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
import { MCPClient } from '../mcp/client.js';
import { BenchmarkRunner } from '../ai/benchmark.js';
import { redactSecrets } from './secret-env.js';
import { formatRuntimeEnvironmentSummary, getRuntimeEnvironment } from './runtime-env.js';

export { redactSecrets } from './secret-env.js';

const SECRET_KEY_PATTERN = /(api[-_]?key|auth[-_]?token|access[-_]?token|refresh[-_]?token|secret|password)/i;

export function redactSecretsLegacy(value) {
  if (Array.isArray(value)) {
    return value.map(item => redactSecretsLegacy(item));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      SECRET_KEY_PATTERN.test(key) ? '[redacted]' : redactSecretsLegacy(entry),
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
      benchmark: this.handleBenchmark.bind(this),
      session: this.handleSession.bind(this),
      project: this.handleProject.bind(this),
      skill: this.handleSkill.bind(this),
      plugin: this.handlePlugin.bind(this),
      mcp: this.handleMcp.bind(this),
      permissions: this.handlePermissions.bind(this),
      provider: this.handleProvider.bind(this),
      providers: this.showProviders.bind(this),
      model: this.handleModel.bind(this),
      models: this.showModels.bind(this),
      design: this.handleDesign.bind(this),
      code: this.handleCode.bind(this),
      review: this.handleReview.bind(this),
      debug: this.handleDebug.bind(this),
      auto: this.handleDebug.bind(this),
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
      '/forget': (args) => this.session.clearMemory(args.length > 0 ? args.join(' ') : null),
      '/memories': () => this.showMemories(),
      '/plans': () => this.showPlans(),
      '/cache': () => this.handleCache(args),
      '/provider': () => this.handleProvider(args),
      '/providers': () => this.showProviders(),
      '/model': () => this.handleModel(args),
      '/models': () => this.showModels(),
      '/mcp': () => this.handleMcp(args),
      '/permissions': () => this.handlePermissions(args),
      '/debug': () => this.handleDebug(args),
      '/auto': () => this.handleDebug(args),
      '/exit': () => process.exit(0),
    };

    const handler = slashCommands[cmd];
    if (handler) {
      await handler(args);
    } else {
      console.log(`${colors.yellow}Unknown slash command: ${cmd}${colors.reset}`);
    }
  }

  async handleDebug(args) {
    const task = args.join(' ') || 'Find the root cause, patch it, and verify with the closest test or build command';
    return this.handleChat([`AUTO DEBUG: ${task}`]);
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

  async handleBenchmark(args) {
    const runner = new BenchmarkRunner(this.ai);

    // Parse arguments: winter benchmark [providers...] [--tasks] [--questions]
    const providerNames = [];
    let runTasks = true;
    let runQuestions = true;

    for (const arg of args) {
      if (arg === '--tasks-only') {
        runQuestions = false;
      } else if (arg === '--questions-only') {
        runTasks = false;
      } else if (arg.startsWith('--')) {
        // skip unknown flags
      } else {
        providerNames.push(arg);
      }
    }

    // If no providers specified, use active
    if (providerNames.length === 0) {
      await this.ai.init();
      const active = this.ai.getActiveProvider();
      if (active) providerNames.push(active);
      // Also add any other ready providers
      const providers = this.ai.listProviders?.() || [];
      for (const p of providers) {
        if (p.name !== active && p.ready && !providerNames.includes(p.name)) {
          providerNames.push(p.name);
        }
      }
    }

    if (providerNames.length === 0) {
      console.log(`${colors.yellow}No providers configured. Run 'winter config' first.${colors.reset}`);
      return;
    }

    console.log(`\n${colors.dim}Benchmarking providers: ${providerNames.join(', ')}${colors.reset}`);
    if (!runQuestions) console.log(`${colors.dim}(Coding tasks only)${colors.reset}`);
    if (!runTasks) console.log(`${colors.dim}(Questions only)${colors.reset}`);
    console.log('');

    try {
      const result = await runner.run(providerNames, { questions: runQuestions, tasks: runTasks });
      console.log(runner.formatResults(result));

      // Save to session history
      try {
        await this.session.addToHistory({
          role: 'system',
          content: `[Benchmark Results]\n${runner.formatHistorySummary(result)}`,
        });
      } catch {}
    } catch (err) {
      console.log(`${colors.red}${statusIcons.error} Benchmark failed: ${err.message}${colors.reset}`);
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

  async handleMcp(args) {
    const [action, ...rest] = args;
    const config = await this.config.load();
    config.mcp = config.mcp || { servers: [] };
    config.permissions = config.permissions || { allowlist: {} };
    config.permissions.allowlist = config.permissions.allowlist || { tools: [], commands: [], mcpServers: [] };

    switch (action) {
      case undefined:
      case 'list':
        console.log(`\n${colors.cyan}MCP Servers:${colors.reset}`);
        (config.mcp.servers || []).forEach(server => {
          const enabled = server.enabled === false ? `${colors.red}disabled${colors.reset}` : `${colors.green}enabled${colors.reset}`;
          console.log(`  • ${server.name} (${enabled}) -> ${server.command}${server.args?.length ? ` ${server.args.join(' ')}` : ''}`);
        });
        if ((config.mcp.servers || []).length === 0) {
          console.log(`  ${colors.dim}No MCP servers configured.${colors.reset}`);
        }
        break;
      case 'add': {
        const [name, command, ...commandArgs] = rest;
        if (!name || !command) {
          console.log(`${colors.yellow}Usage: winter mcp add <name> <command> [args-json]${colors.reset}`);
          break;
        }

        const argsJson = commandArgs.join(' ');
        let parsedArgs = [];
        if (argsJson.trim()) {
          try {
            const parsed = JSON.parse(argsJson);
            parsedArgs = Array.isArray(parsed) ? parsed : [String(parsed)];
          } catch {
            parsedArgs = commandArgs;
          }
        }

        config.mcp.servers = (config.mcp.servers || []).filter(server => server.name !== name);
        config.mcp.servers.push({ name, command, args: parsedArgs, enabled: true });
        config.permissions.allowlist.mcpServers = [...new Set([...(config.permissions.allowlist.mcpServers || []), name])];
        await this.config.save(config);
        console.log(`${colors.green}✓ Added MCP server: ${name}${colors.reset}`);
        break;
      }
      case 'remove': {
        const name = rest[0];
        if (!name) {
          console.log(`${colors.yellow}Usage: winter mcp remove <name>${colors.reset}`);
          break;
        }
        config.mcp.servers = (config.mcp.servers || []).filter(server => server.name !== name);
        config.permissions.allowlist.mcpServers = (config.permissions.allowlist.mcpServers || []).filter(server => server !== name);
        await this.config.save(config);
        console.log(`${colors.green}✓ Removed MCP server: ${name}${colors.reset}`);
        break;
      }
      case 'allow': {
        const name = rest[0];
        if (!name) {
          console.log(`${colors.yellow}Usage: winter mcp allow <server>${colors.reset}`);
          break;
        }
        config.permissions.allowlist.mcpServers = [...new Set([...(config.permissions.allowlist.mcpServers || []), name])];
        await this.config.save(config);
        console.log(`${colors.green}✓ MCP server allowed: ${name}${colors.reset}`);
        break;
      }
      case 'tools': {
        const name = rest[0];
        if (!name) {
          console.log(`${colors.yellow}Usage: winter mcp tools <server>${colors.reset}`);
          break;
        }

        const server = (config.mcp.servers || []).find(item => item.name === name && item.enabled !== false);
        if (!server) {
          console.log(`${colors.red}MCP server not configured or disabled: ${name}${colors.reset}`);
          break;
        }

        const client = new MCPClient(server);
        try {
          const tools = await client.listTools();
          console.log(`\n${colors.cyan}MCP Tools: ${name}${colors.reset}`);
          if (!tools.length) {
            console.log(`  ${colors.dim}No tools reported.${colors.reset}`);
          }
          tools.forEach(tool => {
            const description = tool.description ? ` - ${tool.description}` : '';
            console.log(`  ${colors.green}${tool.name}${colors.reset}${description}`);
          });
        } catch (error) {
          console.log(`${colors.red}Failed to list MCP tools: ${error.message}${colors.reset}`);
        } finally {
          await client.close();
        }
        break;
      }
      default:
        console.log(`${colors.yellow}Usage: winter mcp <list|add|remove|allow|tools>${colors.reset}`);
    }
  }

  async handlePermissions(args) {
    const [action, ...rest] = args;
    const config = await this.config.load();
    config.permissions = config.permissions || { allowlist: { tools: [], commands: [], mcpServers: [] } };
    config.permissions.allowlist = config.permissions.allowlist || { tools: [], commands: [], mcpServers: [] };

    switch (action) {
      case undefined:
      case 'list':
        console.log(`\n${colors.cyan}Permission Allowlist:${colors.reset}`);
        console.log(`  Tools: ${(config.permissions.allowlist.tools || []).join(', ') || 'none'}`);
        console.log(`  Commands: ${(config.permissions.allowlist.commands || []).join(', ') || 'none'}`);
        console.log(`  MCP Servers: ${(config.permissions.allowlist.mcpServers || []).join(', ') || 'none'}`);
        console.log(`  Prompt by default: ${config.permissions.promptByDefault !== false}`);
        break;
      case 'allow': {
        const [kind, value] = rest;
        if (!kind || !value) {
          console.log(`${colors.yellow}Usage: winter permissions allow <tool|command|mcp> <value>${colors.reset}`);
          break;
        }
        const field = kind === 'tool' ? 'tools' : kind === 'command' ? 'commands' : kind === 'mcp' ? 'mcpServers' : null;
        if (!field) {
          console.log(`${colors.yellow}Allowed kinds: tool, command, mcp${colors.reset}`);
          break;
        }
        config.permissions.allowlist[field] = [...new Set([...(config.permissions.allowlist[field] || []), value])];
        await this.config.save(config);
        console.log(`${colors.green}✓ Allowed ${kind}: ${value}${colors.reset}`);
        break;
      }
      case 'prompt': {
        const value = String(rest[0] || '').toLowerCase();
        config.permissions.promptByDefault = !(value === 'off' || value === 'false' || value === '0' || value === 'no');
        await this.config.save(config);
        console.log(`${colors.green}✓ promptByDefault = ${config.permissions.promptByDefault}${colors.reset}`);
        break;
      }
      default:
        console.log(`${colors.yellow}Usage: winter permissions <list|allow|prompt>${colors.reset}`);
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
    const [action, ...rest] = args;

    if (action === 'backup') {
      const backupPath = await this.config.backupConfig?.('manual');
      console.log(`${colors.green}${statusIcons.success} Config backup: ${backupPath}${colors.reset}`);
      return;
    }

    if (action === 'restore') {
      const backupPath = rest.join(' ').trim();
      if (!backupPath) {
        console.log(`${colors.yellow}Usage: winter config restore <backup-path>${colors.reset}`);
        return;
      }
      await this.config.restoreConfig?.(backupPath);
      await this.ai.reload?.();
      console.log(`${colors.green}${statusIcons.success} Config restored${colors.reset}`);
      return;
    }

    if (action === 'migrate-secrets') {
      const result = await this.config.migrateSecrets?.();
      await this.ai.reload?.();
      console.log(`${colors.green}${statusIcons.success} Secrets migrated out of winter.json${colors.reset}`);
      console.log(`${colors.dim}Backup: ${result?.backupPath}${colors.reset}`);
      console.log(`${colors.dim}Env file: ${result?.envFile}${colors.reset}`);
      return;
    }

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

  async handleProvider(args) {
    const providerName = args[0]?.trim().toLowerCase();

    if (!providerName) {
      await this.ai.init?.();
      console.log(`${colors.cyan}Provider: ${this.ai.getActiveProvider()}${colors.reset}`);
      return;
    }

    const switched = typeof this.ai.switchProvider === 'function'
      ? await this.ai.switchProvider(providerName)
      : (this.ai.setProvider(providerName) ? providerName : null);

    if (switched) {
      await this.config.setDefaultProvider(switched);
      console.log(`${statusIcons.success} Provider: ${switched}`);
      return;
    }

    const available = this.ai.listProviders?.().map(p => p.name).join(', ') || 'none';
    console.log(`${colors.red}${statusIcons.error} Unknown provider: ${providerName}${colors.reset}`);
    console.log(`${colors.dim}Available providers: ${available}${colors.reset}`);
  }

  async handleModel(args) {
    await this.ai.init?.();
    const providers = this.ai.providers || {};
    const activeProvider = this.ai.getActiveProvider?.();

    if (!args.length) {
      console.log(`${colors.cyan}Model: ${providers[activeProvider]?.model || 'unavailable'}${colors.reset}`);
      return;
    }

    let providerName = activeProvider;
    let modelArgs = args;
    const firstArg = String(args[0] || '').trim().toLowerCase();
    if (providers[firstArg] && args.length > 1) {
      providerName = firstArg;
      modelArgs = args.slice(1);
    }

    const model = modelArgs.join(' ').trim();
    if (!providerName || !model) {
      console.log(`${colors.yellow}Usage: winter model [provider] <model-id>${colors.reset}`);
      return;
    }

    await this.config.setProviderModel(providerName, model);
    if (providers[providerName]) {
      providers[providerName].model = model;
    }
    if (typeof this.ai.reload === 'function') {
      await this.ai.reload();
    }
    console.log(`${statusIcons.success} Model for ${providerName}: ${model}`);
  }

  async showModels() {
    await this.ai.init?.();
    const providers = this.ai.listProviders?.() || [];
    console.log(`\n${colors.cyan}Models:${colors.reset}`);
    if (providers.length === 0) {
      console.log(`  ${colors.dim}No providers configured${colors.reset}`);
      return;
    }
    providers.forEach(provider => {
      const active = provider.name === this.ai.getActiveProvider?.() ? ` ${colors.green}< active${colors.reset}` : '';
      console.log(`  ${provider.name}: ${provider.model}${active}`);
    });
  }

  async showProviders() {
    await this.ai.init?.();
    const providers = this.ai.listProviders?.() || [];
    console.log(`\n${colors.cyan}Providers:${colors.reset}`);
    providers.forEach(p => {
      const status = p.ready ? statusIcons.online : statusIcons.offline;
      const active = p.name === this.ai.getActiveProvider?.() ? ` ${colors.green}< active${colors.reset}` : '';
      console.log(`  ${status} ${p.name} (${p.model})${active}`);
    });
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
    const environmentSummary = [
      formatRuntimeEnvironmentSummary(getRuntimeEnvironment()),
    ].join('\n');

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

## Runtime Environment
${environmentSummary}

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
