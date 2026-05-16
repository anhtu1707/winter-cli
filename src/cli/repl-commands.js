import path from 'path';
import { colors } from './snowflake-logo.js';
import { SLASH_COMMANDS } from './slash-commands.js';

/**
 * Handle slash commands in the Winter REPL.
 * Delegated from WinterREPL.handleSlashCommand to reduce file size.
 */
export async function handleSlashCommand(repl, input) {
  const parts = input.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);

  switch (cmd) {
    // Project commands
    case '/project':
    case '/pwd':
      console.log(`${colors.cyan}${repl.projectPath}${colors.reset}`);
      break;
    case '/cd':
      if (args[0]) {
        repl.projectPath = path.resolve(args[0]);
        console.log(`${colors.green}✓ Changed to: ${repl.projectPath}${colors.reset}`);
      }
      break;

    // Session commands
    case '/session':
      console.log(`${colors.cyan}Session: ${repl.session.getSessionId().substring(0, 8)}${colors.reset}`);
      break;
    case '/sessions':
      const sessions = await repl.session.listSessions();
      console.log(`${colors.cyan}Sessions:${colors.reset}`);
      sessions.forEach(s => console.log(`  ${s.id.substring(0, 8)} - ${s.createdAt}`));
      break;
    case '/clear':
      console.clear();
      break;

    // Memory commands
    case '/remember':
      if (args.length > 0) {
        await repl.session.addToMemory(args.join(' '));
        console.log(`${colors.green}✓ Remembered${colors.reset}`);
      }
      break;
    case '/memories':
      const memories = repl.session.getMemory();
      if (memories.length === 0) {
        console.log(`${colors.dim}No memories${colors.reset}`);
      } else {
        console.log(`${colors.cyan}Memories:${colors.reset}`);
        memories.slice(-10).forEach(m => console.log(`  ${colors.dim}•${colors.reset} ${m.text}`));
      }
      break;
    case '/forget':
      await repl.session.clearMemory(args.length > 0 ? args.join(' ') : null);
      console.log(`${colors.green}✓ Memories cleared${colors.reset}`);
      break;

    case '/compress':
      await repl.compressSessionContext(true);
      break;

    // Git Auto-Pilot
    case '/commit':
      await repl.runAutoCommit(args.join(' '));
      return;
    case '/review':
      await repl.runCodeReview(args.join(' '));
      return;
    case '/diff':
      await repl.showDiff(args);
      return;
    case '/watch':
      await repl.handleWatchCommand(args);
      return;
    case '/stats':
      repl.showToolStats();
      return;
    case '/replay':
      repl.showReplay(args[0] ? parseInt(args[0]) : 20);
      return;
    case '/swe':
      console.log(`${colors.cyan}Running SWE Agent...${colors.reset}`);
      const result = await repl.runAgent('swe', args.join(' '));
      console.log(result);
      break;

    // Planning
    case '/plan':
    case '/plans':
      const plans = repl.session.getPlans();
      if (plans.length === 0) {
        console.log(`${colors.dim}No plans${colors.reset}`);
      } else {
        console.log(`${colors.cyan}Plans:${colors.reset}`);
        plans.forEach(p => console.log(`  [${p.status}] ${p.title}`));
      }
      break;
    case '/task':
    case '/tasks':
      console.log(`${colors.cyan}Tasks:${colors.reset}`);
      try {
        const tasks = await repl.tools.execute('TaskList', {});
        if (tasks?.tasks?.length > 0) {
          tasks.tasks.forEach(t => console.log(`  [${t.status}] ${t.title}`));
        } else {
          console.log(`  ${colors.dim}No tasks${colors.reset}`);
        }
      } catch {
        console.log(`  ${colors.dim}Could not list tasks${colors.reset}`);
      }
      break;

    // Subagent
    case '/agent':
      if (args.length < 2) {
        console.log(`${colors.yellow}Usage: /agent <role> <task>${colors.reset}`);
        break;
      }
      const [role, ...taskParts] = args;
      const agentResult = await repl.runAgent(role, taskParts.join(' '));
      console.log(agentResult);
      break;

    // Tool shortcuts
    case '/read':
      if (args.length === 0) {
        console.log(`${colors.yellow}Usage: /read <file>${colors.reset}`);
        break;
      }
      try {
        const readResult = await repl.tools.execute('Read', { file_path: args[0] });
        if (readResult.success) {
          console.log(readResult.content);
        }
      } catch (e) {
        console.log(`${colors.red}Error reading file: ${e.message}${colors.reset}`);
      }
      break;
    case '/write':
      console.log(`${colors.yellow}Use the 'Write' tool in chat mode.${colors.reset}`);
      break;
    case '/bash':
      if (args.length === 0) {
        console.log(`${colors.yellow}Usage: /bash <command>${colors.reset}`);
        break;
      }
      try {
        const bashResult = await repl.tools.execute('Bash', { command: args.join(' ') });
        if (bashResult.success) {
          console.log(bashResult.stdout || bashResult.stdout_truncated || '(empty)');
          if (bashResult.stderr) console.error(bashResult.stderr);
        } else {
          console.log(`${colors.red}Command failed: ${bashResult.error}${colors.reset}`);
        }
      } catch (e) {
        console.log(`${colors.red}Error: ${e.message}${colors.reset}`);
      }
      break;
    case '/glob':
      if (args.length === 0) {
        console.log(`${colors.yellow}Usage: /glob <pattern>${colors.reset}`);
        break;
      }
      try {
        const globResult = await repl.tools.execute('Glob', { pattern: args[0] });
        if (globResult.success && globResult.files) {
          globResult.files.forEach(f => console.log(`  ${f}`));
        }
      } catch (e) {
        console.log(`${colors.red}Error: ${e.message}${colors.reset}`);
      }
      break;
    case '/grep':
      if (args.length < 1) {
        console.log(`${colors.yellow}Usage: /grep <pattern> [path]${colors.reset}`);
        break;
      }
      try {
        const grepResult = await repl.tools.execute('Grep', {
          pattern: args[0],
          path: args[1] || repl.projectPath,
        });
        if (grepResult.success) {
          grepResult.matches?.forEach(m => console.log(`  ${m}`));
        }
      } catch (e) {
        console.log(`${colors.red}Error: ${e.message}${colors.reset}`);
      }
      break;
    case '/image':
      if (args.length === 0) {
        console.log(`${colors.yellow}Usage: /image <path>${colors.reset}`);
        break;
      }
      const image = await repl.loadImageAsBase64(args[0]);
      if (image) {
        await repl.chat('Analyze this image', [image]);
      } else {
        console.log(`${colors.red}Could not load image${colors.reset}`);
      }
      return;
    case '/paste':
      const clipboard = await repl.getClipboardContent();
      if (clipboard) {
        await repl.chat(`Here is clipboard content:\n\n${clipboard}`);
      } else {
        console.log(`${colors.red}No clipboard content found${colors.reset}`);
      }
      return;

    // AI / Plan generation
    case '/auto':
    case '/tdd':
      const task = args.join(' ') || 'Run tests until they pass';
      await repl.runAutoHealing(task);
      return;
    case '/plan:':
    case '/plan-gen':
      if (args.length === 0) {
        console.log(`${colors.yellow}Usage: /plan <task>${colors.reset}`);
        break;
      }
      await repl.generateInteractivePlan(args.join(' '));
      break;

    // Design system
    case '/design':
      console.log(`${colors.yellow}Design commands:${colors.reset}`);
      console.log(`  /design add <name> — Add a design system`);
      console.log(`  /design search <query> — Search design systems`);
      break;
    case '/designs':
      await repl.showDesignSystems();
      break;

    // Skills
    case '/skill':
      console.log(`${colors.yellow}Skill commands:${colors.reset}`);
      console.log(`  winter skill create <name> — Create a skill`);
      console.log(`  winter skill list — List skills`);
      break;
    case '/skills':
      await repl.showAllLocalSkills();
      break;

    // Plugin
    case '/plugin':
      console.log(`${colors.yellow}Plugin commands:${colors.reset}`);
      console.log(`  winter plugin install <url>`);
      console.log(`  winter plugin list`);
      break;

    // Resource access
    case '/codex':
    case '/codex-bundled-resources':
      await repl.showResourceGroup('codex');
      break;
    case '/claude':
    case '/claude-bundled-resources':
      await repl.showResourceGroup('claude');
      break;
    case '/karpathy':
      await repl.showKarpathyResources();
      break;
    case '/agents':
      await repl.showAgentsFile();
      break;
    case '/resources':
      await repl.showResourceManifest();
      break;

    // Provider / Model
    case '/provider':
    case '/providers':
      if (args[0]) {
        const providerName = args[0].trim().toLowerCase();
        const switched = typeof repl.ai?.switchProvider === 'function'
          ? await repl.ai.switchProvider(providerName)
          : (repl.ai?.setProvider ? repl.ai.setProvider(providerName) : null);
        if (switched) {
          await repl.config?.setDefaultProvider?.(switched);
          console.log(`${colors.green}✓ Provider: ${switched}${colors.reset}`);
        } else {
          const available = repl.ai?.listProviders?.().map(p => p.name).join(', ') || 'none';
          console.log(`${colors.red}Unknown provider: ${providerName}${colors.reset}`);
          console.log(`${colors.dim}Available: ${available}${colors.reset}`);
        }
      } else {
        await repl.showModels();
      }
      break;
    case '/model':
      if (args[0]) {
        const providerName = repl.ai?.getActiveProvider?.();
        const model = args.join(' ');
        if (!providerName) {
          console.log(`${colors.red}No active provider${colors.reset}`);
          break;
        }
        await repl.config?.setProviderModel?.(providerName, model);
        if (repl.ai?.providers?.[providerName]) {
          repl.ai.providers[providerName].model = model;
        }
        repl.ai?.updateActiveModelTier?.();
        console.log(`${colors.green}OK Model for ${providerName}: ${model}${colors.reset}`);
      } else {
        const providerName = repl.ai?.getActiveProvider?.();
        console.log(`${colors.cyan}Model: ${repl.ai?.providers?.[providerName]?.model || 'unknown'}${colors.reset}`);
      }
      break;
    case '/models':
      await repl.showModels();
      break;
    case '/config':
      const config = await repl.config.load();
      console.log(`\n${colors.cyan}Config:${colors.reset}`);
      console.log(
        `  Default provider: ${config.defaultProvider || 'not set'}\n` +
        `  Model: ${repl.ai?.providers?.[repl.ai?.getActiveProvider?.()]?.model || 'unknown'}`
      );
      break;
    case '/mcp':
      await repl.handleMcpCommand(args);
      return;
    case '/permissions':
      await repl.handlePermissionsCommand(args);
      return;

    // Help & Exit
    case '/help':
    case '/?':
    case '/':
      repl.showHelp();
      break;
    case '/exit':
    case '/quit':
      console.log(`${colors.green}Goodbye!${colors.reset}`);
      process.exit(0);
      break;

    default: {
      // Fuzzy match: suggest closest command
      const allCommands = SLASH_COMMANDS.map(c => c.cmd);
      const closest = allCommands.filter(c => c.startsWith(cmd) || cmd.startsWith(c));
      if (closest.length > 0) {
        console.log(`${colors.yellow}Unknown command: ${cmd}${colors.reset}`);
        console.log(`${colors.dim}Did you mean: ${closest.join(', ')}?${colors.reset}`);
      } else if (cmd.startsWith('/')) {
        console.log(`${colors.yellow}Unknown: ${cmd}. Type /help for commands.${colors.reset}`);
      }
    }
  }
}
