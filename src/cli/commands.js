/**
 * ❄ COMMAND PARSER ❄
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
import { ContextLoader } from './context-loader.js';
import { ECCManager } from './ecc.js';
import { buildTuiSnapshot, renderLandingTui } from './tui.js';
import { HtmlFxManager } from '../integrations/htmlfx-manager.js';
import { selectWorkflow } from '../ai/workflow-selector.js';
import { getProfileBlueprint } from '../ai/profile-blueprints.js';
import { ToolExecutor } from '../tools/executor.js';
import { handleRagCommandFromParser } from '../rag/cli.js';
import { promises as fs } from 'fs';
import path from 'path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

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
  constructor({ session, ai, config, tools }) {
    this.session = session;
    this.ai = ai;
    this.config = config;
    this.tools = tools || new ToolExecutor({ session: this.session, config: this.config, projectPath: process.cwd() });
    this.design = new DesignCommands(this.session, this.config);
    this.skills = new SkillManager(this.session);
    this.plugins = new PluginManager(this.session);
    this.projectPath = process.cwd();
    this.contextLoader = new ContextLoader({ projectPath: this.projectPath, session: this.session });
    this.ecc = new ECCManager({ projectPath: this.projectPath, config: this.config });
    this.htmlfx = new HtmlFxManager({ projectPath: this.projectPath });

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
      ecc: this.handleEcc.bind(this),
      'page-agent': this.handlePageAgent.bind(this),
      pageagent: this.handlePageAgent.bind(this),
      resources: this.handleResources.bind(this),
      htmlfx: this.handleHtmlFx.bind(this),
      'memory-vault': this.handleMemoryVault.bind(this),
      rag: this.handleRag.bind(this),
      tui: this.handleTui.bind(this),
      provider: this.handleProvider.bind(this),
      providers: this.showProviders.bind(this),
      model: this.handleModel.bind(this),
      models: this.showModels.bind(this),
      design: this.handleDesign.bind(this),
      code: this.handleCode.bind(this),
      review: this.handleReview.bind(this),
      plan: this.handlePlan.bind(this),
      debug: this.handleDebug.bind(this),
      auto: this.handleDebug.bind(this),
      autopilot: this.handleAutopilot.bind(this),
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
      '/memory-vault': () => this.handleMemoryVault(args),
      '/tui': () => this.handleTui(args),
      '/plans': () => this.showPlans(),
      '/plan': () => this.handlePlan(args),
      '/cache': () => this.handleCache(args),
      '/provider': () => this.handleProvider(args),
      '/providers': () => this.showProviders(),
      '/model': () => this.handleModel(args),
      '/models': () => this.showModels(),
      '/mcp': () => this.handleMcp(args),
      '/permissions': () => this.handlePermissions(args),
      '/ecc': () => this.handleEcc(args),
      '/page-agent': () => this.handlePageAgent(args),
      '/pageagent': () => this.handlePageAgent(args),
      '/resources': () => this.handleResources(args),
      '/htmlfx': () => this.handleHtmlFx(args),
      '/debug': () => this.handleDebug(args),
      '/auto': () => this.handleDebug(args),
      '/rag': () => this.handleRag(args),
      '/autopilot': () => this.handleAutopilot(args),
      '/exit': () => process.exit(0),
    };

    const handler = slashCommands[cmd];
    if (handler) {
      await handler(args);
    } else {
      console.log(`${colors.yellow}Unknown slash command: ${cmd}${colors.reset}`);
    }
  }

  getResourcePaths() {
    return this.contextLoader.getResourcePaths();
  }

  async listPathEntries(target, limit = 80) {
    try {
      const entries = await fs.readdir(target, { withFileTypes: true });
      return entries
        .filter(entry => entry.isDirectory() || entry.isFile())
        .map(entry => ({ name: entry.name, isDirectory: entry.isDirectory() }))
        .sort((a, b) => {
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return a.name.localeCompare(b.name);
        })
        .slice(0, limit);
    } catch {
      return [];
    }
  }

  async printPathPreview(target, label, limit = 40) {
    try {
      const stat = await fs.stat(target);
      console.log(`${colors.cyan}${label}:${colors.reset} ${target}`);
      if (stat.isDirectory()) {
        const entries = await this.listPathEntries(target, limit);
        if (entries.length === 0) {
          console.log(`  ${colors.dim}(empty)${colors.reset}`);
          return;
        }
        entries.forEach(entry => {
          console.log(`  ${entry.isDirectory ? '[dir] ' : '[file]'} ${entry.name}`);
        });
        return;
      }

      const content = await fs.readFile(target, 'utf8');
      console.log(content.slice(0, 4000));
      if (content.length > 4000) {
        console.log(`${colors.dim}... (${content.length - 4000} more chars)${colors.reset}`);
      }
    } catch (error) {
      console.log(`${colors.red}${label} not available: ${error.message}${colors.reset}`);
    }
  }

  async handleMemoryVault(args = []) {
    const root = path.join(this.projectPath, '.winter', 'memory');
    const command = (args[0] || 'info').toLowerCase();
    if (command === 'list') {
      await this.printPathPreview(root, 'Winter memory vault', 80);
      return;
    }

    const indexPath = path.join(root, 'index.md');
    try {
      const stat = await fs.stat(root);
      const index = await fs.readFile(indexPath, 'utf8').catch(() => '');
      const noteCount = (index.match(/^\- \[\[/gm) || []).length;
      console.log(`${colors.cyan}Winter memory vault:${colors.reset} ${root}`);
      console.log(`  ${colors.dim}Created:${colors.reset} ${stat.birthtime.toLocaleString()}`);
      console.log(`  ${colors.dim}Index notes:${colors.reset} ${noteCount}`);
      if (index.trim()) {
        console.log(`\n${colors.dim}${index.split(/\r?\n/).slice(0, 20).join('\n')}${colors.reset}`);
      }
    } catch {
      console.log(`${colors.yellow}No TokenJuice memory vault yet. It will be created at ${root} after a large tool result is compressed.${colors.reset}`);
    }
  }

  async handleTui() {
    await this.ai.init?.();
    const snapshot = buildTuiSnapshot(this);
    console.log(`\n${renderLandingTui(snapshot, {
      colors,
      title: 'Winter Dashboard',
    })}\n`);
  }

  async handleRag(args = []) {
    await handleRagCommandFromParser(this, args);
  }

  async searchResourceFiles(root, query, limit = 30) {
    const matches = [];
    const needle = String(query || '').toLowerCase();
    if (!needle) return matches;

    const walk = async (dir) => {
      if (matches.length >= limit) return;
      const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (matches.length >= limit) break;
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(root, fullPath).replace(/\\/g, '/');
        if (entry.isDirectory()) {
          if (['node_modules', '.git', 'dist', 'build', '.next'].includes(entry.name)) continue;
          if (entry.name.toLowerCase().includes(needle)) matches.push({ relativePath, isDirectory: true });
          await walk(fullPath);
        } else if (entry.isFile() && entry.name.toLowerCase().includes(needle)) {
          matches.push({ relativePath, isDirectory: false });
        }
      }
    };

    await walk(root);
    return matches;
  }

  async handleResources() {
    const manifestPath = this.getResourcePaths().manifest;
    try {
      const raw = await fs.readFile(manifestPath, 'utf8');
      const manifest = JSON.parse(raw.replace(/^\uFEFF/, ''));
      console.log(`${colors.cyan}Local resources:${colors.reset} ${manifest.root || this.getResourcePaths().localRoot}`);
      for (const item of manifest.localResources || []) {
        const sizeMb = item.bytes ? `${(item.bytes / 1024 / 1024).toFixed(2)} MB` : 'n/a';
        console.log(`  ${item.name}: ${item.files} file(s), ${sizeMb}`);
      }
    } catch (error) {
      console.log(`${colors.red}Resources manifest not available: ${error.message}${colors.reset}`);
    }
  }

  async handlePageAgent(args = []) {
    const root = this.getResourcePaths().pageAgent;
    const [action = 'info', ...rest] = args;

    if (action === 'search') {
      const query = rest.join(' ');
      if (!query) {
        console.log(`${colors.yellow}Usage: winter page-agent search <query>${colors.reset}`);
        return;
      }
      const matches = await this.searchResourceFiles(root, query);
      console.log(`${colors.cyan}Page Agent search "${query}":${colors.reset}`);
      if (matches.length === 0) {
        console.log(`  ${colors.dim}No results${colors.reset}`);
        return;
      }
      matches.forEach(match => console.log(`  ${match.isDirectory ? '[dir] ' : '[file]'} ${match.relativePath}`));
      return;
    }

    if (action === 'read') {
      const requestedPath = rest.join(' ') || 'README.md';
      const target = path.resolve(root, requestedPath);
      if (!target.startsWith(path.resolve(root))) {
        console.log(`${colors.red}Path must stay inside page-agent resources.${colors.reset}`);
        return;
      }
      await this.printPathPreview(target, `page-agent/${requestedPath}`, 80);
      return;
    }

    if (action === 'docs') {
      await this.printPathPreview(path.join(root, 'docs'), 'page-agent/docs', 80);
      return;
    }

    if (action === 'snippet' || action === 'quickstart' || action === 'install') {
      console.log(`${colors.cyan}Page Agent quickstart:${colors.reset}`);
      console.log(`  npm install page-agent`);
      console.log(`  import { PageAgent } from 'page-agent'`);
      console.log(`  const agent = new PageAgent({ model: 'qwen3.5-plus', baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', apiKey: 'YOUR_API_KEY', language: 'en-US' })`);
      console.log(`  await agent.execute('Click the login button')`);
      return;
    }

    if (action === 'browse' || action === 'fetch' || action === 'open') {
      const url = rest[0];
      if (!url) {
        console.log(`${colors.yellow}Usage: winter page-agent browse <url>${colors.reset}`);
        return;
      }
      console.log(`${colors.cyan}Page Agent browse:${colors.reset} ${url}`);
      try {
        const result = await this.tools.execute('WebFetch', { url, prompt: 'Extract the main content, key controls, and forms.' });
        if (result.success) {
          const content = result.content || result.text || '';
          console.log(`${colors.green}✓ Fetched ${url} (${content.length} chars)${colors.reset}`);
          const display = content.length > 4000 ? `${content.slice(0, 4000)}\n${colors.dim}... (${content.length - 4000} more chars)${colors.reset}` : content;
          console.log(`\n${colors.dim}${'─'.repeat(50)}${colors.reset}`);
          console.log(display);
          console.log(`${colors.dim}${'─'.repeat(50)}${colors.reset}`);
          return;
        }

        console.log(`${colors.yellow}WebFetch could not extract the page, trying BrowserDebug...${colors.reset}`);
        const bdResult = await this.tools.execute('BrowserDebug', { url, action: 'open' });
        if (bdResult.success) {
          console.log(`${colors.green}✓ BrowserDebug loaded: ${url}${colors.reset}`);
        } else {
          console.log(`${colors.red}✖ Could not load: ${bdResult.error || result.error || 'unknown error'}${colors.reset}`);
        }
      } catch (error) {
        console.log(`${colors.red}✖ Error: ${error.message}${colors.reset}`);
      }
      return;
    }

    await this.printPathPreview(root, 'page-agent', 80);
    console.log(`${colors.dim}Commands: page-agent search <query>, page-agent read <path>, page-agent docs, page-agent snippet, page-agent browse <url>${colors.reset}`);
  }

  async handleEcc(args = []) {
    const [action = 'info', ...rest] = args;

    if (action === 'info') {
      const info = await this.ecc.getInfo();
      if (!info.installed) {
        console.log(`${colors.yellow}${info.error}${colors.reset}`);
        return;
      }
      console.log(`${colors.cyan}ECC:${colors.reset} ${this.ecc.getEccPath()}`);
      console.log(`  ${colors.dim}Commit:${colors.reset} ${info.gitSha || 'N/A'}`);
      console.log(`  ${colors.dim}Files:${colors.reset} ${info.fileCount} files, ${info.totalMB} MB`);
      console.log(`  ${colors.dim}Sync:${colors.reset} ${info.lastSyncStr}`);
      console.log(`${colors.dim}Commands: ecc browse <section>, ecc search <query>, ecc sync${colors.reset}`);
      return;
    }

    if (action === 'browse') {
      const sectionName = rest.join(' ') || 'skills';
      const result = await this.ecc.browseSection(sectionName);
      if (result.error) {
        console.log(`${colors.red}${result.error}${colors.reset}`);
        return;
      }
      console.log(`${colors.cyan}ECC ${result.section}:${colors.reset} ${result.description}`);
      result.entries?.forEach(entry => console.log(`  ${entry.isDirectory ? '[dir] ' : '[file]'} ${entry.name}`));
      return;
    }

    if (action === 'search') {
      const query = rest.join(' ');
      if (!query) {
        console.log(`${colors.yellow}Usage: winter ecc search <query>${colors.reset}`);
        return;
      }
      const result = await this.ecc.search(query);
      console.log(`${colors.cyan}ECC search "${query}":${colors.reset}`);
      if (result.matches.length === 0) {
        console.log(`  ${colors.dim}No results${colors.reset}`);
        return;
      }
      result.matches.forEach(match => {
        console.log(`  [${match.section}] ${match.isDirectory ? '[dir] ' : '[file]'} ${match.name}`);
        if (match.snippet) {
          console.log(`      ${colors.dim}${match.snippet.substring(0, 100)}${colors.reset}`);
        }
      });
      return;
    }

    if (action === 'sync') {
      await this.ecc.sync();
      return;
    }

    console.log(`${colors.yellow}ECC subcommands: info, browse <section>, search <query>, sync${colors.reset}`);
  }

  async handleHtmlFx(args = []) {
    const [action = 'info', ...rest] = args;

    if (action === 'info') {
      const info = await this.htmlfx.info();
      console.log(`${colors.cyan}html-effectiveness:${colors.reset}`);
      console.log(`  ${colors.dim}Repo:${colors.reset} ${info.repoPath}`);
      console.log(`  ${colors.dim}Binary:${colors.reset} ${info.binaryReady ? 'ready' : 'missing'}`);
      console.log(`${colors.dim}Commands: htmlfx install, htmlfx update, htmlfx list, htmlfx compile -i <input.md> -o <output.html>${colors.reset}`);
      return;
    }

    if (action === 'install' || action === 'update') {
      console.log(`${colors.dim}Preparing html-effectiveness compiler...${colors.reset}`);
      const result = await this.htmlfx.ensureInstalled({ update: action === 'update' });
      console.log(`${colors.green}✓ html-effectiveness ready${colors.reset}`);
      console.log(`  ${colors.dim}Repo:${colors.reset} ${result.repoPath}`);
      console.log(`  ${colors.dim}Binary:${colors.reset} ${result.binaryPath}`);
      return;
    }

    if (action === 'list') {
      const result = await this.htmlfx.listOutputGoal();
      if (!result.success) {
        console.log(`${colors.yellow}${result.error}${colors.reset}`);
        return;
      }
      console.log(`${colors.cyan}output_goal demos:${colors.reset} ${result.outputDir}`);
      result.files.forEach(file => console.log(`  [file] ${file}`));
      return;
    }

    if (action === 'compile') {
      const raw = rest.join(' ');
      const inputMatch = raw.match(/(?:^|\s)-i\s+("[^"]+"|'[^']+'|\S+)/);
      const outputMatch = raw.match(/(?:^|\s)-o\s+("[^"]+"|'[^']+'|\S+)/);
      const inputPath = inputMatch ? inputMatch[1].replace(/^['"]|['"]$/g, '') : null;
      const outputPath = outputMatch ? outputMatch[1].replace(/^['"]|['"]$/g, '') : null;

      if (!inputPath || !outputPath) {
        console.log(`${colors.yellow}Usage: winter htmlfx compile -i <input.md> -o <output.html>${colors.reset}`);
        return;
      }

      const result = await this.htmlfx.compile({ inputPath, outputPath });
      if (!result.success) {
        console.log(`${colors.red}${result.error}${colors.reset}`);
        return;
      }
      console.log(`${colors.green}✓ Compiled HTML:${colors.reset} ${result.outputPath}`);
      if (result.stdout?.trim()) {
        console.log(result.stdout.trim());
      }
      if (result.stderr?.trim()) {
        console.log(`${colors.dim}${result.stderr.trim()}${colors.reset}`);
      }
      return;
    }

    console.log(`${colors.yellow}htmlfx subcommands: info, install, update, list, compile -i <input.md> -o <output.html>${colors.reset}`);
  }

  async handleDebug(args) {
    const task = args.join(' ') || 'Find the root cause, patch it, and verify with the closest test or build command';
    return this.handleChat([`AUTO DEBUG: ${task}`]);
  }

  async inferVerificationCommands(task = '') {
    const candidates = [];
    const packagePath = path.join(this.projectPath, 'package.json');
    try {
      const pkg = JSON.parse(await fs.readFile(packagePath, 'utf8'));
      const scripts = pkg.scripts || {};
      if (scripts.test) candidates.push('npm test');
      if (scripts.build && /\b(build|compile|type|typescript|tsc|frontend|ui|debug|fix|bug|error)\b/i.test(task)) {
        candidates.push('npm run build');
      }
      if (scripts.lint && /\b(lint|style|eslint|quality|review)\b/i.test(task)) {
        candidates.push('npm run lint');
      }
      if (scripts.typecheck) {
        candidates.push('npm run typecheck');
      }
    } catch {
      // Not a Node.js project or missing package.json
    }
    if (candidates.length === 0) return ['npm test'];
    return [...new Set(candidates)].slice(0, 3);
  }

  parseAutopilotArgs(args = []) {
    const taskParts = [];
    const verifyParts = [];
    let maxLoops = 3;
    let hasCustomVerify = false;

    for (let i = 0; i < args.length; i++) {
      const token = String(args[i] || '');
      if (token === '--max-loops' && args[i + 1]) {
        const parsed = parseInt(args[i + 1], 10);
        if (!Number.isNaN(parsed)) {
          maxLoops = Math.min(10, Math.max(1, parsed));
        }
        i += 1;
        continue;
      }
      if (token === '--verify' && args[i + 1]) {
        const raw = String(args[i + 1]).trim();
        if (raw) {
          hasCustomVerify = true;
          verifyParts.push(...raw.split(';').map(part => part.trim()).filter(Boolean));
        }
        i += 1;
        continue;
      }
      taskParts.push(token);
    }

    return {
      task: taskParts.join(' ').trim() || 'Diagnose the issue, patch safely, and verify with tests/build',
      verifyParts,
      maxLoops,
      hasCustomVerify,
    };
  }

  async handleAutopilot(args) {
    const parsed = this.parseAutopilotArgs(args);
    const verifyCommands = parsed.hasCustomVerify
      ? parsed.verifyParts
      : await this.inferVerificationCommands(parsed.task);
    const prompt = `AUTOPILOT TASK: ${parsed.task}

EXECUTION CONTRACT:
1. Inspect relevant files and establish the smallest root cause.
2. Apply focused edits only where needed.
3. Run verification commands after changes: ${verifyCommands.join(' && ')}.
4. If verification fails, iterate up to ${parsed.maxLoops} loops: inspect new failure -> patch -> rerun verification.
5. Do not claim success without concrete verification output.
6. End with: what changed, what was verified, and remaining risks.`;

    console.log(`${colors.dim}Autopilot mode engaged...${colors.reset}`);
    return this.handleChat([prompt]);
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
        console.log(`${colors.dim}Skills System: Strong · skill-creator · TypeScript definitions${colors.reset}`);
        skills.forEach(s => {
          const mode = s.mode ? ` ${colors.dim}[${s.mode}]${colors.reset}` : '';
          console.log(`  ${s.icon} ${s.name}${mode} - ${s.description}`);
        });
        break;
      case 'enable':
        await this.skills.enableSkill(rest[0]);
        console.log(`${statusIcons.success} Enabled: ${rest[0]}`);
        break;
      case 'create':
        await this.skills.createSkill(rest[0]);
        console.log(`${statusIcons.success} Created skill: ${rest[0]} (${colors.dim}skill-creator${colors.reset})`);
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

  buildPlanOptions(task, workflow, blueprint) {
    const verify = workflow.verificationStrategy?.length
      ? workflow.verificationStrategy
      : ['unit tests', 'build check'];
    const arch = blueprint?.architecture || ['Define scope and modules', 'Implement feature slices'];
    const scaffold = blueprint?.scaffold || ['Initialize project structure', 'Install required dependencies'];

    return [
      {
        id: 'mvp',
        title: 'MVP nhanh',
        description: 'Tập trung làm bản chạy được sớm nhất, ít rủi ro.',
        steps: [
          ...scaffold.slice(0, 2),
          ...arch.slice(0, 2),
          `Verify: ${verify.slice(0, 2).join(', ')}`,
        ],
      },
      {
        id: 'balanced',
        title: 'Balanced chuẩn',
        description: 'Cân bằng tốc độ và chất lượng, phù hợp đa số task production.',
        steps: [
          ...scaffold.slice(0, 3),
          ...arch,
          `Apply skills: ${(workflow.recommendedSkills || []).join(', ') || 'coding, test'}`,
          `Verify: ${verify.join(', ')}`,
        ],
      },
      {
        id: 'hardening',
        title: 'Production hardening',
        description: 'Ưu tiên độ chắc: kiến trúc, kiểm thử, bảo mật, hiệu năng.',
        steps: [
          ...scaffold,
          ...arch,
          'Add observability, error handling, and rollback-safe changes.',
          'Add edge-case and regression tests before release.',
          `Verify: ${verify.join(', ')}`,
        ],
      },
      {
        id: 'custom',
        title: 'Custom',
        description: 'Tự nhập plan theo ý bạn.',
        steps: [],
      },
    ];
  }

  parsePlanFetchArgs(args = []) {
    const flags = {
      exportFormat: null,
      outputPath: null,
      apply: false,
    };
    const taskTokens = [];

    for (let i = 0; i < args.length; i++) {
      const token = String(args[i] || '').trim();
      if (token === '--apply') {
        flags.apply = true;
        continue;
      }
      if (token === '--export') {
        const raw = String(args[i + 1] || '').trim().toLowerCase();
        if (raw === 'md' || raw === 'markdown') flags.exportFormat = 'md';
        if (raw === 'json') flags.exportFormat = 'json';
        i += 1;
        continue;
      }
      if (token === '--output' || token === '-o') {
        flags.outputPath = String(args[i + 1] || '').trim() || null;
        i += 1;
        continue;
      }
      taskTokens.push(token);
    }

    return { task: taskTokens.join(' ').trim(), ...flags };
  }

  buildPlanArtifactFileName(task, format = 'md') {
    const stem = String(task || 'plan')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'plan';
    return `${stem}.${format}`;
  }

  resolvePlanOutputPath(task, format, outputPath = null) {
    if (outputPath) {
      return path.isAbsolute(outputPath)
        ? outputPath
        : path.join(this.projectPath, outputPath);
    }
    return path.join(
      this.projectPath,
      '.winter',
      'plans',
      this.buildPlanArtifactFileName(task, format)
    );
  }

  buildPlanSlug(task) {
    return String(task || 'plan')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'plan';
  }

  getPlanScaffoldSpec(task, workflow = {}) {
    const slug = this.buildPlanSlug(task);
    const featureName = slug.replace(/-/g, ' ');
    const profile = String(workflow.profile || 'general');
    const family = profile.split('-')[0] || 'general';

    const common = {
      dirs: ['docs', 'tests'],
      files: {
        'docs/plan-notes.md': [
          `# ${featureName}`,
          '',
          `- Profile: ${profile}`,
          '- Status: scaffolded by Winter plan apply',
          '',
        ].join('\n'),
        'tests/README.md': [
          '# Test Plan',
          '',
          '- Add smoke tests for the generated plan.',
          '- Keep verification commands close to the final implementation stack.',
          '',
        ].join('\n'),
      },
    };

    const specs = {
      webapp: {
        dirs: ['src/app', `src/features/${slug}`, 'src/components', 'src/lib', 'tests/e2e'],
        files: {
          [`src/features/${slug}/README.md`]: `# ${featureName}\n\nFeature slice for the plan.\n`,
          [`src/features/${slug}/tasks.md`]: '',
          'tests/e2e/README.md': '# E2E Tests\n\nAdd Playwright or browser smoke tests here.\n',
        },
      },
      mobile: {
        dirs: ['src/navigation', `src/features/${slug}`, 'src/screens', 'src/services', 'src/components', 'src/state', 'tests'],
        files: {
          [`src/features/${slug}/README.md`]: `# ${featureName}\n\nMobile feature module for screens, hooks, API calls, and state.\n`,
          [`src/features/${slug}/tasks.md`]: '',
          'src/navigation/README.md': '# Navigation\n\nDefine app navigation graph and route ownership here.\n',
          'src/services/README.md': '# Services\n\nPlace API clients, storage adapters, and platform services here.\n',
        },
      },
      backend: {
        dirs: [`src/modules/${slug}`, `src/modules/${slug}/dto`, `src/modules/${slug}/tests`, 'src/config', 'src/common'],
        files: {
          [`src/modules/${slug}/README.md`]: `# ${featureName}\n\nBackend module scaffold for routes/controllers/services/tests.\n`,
          [`src/modules/${slug}/tasks.md`]: '',
          'src/config/README.md': '# Config\n\nDocument environment variables and runtime config here.\n',
        },
      },
      desktop: {
        dirs: ['src/main', 'src/preload', 'src/renderer', `src/features/${slug}`, 'tests'],
        files: {
          [`src/features/${slug}/README.md`]: `# ${featureName}\n\nDesktop feature module scaffold.\n`,
          [`src/features/${slug}/tasks.md`]: '',
          'src/main/README.md': '# Main Process\n\nKeep privileged runtime code here.\n',
          'src/preload/README.md': '# Preload\n\nExpose minimal validated IPC APIs here.\n',
        },
      },
      ai: {
        dirs: ['src/ingestion', 'src/retrieval', 'src/generation', 'src/evals', `src/features/${slug}`],
        files: {
          [`src/features/${slug}/README.md`]: `# ${featureName}\n\nAI feature scaffold for pipeline wiring and evals.\n`,
          [`src/features/${slug}/tasks.md`]: '',
          'src/evals/README.md': '# Evals\n\nTrack regression prompts, datasets, and quality thresholds here.\n',
        },
      },
    };

    const spec = specs[family] || {
      dirs: [`src/features/${slug}`, 'src/lib', 'tests'],
      files: {
        [`src/features/${slug}/README.md`]: `# ${featureName}\n\nFeature scaffold generated from Winter plan apply.\n`,
        [`src/features/${slug}/tasks.md`]: '',
      },
    };

    return {
      slug,
      family,
      dirs: [...common.dirs, ...spec.dirs],
      files: { ...common.files, ...spec.files },
    };
  }

  async writeFileIfMissing(filePath, content) {
    try {
      await fs.writeFile(filePath, content, { encoding: 'utf8', flag: 'wx' });
      return true;
    } catch (error) {
      if (error?.code === 'EEXIST') return false;
      throw error;
    }
  }

  async applyPlanProfileScaffold({ task, selected, workflow }) {
    const spec = this.getPlanScaffoldSpec(task, workflow);
    const created = [];
    const skipped = [];

    for (const dir of spec.dirs) {
      const dirPath = path.join(this.projectPath, dir);
      await fs.mkdir(dirPath, { recursive: true });
      created.push(dir);
    }

    const taskListContent = [
      `# ${selected.title}`,
      '',
      `- Task: ${task}`,
      `- Profile: ${workflow.profile}`,
      '',
      '## Steps',
      ...selected.steps.map(step => `- [ ] ${step}`),
      '',
    ].join('\n');

    const files = { ...spec.files };
    for (const fileName of Object.keys(files)) {
      if (fileName.endsWith('/tasks.md')) {
        files[fileName] = taskListContent;
      }
    }

    for (const [relativePath, content] of Object.entries(files)) {
      const filePath = path.join(this.projectPath, relativePath);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      const didCreate = await this.writeFileIfMissing(filePath, content);
      (didCreate ? created : skipped).push(relativePath);
    }

    return { ...spec, created, skipped };
  }

  async exportPlanArtifact({ task, workflow, selected, outputPath, format = 'md' }) {
    const normalizedFormat = format === 'json' ? 'json' : 'md';
    const finalPath = this.resolvePlanOutputPath(task, normalizedFormat, outputPath);
    await fs.mkdir(path.dirname(finalPath), { recursive: true });

    if (normalizedFormat === 'json') {
      const jsonPayload = {
        generatedAt: new Date().toISOString(),
        task,
        profile: workflow.profile,
        depth: workflow.depth,
        plan: {
          id: selected.id,
          title: selected.title,
          description: selected.description,
          steps: selected.steps,
        },
      };
      await fs.writeFile(finalPath, `${JSON.stringify(jsonPayload, null, 2)}\n`, 'utf8');
      return finalPath;
    }

    const markdown = [
      '# Winter Plan',
      '',
      `- Task: ${task}`,
      `- Profile: ${workflow.profile}`,
      `- Depth: ${workflow.depth}`,
      '',
      `## ${selected.title}`,
      '',
      selected.description,
      '',
      '## Steps',
      ...selected.steps.map((step, index) => `${index + 1}. ${step}`),
      '',
    ].join('\n');
    await fs.writeFile(finalPath, markdown, 'utf8');
    return finalPath;
  }

  async applyPlanSkeleton({ task, selected, workflow, exportPath = null }) {
    const scaffold = await this.applyPlanProfileScaffold({ task, selected, workflow });
    const targetPath = path.join(this.projectPath, '.winter', 'plan-task-list.md');
    const skeleton = [
      '# Plan Task List',
      '',
      `- Task: ${task}`,
      `- Profile: ${workflow.profile}`,
      `- Plan: ${selected.title}`,
      ...(exportPath ? [`- Plan File: ${path.relative(this.projectPath, exportPath) || exportPath}`] : []),
      `- Scaffold Profile: ${scaffold.family}`,
      '',
      '## TODO',
      ...selected.steps.map(step => `- [ ] ${step}`),
      '',
      '## Scaffold Created',
      ...scaffold.created.map(item => `- ${item}`),
      ...(scaffold.skipped.length ? ['', '## Existing Files Kept', ...scaffold.skipped.map(item => `- ${item}`)] : []),
      '',
    ].join('\n');
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, skeleton, 'utf8');
    return targetPath;
  }

  async promptPlanSelection(options) {
    if (!process.stdin.isTTY) return 'balanced';

    console.log(`\n${colors.cyan}Chọn plan:${colors.reset}`);
    options.forEach((opt, index) => {
      console.log(`  ${index + 1}. ${opt.title} - ${opt.description}`);
    });
    console.log(`  c. Custom`);

    const rl = readline.createInterface({ input, output });
    try {
      const answer = (await rl.question(`${colors.yellow}Nhập lựa chọn (1-${options.length} hoặc c): ${colors.reset}`)).trim().toLowerCase();
      if (answer === 'c') return 'custom';
      const idx = Number.parseInt(answer, 10);
      if (!Number.isNaN(idx) && idx >= 1 && idx <= options.length) {
        return options[idx - 1].id;
      }
      return 'balanced';
    } finally {
      rl.close();
    }
  }

  async handlePlan(args = []) {
    const [action = 'fetch', ...rest] = args;
    if (action !== 'fetch') {
      console.log(`${colors.yellow}Usage: winter plan fetch <task> [--export md|json] [--output <path>] [--apply]${colors.reset}`);
      return;
    }

    const parsed = this.parsePlanFetchArgs(rest);
    const task = parsed.task;
    if (!task) {
      console.log(`${colors.yellow}Usage: winter plan fetch <task> [--export md|json] [--output <path>] [--apply]${colors.reset}`);
      return;
    }

    const [signals, catalog] = await Promise.all([
      this.contextLoader.getProjectSignals(),
      this.contextLoader.getStartupSkillCatalog(),
    ]);
    const workflow = selectWorkflow({
      taskText: task,
      projectSignals: signals,
      skillCatalog: Array.isArray(catalog) ? catalog : [...catalog],
    });
    const blueprint = getProfileBlueprint(workflow.profile);
    const options = this.buildPlanOptions(task, workflow, blueprint);
    const choice = await this.promptPlanSelection(options);

    let selected = options.find(opt => opt.id === choice) || options.find(opt => opt.id === 'balanced');
    let customSteps = null;

    if (choice === 'custom' && process.stdin.isTTY) {
      const rl = readline.createInterface({ input, output });
      try {
        const title = (await rl.question(`${colors.yellow}Tên plan custom: ${colors.reset}`)).trim() || 'Custom Plan';
        const rawSteps = (await rl.question(`${colors.yellow}Nhập steps (ngăn bởi dấu ;): ${colors.reset}`)).trim();
        customSteps = rawSteps.split(';').map(step => step.trim()).filter(Boolean);
        selected = {
          id: 'custom',
          title,
          description: 'Plan tùy chỉnh bởi user',
          steps: customSteps,
        };
      } finally {
        rl.close();
      }
    }

    console.log(`\n${colors.cyan}Plan selected:${colors.reset} ${selected.title}`);
    console.log(`${colors.dim}Profile: ${workflow.profile} | Depth: ${workflow.depth}${colors.reset}`);
    selected.steps.forEach((step, index) => console.log(`  ${index + 1}. ${step}`));

    if (typeof this.session.createPlan === 'function') {
      const plan = await this.session.createPlan(selected.title, `${selected.description}\nTask: ${task}`);
      if (plan && typeof this.session.addPlanStep === 'function') {
        for (const step of selected.steps) {
          await this.session.addPlanStep(plan.id, { description: step });
        }
      }
      console.log(`${colors.green}✓ Plan saved to session${colors.reset}`);
    } else {
      console.log(`${colors.dim}Session does not support persistent plans in this mode.${colors.reset}`);
    }

    let exportedPath = null;
    if (parsed.exportFormat) {
      exportedPath = await this.exportPlanArtifact({
        task,
        workflow,
        selected,
        outputPath: parsed.outputPath,
        format: parsed.exportFormat,
      });
      console.log(`${colors.green}✓ Plan exported: ${exportedPath}${colors.reset}`);
    }

    if (parsed.apply) {
      const appliedPath = await this.applyPlanSkeleton({
        task,
        selected,
        workflow,
        exportPath: exportedPath,
      });
      console.log(`${colors.green}✓ Skeleton task list applied: ${appliedPath}${colors.reset}`);
    }
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
  winter autopilot <task>    Autonomous fix + verify loop prompt
  winter autopilot <task> --max-loops <n> --verify "cmd1;cmd2"
  winter plan fetch <task> [--export md|json] [--output <path>] [--apply]

${colors.white}Session Management:${colors.reset}
  winter session             Show current session
  winter session new         Create new session
  winter session save        Save current session
  winter session list        List all sessions
  winter session switch <id> Switch session

  /remember <text>           Add to memory
  /memories                  Show memories
  /memory-vault [list]       Show TokenJuice markdown vault
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

${colors.white}Local Resources:${colors.reset}
  winter resources            Show bundled resource manifest
  winter ecc [info]           Show ECC resource status
  winter ecc browse <section> Browse ECC sections
  winter ecc search <query>   Search ECC resources
  winter htmlfx [info]        html-effectiveness integration
  winter htmlfx install       Clone + build html-effectiveness-scripts
  winter htmlfx compile -i <md> -o <html>  Compile hybrid markdown to HTML
  winter page-agent           Browse Page Agent resources
  winter page-agent search <q> Search Page Agent resources

${colors.white}AI Providers:${colors.reset}
  Anthropic (Claude), OpenAI (GPT-4), Ollama, Groq

${colors.white}Configuration:${colors.reset}
  winter config              Show config
  winter init                Initialize

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `);
  }
}
