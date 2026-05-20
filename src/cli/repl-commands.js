import path from 'path';
import { promises as fs } from 'fs';
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
    // Codebase Index commands
    case '/index':
      await repl.codebaseIndex(args[0] === 'full');
      return;
    case '/search':
      if (args.length === 0) {
        console.log(`${colors.yellow}Usage: /search <query>${colors.reset}`);
        break;
      }
      await repl.codebaseSearch(args.join(' '));
      return;
    case '/search-def':
      if (args.length === 0) {
        console.log(`${colors.yellow}Usage: /search-def <symbol-name>${colors.reset}`);
        break;
      }
      await repl.codebaseFindDef(args.join(' '));
      return;
    case '/undo':
      await repl.undoLastChange(args.join(' '));
      return;

    // Composer Mode
    case '/composer':
    case '/compose':
      if (args.length === 0) {
        console.log(`${colors.yellow}Usage: /composer <task> — multi-file editing mode${colors.reset}`);
        console.log(`  ${colors.dim}Sub-commands: /composer apply, /composer reject, /composer list${colors.reset}`);
        break;
      }
      const subCmd = args[0].toLowerCase();
      if (subCmd === 'apply') {
        if (repl.composer) await repl.composer.applyAll();
        else console.log(`${colors.yellow}No active composer session${colors.reset}`);
      } else if (subCmd === 'reject') {
        if (repl.composer) await repl.composer.rejectAll();
        else console.log(`${colors.yellow}No active composer session${colors.reset}`);
      } else if (subCmd === 'list') {
        if (repl.composer) await repl.composer.listChanges();
        else console.log(`${colors.yellow}No active composer session${colors.reset}`);
      } else {
        if (repl.composer) {
          await repl.composer.compose(args.join(' '));
        } else {
          console.log(`${colors.yellow}Composer not initialized. Use /composer <task> to start.${colors.reset}`);
        }
      }
      return;

    // ECC Resource Browser
    case '/ecc':
      if (!repl.eccManager && repl.initCodebaseSearch) {
        await repl.initCodebaseSearch();
      }
      if (args.length === 0) {
        if (repl.eccManager) {
          await repl.eccManager.showSummary();
        } else {
          console.log(`${colors.yellow}ECC not initialized. Use /ecc sync to clone.${colors.reset}`);
        }
        break;
      }
      const eccSub = args[0].toLowerCase();
      const eccArgs = args.slice(1).join(' ');
      if (!repl.eccManager) {
        console.log(`${colors.yellow}ECC not initialized.${colors.reset}`);
        break;
      }
      switch (eccSub) {
        case 'info':
          const info = await repl.eccManager.getInfo();
          if (info.installed) {
            console.log(`\n${colors.cyan}ECC Info:${colors.reset}`);
            console.log(`  ${colors.dim}Commit:${colors.reset} ${info.gitSha || 'N/A'}`);
            console.log(`  ${colors.dim}Files:${colors.reset} ${info.fileCount} files, ${info.totalMB} MB`);
            console.log(`  ${colors.dim}Directories:${colors.reset} ${info.dirCount}`);
            console.log(`  ${colors.dim}Sync:${colors.reset} ${info.lastSyncStr}`);
          } else {
            console.log(`${colors.yellow}${info.error}${colors.reset}`);
          }
          break;
        case 'browse':
          const sectionName = args.slice(1).join(' ') || 'skills';
          const result = await repl.eccManager.browseSection(sectionName);
          if (result.error) {
            console.log(`${colors.red}${result.error}${colors.reset}`);
          } else {
            console.log(`\n${colors.cyan}ECC ${result.section}:${colors.reset} ${result.description}`);
            if (result.entries) {
              result.entries.forEach(e => {
                const icon = e.isDirectory ? '📂' : '📄';
                console.log(`  ${icon} ${e.name}`);
              });
            }
          }
          break;
        case 'search':
          if (!eccArgs) {
            console.log(`${colors.yellow}Usage: /ecc search <query>${colors.reset}`);
            break;
          }
          const searchResult = await repl.eccManager.search(eccArgs);
          console.log(`\n${colors.cyan}ECC Search "${eccArgs}":${colors.reset}`);
          if (searchResult.matches.length === 0) {
            console.log(`  ${colors.dim}No results${colors.reset}`);
          } else {
            searchResult.matches.forEach(m => {
              const icon = m.isDirectory ? '📂' : '📄';
              console.log(`  ${icon} [${m.section}] ${m.name}`);
            });
          }
          break;
        case 'sync':
          await repl.eccManager.sync();
          break;
        default:
          console.log(`${colors.yellow}ECC subcommands: info, browse <section>, search <query>, sync${colors.reset}`);
      }
      return;

    // Multi-Model Orchestration
    case '/ensemble':
      if (args.length === 0) {
        console.log(`${colors.yellow}Usage: /ensemble <prompt>${colors.reset}`);
        break;
      }
      if (repl.orchestrator) {
        const result = await repl.orchestrator.ensemble(args.join(' '));
        if (result.error) {
          console.log(`${colors.red}${result.error}${colors.reset}`);
        } else {
          console.log(`\n${colors.cyan}=== Ensemble Results ===${colors.reset}`);
          for (const [name, r] of Object.entries(result.results)) {
            if (r.error) {
              console.log(`\n${colors.red}${name}: ${r.error}${colors.reset}`);
            } else {
              console.log(`\n${colors.green}${name}${colors.reset} (${r.model}) ${colors.dim}${r.ms.toFixed(0)}ms${colors.reset}`);
              console.log(`${colors.dim}${'─'.repeat(50)}${colors.reset}`);
              console.log(r.content.slice(0, 1500));
              if (r.content.length > 1500) console.log(`${colors.dim}... (${r.content.length - 1500} more chars)${colors.reset}`);
            }
          }
        }
      } else {
        console.log(`${colors.yellow}Orchestrator not initialized.${colors.reset}`);
      }
      return;

    case '/vote':
      if (args.length === 0) {
        console.log(`${colors.yellow}Usage: /vote <prompt>${colors.reset}`);
        break;
      }
      if (repl.orchestrator) {
        const result = await repl.orchestrator.vote(args.join(' '));
        if (result.error) {
          console.log(`${colors.red}${result.error}${colors.reset}`);
        } else {
          console.log(`\n${colors.cyan}=== Vote Results ===${colors.reset}`);
          if (result.winner) {
            const winner = result.results[result.winner];
            console.log(`\n${colors.green}🏆 Winner: ${result.winner} (${winner.model})${colors.reset}`);
            console.log(`${colors.dim}${'─'.repeat(50)}${colors.reset}`);
            console.log(winner.content.slice(0, 2000));
            if (winner.content.length > 2000) console.log(`${colors.dim}... (${winner.content.length - 2000} more chars)${colors.reset}`);
          }
        }
      } else {
        console.log(`${colors.yellow}Orchestrator not initialized.${colors.reset}`);
      }
      return;

    case '/orchestrate':
      if (args.length === 0) {
        console.log(`${colors.yellow}Usage: /orchestrate <task>${colors.reset}`);
        break;
      }
      if (repl.orchestrator) {
        const result = await repl.orchestrator.orchestrate(args.join(' '));
        if (result.taskInfo) {
          console.log(`\n${colors.cyan}=== Pipeline Result ===${colors.reset}`);
          if (result.merged) {
            console.log(`\n${colors.bright}Merged Result:${colors.reset}`);
            console.log(`${colors.dim}${'─'.repeat(50)}${colors.reset}`);
            console.log(result.merged.slice(0, 3000));
            if (result.merged.length > 3000) {
              console.log(`${colors.dim}... (${result.merged.length - 3000} more chars)${colors.reset}`);
            }
          }
          if (result.review?.assessment) {
            console.log(`\n${colors.dim}Review:${colors.reset} ${result.review.assessment}`);
          }
        }
      } else {
        console.log(`${colors.yellow}Orchestrator not initialized.${colors.reset}`);
      }
      return;

    // Browse URL
    case '/browse':
      if (args.length === 0) {
        console.log(`${colors.yellow}Usage: /browse <url>${colors.reset}`);
        break;
      }
      {
        const url = args[0].replace(/^['"]|['"]$/g, '');
        console.log(`${colors.cyan}🌐 Đang mở: ${url}${colors.reset}`);
        try {
          // Thử WebFetch trước (nhanh, lấy text)
          const result = await repl.tools.execute('WebFetch', { url });
          if (result.success) {
            const content = result.content || result.text || '';
            console.log(`${colors.green}✓ Fetched ${url} (${content.length} chars)${colors.reset}`);
            const display = content.length > 4000 ? content.slice(0, 4000) + `\n${colors.dim}... (${content.length - 4000} more chars)${colors.reset}` : content;
            console.log(`\n${colors.dim}${'─'.repeat(50)}${colors.reset}`);
            console.log(display);
            console.log(`${colors.dim}${'─'.repeat(50)}${colors.reset}`);
            break;
          }
          // Fallback: thử BrowserDebug nếu WebFetch thất bại
          console.log(`${colors.yellow}WebFetch không lấy được, thử BrowserDebug...${colors.reset}`);
          const bdResult = await repl.tools.execute('BrowserDebug', { url, action: 'open' });
          if (bdResult.success) {
            console.log(`${colors.green}✓ BrowserDebug loaded: ${url}${colors.reset}`);
          } else {
            console.log(`${colors.red}✖ Không thể tải: ${bdResult.error || result.error || 'unknown error'}${colors.reset}`);
            console.log(`${colors.yellow}Tip: Dùng /page-agent để xem hướng dẫn sử dụng Page Agent in-page.${colors.reset}`);
          }
        } catch (e) {
          console.log(`${colors.red}✖ Lỗi: ${e.message}${colors.reset}`);
        }
      }
      return;

    // Inline Completion
    case '/complete':
      if (args.length === 0) {
        console.log(`${colors.yellow}Usage: /complete <file> [line] [col]${colors.reset}`);
        break;
      }
      const filePath = args[0];
      const line = args.indexOf('--line') !== -1 ? parseInt(args[args.indexOf('--line') + 1], 10) : undefined;
      const col = args.indexOf('--col') !== -1 || args.indexOf('--column') !== -1
        ? parseInt(args[Math.max(args.indexOf('--col'), args.indexOf('--column')) + 1], 10)
        : undefined;
      if (repl.inlineComplete) {
        await repl.inlineComplete.complete(filePath, { line, column: col });
      } else {
        console.log(`${colors.yellow}Inline completion not initialized.${colors.reset}`);
      }
      return;

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
    case '/history':
      repl.showReplay(args[0] ? parseInt(args[0], 10) : 20);
      return;
    case '/new':
      await repl.session.newSession({ project: repl.projectPath });
      repl.history = [];
      console.log(`${colors.green}New session: ${repl.session.getSessionId().substring(0, 8)}${colors.reset}`);
      return;
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
    case '/memory-vault': {
      const root = path.join(repl.projectPath, '.winter', 'memory');
      const sub = (args[0] || 'info').toLowerCase();
      if (sub === 'list') {
        const entries = await repl.listPathEntries?.(root, 80);
        if (!entries || entries.length === 0) {
          console.log(`${colors.yellow}No TokenJuice memory vault yet at ${root}${colors.reset}`);
          return;
        }
        console.log(`${colors.cyan}Winter memory vault:${colors.reset} ${root}`);
        for (const entry of entries) {
          console.log(`  ${entry.isDirectory ? 'dir ' : 'file'} ${entry.name}`);
        }
        return;
      }
      try {
        const index = await fs.readFile(path.join(root, 'index.md'), 'utf8');
        const noteCount = (index.match(/^\- \[\[/gm) || []).length;
        console.log(`${colors.cyan}Winter memory vault:${colors.reset} ${root}`);
        console.log(`  ${colors.dim}Index notes:${colors.reset} ${noteCount}`);
        console.log(`\n${colors.dim}${index.split(/\r?\n/).slice(0, 24).join('\n')}${colors.reset}`);
      } catch {
        console.log(`${colors.yellow}No TokenJuice memory vault yet. It will be created at ${root} after a large tool result is compressed.${colors.reset}`);
      }
      break;
    }

    case '/compress':
      await repl.compressSessionContext(true);
      break;
    case '/context':
      await repl.showContextDiagnostics(args.join(' '));
      return;
    case '/scorecard':
      await repl.showCapabilityScorecard();
      return;

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
      if (args.length === 0) {
        const agents = await repl.listAgentDefinitions();
        console.log(`${colors.cyan}Agents:${colors.reset}`);
        for (const agent of agents) {
          console.log(`  ${colors.green}${agent.id}${colors.reset} ${colors.dim}${agent.displayName} · ${agent.source}${colors.reset}`);
        }
        console.log(`${colors.dim}Usage: /agent <role> <task>${colors.reset}`);
        return;
      }
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
      const imagePath = args[0];
      const imageQuestion = args.slice(1).join(' ');
      const image = args.length === 0
        ? await repl.getClipboardImage()
        : await repl.loadImageAsBase64(imagePath);
      if (image) {
        const prompt = args.length === 0
          ? 'Analyze this pasted clipboard image.'
          : (imageQuestion || `Analyze this image: ${imagePath}`);
        await repl.chat(prompt, [image]);
      } else {
        console.log(`${colors.red}${args.length === 0 ? 'No clipboard image found' : 'Could not load image'}${colors.reset}`);
      }
      return;
    case '/paste':
      const payload = await repl.getClipboardPayload();
      if (payload?.type === 'image') {
        await repl.chat('Analyze this pasted clipboard image.', [payload.image]);
      } else if (payload?.type === 'text') {
        await repl.chat(`Here is clipboard content:\n\n${payload.text}`);
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
    case '/debug':
      const debugTask = args.join(' ') || 'Find the root cause of the current failure, patch it, and verify with the closest test or build command';
      await repl.runAutoHealing(`AUTO DEBUG: ${debugTask}`);
      return;
    case '/doctor':
      if ((args[0] || '').toLowerCase() === 'full') {
        await repl.runFullDoctor();
        return;
      }
      if ((args[0] || '').toLowerCase() === 'scorecard') {
        await repl.showCapabilityScorecard();
        return;
      }
      if ((args[0] || '').toLowerCase() === 'context') {
        await repl.showContextDiagnostics(args.slice(1).join(' '));
        return;
      }
      if ((args[0] || '').toLowerCase() === 'tools' || args.length === 0) {
        await repl.runToolDoctor();
        return;
      }
      console.log(`${colors.yellow}Usage: /doctor [full|tools|context|scorecard]${colors.reset}`);
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
    case '/page-agent':
    case '/pageagent':
      await repl.showPageAgentResources(args);
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
    case '/theme':
    case '/theme:toggle': {
      const config = await repl.config.load();
      const current = config.ui?.theme || 'dark';
      const next = cmd === '/theme:toggle'
        ? (current === 'light' ? 'dark' : 'light')
        : ((args[0] || current).toLowerCase() === 'light' ? 'light' : 'dark');
      if (repl.config?.setUiTheme) {
        await repl.config.setUiTheme(next);
      } else {
        config.ui = config.ui || {};
        config.ui.theme = next;
        await repl.config.save(config);
      }
      repl.applyUiTheme?.(next);
      console.log(`${colors.green}Theme: ${next}${colors.reset}`);
      break;
    }
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
