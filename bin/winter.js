#!/usr/bin/env node

/**
 * ❄️ WINTER CLI ❄️
 * Build by Atus fb: iam.anhtu, github: anhtu1707 with Interactive REPL
 */

import { readFileSync } from 'fs';
import path from 'path';
import { WinterREPL } from '../src/cli/repl.js';
import { ConfigLoader } from '../src/cli/config.js';
import { SessionManager } from '../src/session/manager.js';
import { AIProviderManager } from '../src/ai/providers.js';
import { CommandParser } from '../src/cli/commands.js';
import { supportsUnicodeUi } from '../src/cli/terminal-ui.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const version = pkg.version;

const COMMANDS = new Set([
  'chat', 'call', 'benchmark', 'session', 'skill', 'plugin', 'design', 'config', 'init',
  'help', 'project', 'code', 'review', 'debug', 'auto', 'mcp', 'permissions',
  'autopilot', 'plan',
  'provider', 'providers', 'model', 'models', 'ecc', 'page-agent', 'pageagent',
  'resources', 'htmlfx', 'memory-vault', 'doctor', 'context', 'scorecard',
  'tui',
]);

function isInteractiveRequest(args) {
  return args.length === 0 || args.includes('i') || args.includes('interactive') || args.includes('--session');
}

async function createRuntime(projectPath, sessionId = null) {
  const config = new ConfigLoader();
  const session = new SessionManager(config);
  await session.init({ project: projectPath, sessionId });

  const ai = new AIProviderManager(config);
  await ai.init();

  const parser = new CommandParser({ session, ai, config });
  return { config, session, ai, parser };
}

function printHelp() {
  console.log(`
WINTER CLI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Usage:

  winter                      Start interactive REPL
  winter help                 Show this help
  winter chat <message>       Chat with AI
  winter <prompt>             Treat plain text as a chat prompt

Commands:

  winter call <prompt>        Call all configured providers
  winter benchmark [providers] Benchmark model intelligence
  winter session <action>     Session management
  winter skill <action>       Skill management
  winter plugin <action>      Plugin management
  winter mcp <action>         MCP server management
  winter permissions <action> Permission allowlist
  winter ecc [action]         Browse bundled ECC resources
  winter htmlfx [action]      Manage html-effectiveness compiler integration
  winter page-agent [action]  Browse bundled Page Agent resources
  winter context [task]       Inspect model context for this project
  winter scorecard            Score Winter capability gates
  winter doctor [full|tools]  Diagnose context, provider, and tools
  winter provider [name]      Show/switch provider
  winter providers            List providers
  winter model [model]        Show/set active provider model
  winter models               List configured/cached models
  winter design <action>      Design commands
  winter plan fetch <task> [--export md|json] [--output <path>] [--apply]
  winter project <action>     Project commands
  winter config               Show config
  winter init                 Initialize local state
  winter review               Code review mode
  winter debug <error/task>   Auto-debug with verification
  winter auto <task>          Auto-heal with test/build loop
  winter autopilot <task>     Autonomous analyze/fix/verify workflow
  winter autopilot <task> --max-loops <n> --verify "cmd1;cmd2"
  winter code                 Code analysis mode

Flags:

  winter -h, --help           Show help
  winter -v, --version        Show version

Version ${version}
  `);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  if (args.includes('--version') || args.includes('-v')) {
    console.log(`${supportsUnicodeUi() ? '❄️ ' : ''}Winter CLI v${version}\n`);
    return;
  }

  if (isInteractiveRequest(args)) {
    const config = new ConfigLoader();

    let projectPath = process.cwd();
    let sessionId = null;

    const sessionIndex = args.indexOf('--session');
    if (sessionIndex !== -1 && args[sessionIndex + 1]) {
      sessionId = args[sessionIndex + 1];
    }

    const nonFlagArgs = args.filter(a => !a.startsWith('-') && a !== 'i' && a !== 'interactive' && a !== sessionId);
    if (nonFlagArgs[0]) {
      projectPath = path.resolve(nonFlagArgs[0]);
    }

    const repl = new WinterREPL({ projectPath, sessionId, version });
    await repl.start();
    return;
  }

  const projectPath = process.cwd();
  const [command] = args;
  if (['doctor', 'context', 'scorecard'].includes(command)) {
    const repl = new WinterREPL({ projectPath, version });
    await repl.session.init({ project: projectPath });
    await repl.ai.init();
    if (command === 'scorecard') {
      await repl.showCapabilityScorecard();
      return;
    }
    if (command === 'context') {
      await repl.showContextDiagnostics(args.slice(1).join(' '));
      return;
    }
    const mode = (args[1] || 'tools').toLowerCase();
    if (mode === 'full') {
      await repl.runFullDoctor();
    } else if (mode === 'context') {
      await repl.showContextDiagnostics(args.slice(2).join(' '));
    } else if (mode === 'scorecard') {
      await repl.showCapabilityScorecard();
    } else {
      await repl.runToolDoctor();
    }
    return;
  }
  const { parser } = await createRuntime(projectPath);

  if (!command || (!command.startsWith('/') && !COMMANDS.has(command))) {
    await parser.parse(['chat', ...args]);
    return;
  }

  await parser.parse(args);
}

main().catch(err => {
  console.error(`\n❄️ Error: ${err.message}\n`);
  process.exit(1);
});

export { main };
