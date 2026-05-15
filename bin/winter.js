#!/usr/bin/env node

/**
 * ❄️ WINTER CLI ❄️
 * Build by Atus fb: iam.anhtu, github: anhtu1707 with Interactive REPL
 */

import { WinterREPL } from '../src/cli/repl.js';
import { ConfigLoader } from '../src/cli/config.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const version = pkg.version;

async function main() {
  const args = process.argv.slice(2);

  // Parse commands
  if (args.length === 0 || args.includes('i') || args.includes('interactive') || args.includes('--session')) {
    // Start interactive REPL mode
    const config = new ConfigLoader();
    const cfg = await config.load();
    
    let projectPath = process.cwd();
    let sessionId = null;

    const sessionIndex = args.indexOf('--session');
    if (sessionIndex !== -1 && args[sessionIndex + 1]) {
      sessionId = args[sessionIndex + 1];
    }

    // Lấy projectPath từ tham số không phải cờ (nếu có)
    const nonFlagArgs = args.filter(a => !a.startsWith('-') && a !== 'i' && a !== 'interactive' && a !== sessionId);
    if (nonFlagArgs[0]) {
      projectPath = path.resolve(nonFlagArgs[0]);
    }

    const repl = new WinterREPL({ projectPath, sessionId, version });
    await repl.start();
    return;
  }

  // Handle commands
  const [command, ...rest] = args;

  switch (command) {
    case 'chat':
      await handleChatWithTools(rest);
      break;
    case 'call':
      await handleCallAll(rest);
      break;
    case 'session':
      await handleSession(rest);
      break;
    case 'skill':
      await handleSkill(rest);
      break;
    case 'plugin':
      await handlePlugin(rest);
      break;
    case 'design':
      await handleDesign(rest);
      break;
    case 'config':
      await handleConfig(rest);
      break;
    case 'init':
      await handleInit(rest);
      break;
    case '--help':
    case '-h':
      printHelp();
      break;
    case '--version':
    case '-v':
      console.log(`❄️ Winter CLI v${version}\n`);
      break;
    default: {
      // If no recognized command, treat the full input as a prompt.
      const config = new ConfigLoader();
      const cfg = await config.load();
      const repl = new WinterREPL({ projectPath: cfg.project?.current || process.cwd() });
      await repl.session.init();
      await repl.ai.init();
      await repl.chat([command, ...rest].join(' '));
      break;
    }
  }
}

async function handleChatWithTools(args) {
  const config = new ConfigLoader();
  const message = args.join(' ');
  if (!message) {
    console.log('Usage: winter chat <message>');
    return;
  }

  try {
    const cfg = await config.load();
    const repl = new WinterREPL({ projectPath: cfg.project?.current || process.cwd() });
    await repl.session.init();
    await repl.ai.init();
    await repl.chat(message);
  } catch (error) {
    console.error(`\nWinter error: ${error.message}\n`);
  }
}

async function handleCallAll(args) {
  const { AIProviderManager } = await import('../src/ai/providers.js');
  const config = new ConfigLoader();
  const prompt = args.join(' ');

  if (!prompt) {
    console.log('Usage: winter call <prompt>');
    return;
  }

  const ai = new AIProviderManager(config);
  const results = await ai.callAllProviders(prompt);

  for (const [provider, result] of Object.entries(results)) {
    if (result.error) {
      console.log(`\n[${provider}] ERROR\n${result.error}`);
    } else {
      console.log(`\n[${provider}] ${result.model}\n${result.content}`);
    }
  }
}

async function handleSession(args) {
  const { SessionManager } = await import('../src/session/manager.js');
  const config = new ConfigLoader();
  const session = new SessionManager(config);
  await session.init();

  const [action, ...rest] = args;

  switch (action) {
    case 'new':
      const s = await session.newSession();
      console.log(`✓ New session: ${s.id.substring(0, 8)}`);
      break;
    case 'list':
      const sessions = await session.listSessions();
      console.log(`\nSessions:`);
      sessions.forEach(s => console.log(`  ${s.id.substring(0, 8)} - ${s.createdAt}`));
      break;
    default:
      console.log(`Session: ${session.getSessionId().substring(0, 8)}`);
  }
}

async function handleSkill(args) {
  const { SkillManager } = await import('../src/skills/manager.js');
  const config = new ConfigLoader();
  const session = new SessionManager(config);
  await session.init();

  const skills = new SkillManager(session);
  const list = await skills.listSkills();

  console.log(`\n❄️ Available Skills:`);
  list.forEach(s => console.log(`  ${s.icon} ${s.name} - ${s.description}`));
  console.log('');
}

async function handlePlugin(args) {
  const { PluginManager } = await import('../src/plugins/manager.js');
  const session = new SessionManager({});
  const plugins = new PluginManager(session);
  const list = await plugins.listPlugins();

  console.log(`\n❄️ Installed Plugins:`);
  list.forEach(p => console.log(`  ${p.icon} ${p.name} v${p.version}`));
  console.log('');
}

async function handleDesign(args) {
  const { DesignCommands } = await import('../src/design/commands.js');
  const config = new ConfigLoader();
  const session = new SessionManager(config);
  await session.init();

  const design = new DesignCommands(session, config);
  await design.execute(args[0], args.slice(1));
}

async function handleConfig(args) {
  const config = new ConfigLoader();
  const cfg = await config.load();
  console.log(`\n❄️ Configuration:\n`);
  console.log(JSON.stringify(cfg, null, 2));
  console.log('');
}

async function handleInit(args) {
  console.log('❄️ Initializing Winter CLI...');
  // Create necessary directories and files
  console.log('✓ Ready!');
}

function printHelp() {
  console.log(`
WINTER CLI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Commands:

  winter                 Start interactive REPL
  winter i               Interactive mode
  winter chat <msg>      Chat with AI
  winter call <prompt>   Call all configured providers
  winter session         Session management
  winter skill           List skills
  winter plugin          List plugins
  winter design          Design commands
  winter config          Show config

Important REPL slash commands:

  /provider <name>       Switch provider and save default
  /model <model-id>      Set model for active provider
  /models                List configured and cached models
  /codex [section]       Browse ~/.codex resources
  /claude [section]      Browse ~/.claude resources
  /karpathy              Browse ~/karpathy-tools
  /designs [query]       List/search awesome-design-md systems
  /agents                Read ~/agents.md
  /skills                List Winter/Codex/Claude skills

Version ${version}
  `);
  return;
  console.log(`
❄️ WINTER CLI ❄️
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 Commands:

  winter                 Start interactive REPL (gõ winter)
  winter i              Interactive mode
  winter chat <msg>     Chat with AI

  winter session        Session management
  winter skill         List skills
  winter plugin        List plugins
  winter design        Design commands
  winter config        Show config

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 Just type 'winter' to start chatting with your project!

❄️ Version ${version}
  `);
}

main().catch(err => {
  console.error(`\n❄️ Error: ${err.message}\n`);
  process.exit(1);
});

export { main };
