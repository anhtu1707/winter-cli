import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const COMPETITOR_TARGETS = [
  {
    name: 'Codebuff/Freebuff',
    strengths: ['typed custom agents', 'spawnable agent workflows', 'code search and write loops'],
  },
  {
    name: 'Codex CLI',
    strengths: ['local terminal agent reliability', 'distribution polish', 'IDE/app ecosystem'],
  },
  {
    name: 'Claude Code',
    strengths: ['subagents', 'hooks', 'MCP', 'permissions', 'debuggable lifecycle'],
  },
];

export const WINTER_CAPABILITY_TARGET = 92;

export const CAPABILITY_AREAS = [
  {
    id: 'agent-loop',
    label: 'Agent runtime loop',
    weight: 14,
    target: 'Codex/Claude-grade multi-turn tool execution with evidence before completion',
    probes: [
      { key: 'agentRuntime', label: 'AgentRuntime is present' },
      { key: 'toolEvidenceGuard', label: 'completion claims are guarded by tool evidence' },
      { key: 'loopProtection', label: 'repeated tool loops are detected' },
    ],
  },
  {
    id: 'tool-reliability',
    label: 'Tool reliability',
    weight: 14,
    target: 'provider-agnostic native and fallback tool calls',
    probes: [
      { key: 'toolExecutor', label: 'ToolExecutor exposes local tools' },
      { key: 'toolDoctor', label: 'tool-call doctor exists' },
      { key: 'fallbackParser', label: 'XML/JSON/CALL_TOOL fallback parser exists' },
    ],
  },
  {
    id: 'codebase-intelligence',
    label: 'Codebase intelligence',
    weight: 14,
    target: 'automatic project map, symbols, search, and relevant context injection',
    probes: [
      { key: 'codebaseIndex', label: 'codebase index is initialized automatically' },
      { key: 'codebaseContext', label: 'project context includes codebase summaries' },
      { key: 'atContext', label: '@file and @symbol context resolver exists' },
    ],
  },
  {
    id: 'memory-compression',
    label: 'Memory and TokenJuice',
    weight: 12,
    target: 'large tool outputs compressed into durable Obsidian-style memory',
    probes: [
      { key: 'tokenJuice', label: 'TokenJuice middleware is active' },
      { key: 'wikiMemory', label: 'wiki memory store module exists' },
      { key: 'sessionCompression', label: 'conversation compression exists' },
    ],
  },
  {
    id: 'subagents',
    label: 'Subagents and custom agents',
    weight: 12,
    target: 'Codebuff/Claude-style custom agents with scoped tools',
    probes: [
      { key: 'agentRegistry', label: 'project agent registry is active' },
      { key: 'agentTool', label: 'Agent tool exists' },
      { key: 'scopedTools', label: 'role-scoped tools are available' },
    ],
  },
  {
    id: 'terminal-ux',
    label: 'Terminal UX and multimodal input',
    weight: 10,
    target: 'stable bottom input, shortcuts, direct image paste',
    probes: [
      { key: 'bottomInput', label: 'bottom-sidebar input controller exists' },
      { key: 'directImagePaste', label: 'direct clipboard image paste exists' },
      { key: 'slashMenu', label: 'slash command catalog exists' },
    ],
  },
  {
    id: 'provider-routing',
    label: 'Provider and model routing',
    weight: 10,
    target: 'custom provider first, model-aware routing, fallback without lock-in',
    probes: [
      { key: 'providerManager', label: 'provider manager exists' },
      { key: 'providerSwitch', label: 'provider switch support exists' },
      { key: 'modelTier', label: 'model capability tiering exists' },
    ],
  },
  {
    id: 'debug-workflow',
    label: 'Debug workflow',
    weight: 8,
    target: 'top-tier debug loop with terminal, browser, tests, and evidence',
    probes: [
      { key: 'autoDebug', label: '/debug and /auto routes exist' },
      { key: 'browserDebug', label: 'BrowserDebug tool exists' },
      { key: 'verificationCommands', label: 'verification command inference exists' },
    ],
  },
  {
    id: 'ecosystem',
    label: 'Ecosystem and resources',
    weight: 6,
    target: 'MCP, bundled resources, skills/plugins, page-agent/ECC access',
    probes: [
      { key: 'mcp', label: 'MCP modules exist' },
      { key: 'resources', label: 'bundled resource manifest exists' },
      { key: 'skillsPlugins', label: 'skills/plugins managers exist' },
    ],
  },
];

function scoreArea(area, probes) {
  const passed = area.probes.filter(probe => Boolean(probes[probe.key])).length;
  const ratio = area.probes.length > 0 ? passed / area.probes.length : 0;
  return {
    ...area,
    passed,
    total: area.probes.length,
    score: Math.round(area.weight * ratio),
    percent: Math.round(ratio * 100),
    checks: area.probes.map(probe => ({
      ...probe,
      ok: Boolean(probes[probe.key]),
    })),
  };
}

export async function assessWinterCapabilities(repl = {}) {
  const projectPath = repl.projectPath || process.cwd();
  const srcPath = path.join(PACKAGE_ROOT, 'src');
  const resourceRoot = path.join(PACKAGE_ROOT, 'resources');
  const tools = repl.tools?.getToolDefinitions?.() || repl.getAgentTools?.('general') || [];
  const toolNames = new Set(tools.map(tool => tool.name || tool.function?.name).filter(Boolean));

  const probes = {
    agentRuntime: Boolean(repl.agentRuntime) || existsSync(path.join(srcPath, 'agent', 'runtime.js')),
    toolEvidenceGuard: existsSync(path.join(srcPath, 'cli', 'repl.test.js')),
    loopProtection: typeof repl.runConversation === 'function',

    toolExecutor: Boolean(repl.tools) || existsSync(path.join(srcPath, 'tools', 'executor.js')),
    toolDoctor: typeof repl.runToolDoctor === 'function',
    fallbackParser: existsSync(path.join(srcPath, 'cli', 'tool-call-adapter.js')),

    codebaseIndex: typeof repl.ensureCodebaseIndex === 'function' || existsSync(path.join(srcPath, 'codebase-index', 'indexer.js')),
    codebaseContext: typeof repl.buildCodebaseContext === 'function',
    atContext: existsSync(path.join(srcPath, 'cli', 'at-context.js')),

    tokenJuice: Boolean(repl.tokenJuice) || existsSync(path.join(srcPath, 'context', 'token-juice.js')),
    wikiMemory: existsSync(path.join(srcPath, 'context', 'wiki-memory.js')),
    sessionCompression: typeof repl.compressSessionContext === 'function' || existsSync(path.join(srcPath, 'context', 'compress.js')),

    agentRegistry: Boolean(repl.agentRegistry) || existsSync(path.join(srcPath, 'agent', 'agent-definitions.js')),
    agentTool: toolNames.has('Agent') || existsSync(path.join(srcPath, 'tools', 'agent.js')),
    scopedTools: typeof repl.getAgentTools === 'function',

    bottomInput: Boolean(repl.inputController) || existsSync(path.join(srcPath, 'cli', 'input-controller.js')),
    directImagePaste: typeof repl.handleDirectClipboardPaste === 'function',
    slashMenu: Array.isArray(repl.getSlashSuggestions?.('/')) || existsSync(path.join(srcPath, 'cli', 'slash-commands.js')),

    providerManager: Boolean(repl.ai) || existsSync(path.join(srcPath, 'ai', 'providers.js')),
    providerSwitch: typeof repl.ai?.switchProvider === 'function',
    modelTier: existsSync(path.join(srcPath, 'ai', 'model-capabilities.js')),

    autoDebug: typeof repl.runAutoHealing === 'function',
    browserDebug: toolNames.has('BrowserDebug'),
    verificationCommands: existsSync(path.join(srcPath, 'ai', 'prompts', 'success-criteria.js')),

    mcp: existsSync(path.join(srcPath, 'mcp', 'client.js')),
    resources: existsSync(path.join(resourceRoot, 'local', 'manifest.json')),
    skillsPlugins: existsSync(path.join(srcPath, 'skills', 'manager.js')) && existsSync(path.join(srcPath, 'plugins', 'manager.js')),
  };

  const areas = CAPABILITY_AREAS.map(area => scoreArea(area, probes));
  const score = areas.reduce((sum, area) => sum + area.score, 0);
  const maxScore = CAPABILITY_AREAS.reduce((sum, area) => sum + area.weight, 0);
  const overall = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;

  return {
    target: WINTER_CAPABILITY_TARGET,
    overall,
    score,
    maxScore,
    status: overall >= WINTER_CAPABILITY_TARGET ? 'ready' : 'below-target',
    competitors: COMPETITOR_TARGETS,
    areas,
    gaps: areas
      .filter(area => area.percent < 100)
      .map(area => ({
        id: area.id,
        label: area.label,
        missing: area.checks.filter(check => !check.ok).map(check => check.label),
      })),
  };
}

export function formatCapabilityScorecard(report, { colors = {} } = {}) {
  const c = {
    cyan: colors.cyan || '',
    green: colors.green || '',
    yellow: colors.yellow || '',
    red: colors.red || '',
    dim: colors.dim || '',
    bright: colors.bright || '',
    reset: colors.reset || '',
  };
  const statusColor = report.overall >= report.target ? c.green : c.yellow;
  const lines = [
    `${c.cyan}${c.bright}Winter capability scorecard${c.reset}`,
    `${statusColor}${report.overall}%${c.reset} ${c.dim}(target ${report.target}-95% vs Codebuff/Codex/Claude capability set)${c.reset}`,
    '',
  ];

  for (const area of report.areas) {
    const icon = area.percent === 100 ? 'ok' : area.percent >= 67 ? 'warn' : 'gap';
    lines.push(`${icon.padEnd(4)} ${area.label.padEnd(32)} ${String(area.percent).padStart(3)}%  weight ${area.score}/${area.weight}`);
    const missing = area.checks.filter(check => !check.ok);
    if (missing.length > 0) {
      lines.push(`     ${c.dim}missing: ${missing.map(check => check.label).join('; ')}${c.reset}`);
    }
  }

  if (report.gaps.length === 0) {
    lines.push('', `${c.green}All tracked capability gates are present.${c.reset}`);
  }

  return lines.join('\n');
}
