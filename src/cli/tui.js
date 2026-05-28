import { terminalWidth, visibleWidth } from './terminal-ui.js';

const WINTER_LOGO = [
  ' __        __ _____ _   _ _______ ______ _____  ',
  ' \\ \\      / /|_   _| \\ | |__   __|  ____|  __ \\ ',
  '  \\ \\ /\\ / /   | | |  \\| |  | |  | |__  | |__) |',
  '   \\ V  V /    | | | .  |  | |  |  __| |  _  / ',
  '    \\_/\\_/    _| |_| |\\  |  | |  | |____| | \\ \\ ',
  '              |_____|_| \\_|  |_|  |______|_|  \\_\\',
];

function basenameFromPath(filePath, fallback = 'project') {
  const parts = String(filePath || '').split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || fallback;
}

function stripAnsi(text = '') {
  return String(text || '').replace(/\x1b\[[0-9;]*m/g, '');
}

function clampText(text = '', max = 72) {
  const value = String(text || '');
  if (visibleWidth(value) <= max) return value;
  const plain = stripAnsi(value);
  return `${plain.slice(0, Math.max(0, max - 3))}...`;
}

function formatCount(value, fallback = 0) {
  const number = Number(value ?? fallback);
  return Number.isFinite(number) ? number : fallback;
}

function summarizeTools(events = []) {
  if (!Array.isArray(events) || events.length === 0) return 'idle';
  return events.slice(-4).map(event => {
    const name = event.toolName || event.tool || event.name || 'tool';
    const ok = event.success === false ? 'fail' : 'ok';
    return `${name}:${ok}`;
  }).join('  ');
}

function summarizeHistory(entries = []) {
  if (!Array.isArray(entries) || entries.length === 0) return [];
  return entries.slice(-4).map(entry => {
    const role = entry.role === 'assistant' ? 'Winter' : entry.role === 'user' ? 'You' : entry.role || 'event';
    const content = typeof entry.content === 'string'
      ? entry.content
      : Array.isArray(entry.content)
        ? entry.content.map(part => part?.text || part?.content || '').join(' ')
        : entry.text || '';
    const compact = clampText(content.replace(/\s+/g, ' ').trim(), 78);
    return compact ? `${role}: ${compact}` : '';
  }).filter(Boolean);
}

function formatRecentHistoryLine(entry) {
  if (typeof entry === 'string') return entry;
  if (!entry || typeof entry !== 'object') return '';
  const role = entry.role === 'assistant' ? 'Winter' : entry.role === 'user' ? 'You' : entry.role || 'event';
  const content = typeof entry.content === 'string'
    ? entry.content
    : Array.isArray(entry.content)
      ? entry.content.map(part => part?.text || part?.content || '').join(' ')
      : entry.text || '';
  const compact = clampText(String(content || '').replace(/\s+/g, ' ').trim(), 78);
  return compact ? `${role}: ${compact}` : '';
}

function sectionLine(label, value, c = {}) {
  return `${c.dim || ''}${label.padEnd(10)}${c.reset || ''} ${value}`;
}

export function buildTuiSnapshot(repl = {}) {
  const provider = repl.ai?.getActiveProvider?.() || 'provider';
  const model = repl.ai?.providers?.[provider]?.model || 'model';
  const context = repl.session?.getContext?.() || {};
  const history = repl.session?.getHistory?.() || [];
  const toolEvents = repl.session?.getToolEvents?.() || [];
  const codebaseStats = repl.codebaseSearcher?.indexer?.getStats?.() || {};
  const activeSkills = Array.isArray(context.activeSkills?.value)
    ? context.activeSkills.value
    : Array.isArray(context.activeSkills)
      ? context.activeSkills
      : [];

  return {
    provider,
    model,
    modelTier: repl.ai?._modelTier || repl.getActiveModelTier?.() || 'unknown',
    projectPath: repl.projectPath || process.cwd(),
    sessionShort: String(repl.session?.getSessionId?.() || 'session').slice(0, 8),
    projectName: basenameFromPath(repl.projectPath || process.cwd()),
    statusText: repl.isProcessing ? 'running' : 'ready',
    queueText: Array.isArray(repl.taskQueue) && repl.taskQueue.length > 0 ? `${repl.taskQueue.length} queued` : 'empty',
    codebaseFiles: formatCount(codebaseStats.totalFiles),
    codebaseChunks: formatCount(codebaseStats.totalChunks),
    toolSummary: summarizeTools(toolEvents),
    recentHistory: summarizeHistory(history),
    activeSkills: activeSkills.slice(0, 8),
    hermesCore: true,
  };
}

export function renderInputPanel(snapshot, {
  colors,
  width = terminalWidth(66, 124),
} = {}) {
  const c = colors || {};
  const panelWidth = Math.max(64, width - 2);
  const innerWidth = Math.max(20, panelWidth - 4);
  const projectName = snapshot.projectName || 'project';
  const providerModel = snapshot.provider && snapshot.model
    ? `${snapshot.provider}/${snapshot.model}`
    : snapshot.provider || snapshot.model || 'model';

  return {
    top: `${c.dim}+${'-'.repeat(innerWidth + 2)}+${c.reset}`,
    status: `${c.bright}${c.cyan}WINTER${c.reset} ${c.dim}.${c.reset} ${projectName} ${c.dim}.${c.reset} ${providerModel}`,
    hint: `${c.dim}@file${c.reset} attach . ${c.dim}!cmd${c.reset} bash . ${c.dim}Ctrl+V${c.reset}/${c.dim}^V img${c.reset}`,
    prompt: `${c.bright}${c.green}winter${c.reset} ${c.dim}>${c.reset} `,
    bottom: `${c.dim}+${'-'.repeat(innerWidth + 2)}+${c.reset}`,
  };
}

export function renderLandingTui(snapshot, { colors } = {}) {
  const c = colors || {};
  const W = Math.max(60, Math.min(process.stdout.columns || 80, 140));

  const bright = c.bright || '\x1b[1m';
  const green = c.brightGreen || c.green || '\x1b[92m';
  const white = c.white || '\x1b[37m';
  const dim = c.dim || '\x1b[2m';
  const reset = c.reset || '\x1b[0m';
  const bgBlue = '\x1b[48;5;236m';

  const logoLines = WINTER_LOGO.map(line => `${bright}${green}${line}${reset}`);
  const leftStatus = ` ${snapshot.provider} / ${snapshot.model} `;
  const rightStatus = ' /tui /help /doctor tools ';
  const padding = Math.max(0, W - stripAnsi(leftStatus).length - stripAnsi(rightStatus).length);
  const statusBar = `${bgBlue}${white}${leftStatus}${' '.repeat(padding)}${rightStatus}${reset}`;
  const recent = snapshot.recentHistory?.length
    ? snapshot.recentHistory.map(formatRecentHistoryLine).filter(Boolean).map(line => `${dim}- ${line}${reset}`)
    : [`${dim}- No recent messages loaded.${reset}`];
  const skills = snapshot.activeSkills?.length ? snapshot.activeSkills.join(', ') : 'coding, debug, test';

  return [
    ...logoLines,
    '',
    `${white}Winter dashboard${reset} ${dim}Hermes-style agent core: skills, memory, tools, subagents, gateway discipline.${reset}`,
    '',
    statusBar,
    '',
    `${bgBlue}${white} STATUS ${reset}`,
    sectionLine('Project', `${snapshot.projectName}  ${dim}${snapshot.projectPath}${reset}`, c),
    sectionLine('Model', `${snapshot.provider}/${snapshot.model}  ${dim}${snapshot.modelTier || 'unknown'}${reset}`, c),
    sectionLine('Session', `${snapshot.sessionShort}  ${dim}${snapshot.statusText || 'ready'} . queue ${snapshot.queueText || 'empty'}${reset}`, c),
    sectionLine('Codebase', `${snapshot.codebaseFiles || 0} files, ${snapshot.codebaseChunks || 0} chunks`, c),
    sectionLine('Tools', snapshot.toolSummary || 'idle', c),
    '',
    `${bgBlue}${white} AGENT CORE ${reset}`,
    sectionLine('Hermes', 'self-improve . skill lifecycle . session search . subagents . automation', c),
    sectionLine('Skills', skills, c),
    sectionLine('Gateway', 'MCP diagnostics . timeout handling . concrete tool evidence', c),
    '',
    `${bgBlue}${white} RECENT ${reset}`,
    ...recent,
    renderCommandCenter({ colors: c, width: W }),
  ].join('\n');
}

export function renderStatusPanel(snapshot, { colors, title = 'Status' } = {}) {
  const c = colors || {};
  const bgBlue = '\x1b[48;5;236m';
  const header = `${bgBlue}${c.white} ${title.toUpperCase()} ${c.reset}`;

  return [
    '',
    header,
    sectionLine('Project', `${snapshot.projectName} (${snapshot.projectPath})`, c),
    sectionLine('Model', `${snapshot.provider}/${snapshot.model} (${snapshot.modelTier || 'unknown'})`, c),
    sectionLine('Session', `${snapshot.sessionShort} | ${snapshot.statusText || 'ready'} | queue ${snapshot.queueText || 'empty'}`, c),
    sectionLine('Codebase', `${snapshot.codebaseFiles || 0} files, ${snapshot.codebaseChunks || 0} chunks`, c),
    sectionLine('Activity', snapshot.toolSummary || 'idle', c),
    ''
  ].join('\n');
}

export function renderStartupTui(snapshot, opts) { return renderLandingTui(snapshot, opts); }
export function renderConversationStartup(snapshot, opts) { return renderLandingTui(snapshot, opts); }
export function renderShellTui(snapshot, opts) { return renderLandingTui(snapshot, opts); }

export function renderCommandCenter({ colors, width = 80 } = {}) {
  const c = colors || {};
  const bgBlue = '\x1b[48;5;236m';
  const header = `${bgBlue}${c.white} COMMAND CENTER ${c.reset}`;
  const hint = `${c.dim}Slash commands share one workflow: inspect real state, use tools, verify, then report evidence.${c.reset}`;

  return [
    '',
    header,
    hint,
    `${c.brightGreen}B${c.reset} ${c.bright}${c.cyan}Build     ${c.reset} ${c.dim}/auto /debug /tdd /swe /composer /plan fetch${c.reset}`,
    `${c.brightGreen}I${c.reset} ${c.bright}${c.cyan}Inspect   ${c.reset} ${c.dim}/read /grep /glob /search /context /doctor tools${c.reset}`,
    `${c.brightGreen}M${c.reset} ${c.bright}${c.cyan}Model     ${c.reset} ${c.dim}/provider /providers /model /models /scorecard${c.reset}`,
    `${c.brightGreen}K${c.reset} ${c.bright}${c.cyan}Memory    ${c.reset} ${c.dim}/remember /memories /memory-vault /compress /stats${c.reset}`,
    `${c.brightGreen}A${c.reset} ${c.bright}${c.cyan}Agent     ${c.reset} ${c.dim}/skills hermes-agent /mcp /resources /agent /parallel${c.reset}`,
    `${c.brightGreen}G${c.reset} ${c.bright}${c.cyan}Gateway   ${c.reset} ${c.dim}/mcp list /mcp tools chrome-devtools /permissions list${c.reset}`,
    `${c.brightGreen}V${c.reset} ${c.bright}${c.cyan}Visual    ${c.reset} ${c.dim}/image /paste Ctrl+V /designs /page-agent /htmlfx${c.reset}`,
    `${c.brightGreen}S${c.reset} ${c.bright}${c.cyan}System    ${c.reset} ${c.dim}/doctor full /stats /resources /help${c.reset}`,
    ''
  ].join('\n');
}

export function renderSplitPanel({ title, left = [], right = [], colors, width = 80 } = {}) {
  const c = colors || {};
  const bgBlue = '\x1b[48;5;236m';
  const header = `${bgBlue}${c.white} ${(title || 'Info').toUpperCase()} ${c.reset}`;

  const innerWidth = Math.max(56, width - 4);
  const leftWidth = Math.floor(innerWidth * 0.5);

  const rows = [];
  const count = Math.max(left.length, right.length);
  for (let i = 0; i < count; i++) {
    const lText = String(left[i] || '');
    const rText = String(right[i] || '');
    const lPlain = stripAnsi(lText);
    const lPad = Math.max(0, leftWidth - lPlain.length);
    rows.push(`${lText}${' '.repeat(lPad)}   ${rText}`);
  }

  return [
    '',
    header,
    ...rows,
    ''
  ].join('\n');
}

export function renderHistoryPanel(entries = [], { colors, title = 'Recent Session' } = {}) {
  const c = colors || {};
  const bgBlue = '\x1b[48;5;236m';
  const header = `${bgBlue}${c.white} ${title.toUpperCase()} ${c.reset}`;

  const body = entries.length > 0
    ? entries.map(entry => {
      const role = entry.role === 'assistant' ? 'Winter' : entry.role === 'user' ? 'You' : entry.role || 'event';
      const roleColor = entry.role === 'assistant' ? c.cyan : c.green;
      return `${c.bright}${roleColor}${role}${c.reset}: ${entry.content || entry.text || ''}`;
    })
    : [`${c.dim}No previous messages.${c.reset}`];

  return [
    '',
    header,
    ...body,
    ''
  ].join('\n');
}

export function renderAssistantPanel({ content = '', footer = '', colors, title = 'Assistant' } = {}) {
  const c = colors || {};
  const bgBlue = '\x1b[48;5;236m';
  const header = `${bgBlue}${c.white} ${title.toUpperCase()} ${c.reset}`;

  const parts = [];
  if (title) parts.push('', header);
  if (content) parts.push(content);
  if (footer) parts.push(`${c.dim}${footer}${c.reset}`);
  return parts.join('\n') + '\n';
}

export function renderToolPanel({ toolName = 'Tool', summary = '', success = true, colors } = {}) {
  const c = colors || {};
  const status = success ? `${c.brightGreen}OK${c.reset}` : `${c.red}FAIL${c.reset}`;

  if (!summary.includes('\n')) {
    return `${status} ${c.bright}${c.cyan}${toolName}${c.reset} ${c.dim}. ${summary}${c.reset}`;
  }

  const lines = summary.split('\n');
  const firstLine = lines.shift();

  const formattedRest = lines.map(line => {
    if (line.startsWith('+')) return `    ${c.green}${line}${c.reset}`;
    if (line.startsWith('-')) return `    ${c.red}${line}${c.reset}`;
    if (line.startsWith('@@')) return `    ${c.cyan}${line}${c.reset}`;
    return `    ${c.dim}${line}${c.reset}`;
  }).join('\n');

  let output = `${status} ${c.bright}${c.cyan}${toolName}${c.reset} ${c.dim}. ${firstLine}${c.reset}`;
  if (formattedRest) output += `\n${formattedRest}`;
  return output;
}
