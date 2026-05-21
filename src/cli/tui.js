import { terminalWidth, visibleWidth, wrapText } from './terminal-ui.js';

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

export function buildTuiSnapshot(repl = {}) {
  const provider = repl.ai?.getActiveProvider?.() || 'provider';
  const model = repl.ai?.providers?.[provider]?.model || 'model';
  return {
    provider,
    model,
    projectPath: repl.projectPath || process.cwd(),
    sessionShort: String(repl.session?.getSessionId?.() || 'session').slice(0, 8),
    projectName: basenameFromPath(repl.projectPath || process.cwd()),
  };
}

export function renderInputPanel(snapshot, {
  colors,
  width = terminalWidth(66, 124),
} = {}) {
  const c = colors || {};
  const panelWidth = Math.max(64, width - 2);
  const innerWidth = Math.max(20, panelWidth - 4);
  
  return {
    top: `${c.dim}┌${'─'.repeat(innerWidth + 2)}┐${c.reset}`,
    status: '',
    hint: '',
    prompt: `${c.bright}${c.green}│${c.reset} `,
    bottom: `${c.dim}└${'─'.repeat(innerWidth + 2)}┘${c.reset}`,
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
  
  const leftStatus = ` ${snapshot.provider} · ${snapshot.model} `;
  const rightStatus = ` ESC×2 exit · /help `;
  const padding = Math.max(0, W - leftStatus.length - rightStatus.length);
  const statusBar = `${bgBlue}${white}${leftStatus}${' '.repeat(padding)}${rightStatus}${reset}`;

  const dock = renderInputPanel(snapshot, { colors });

  return [
    ...logoLines,
    '',
    `${white}Winter will run commands on your behalf to help you build.${reset}`,
    '',
    `${white}Directory${reset} ${dim}${snapshot.projectPath}${reset}`,
    '',
    statusBar,
    dock.top
  ].join('\n');
}

export function renderStatusPanel(snapshot, { colors, title = 'Status' } = {}) {
  const c = colors || {};
  const bgBlue = '\x1b[48;5;236m';
  const header = `${bgBlue}${c.white} ${title.toUpperCase()} ${c.reset}`;
  
  return [
    '',
    header,
    `${c.dim}Project :${c.reset} ${snapshot.projectName} (${snapshot.projectPath})`,
    `${c.dim}Model   :${c.reset} ${snapshot.provider}/${snapshot.model} (${snapshot.modelTier})`,
    `${c.dim}Session :${c.reset} ${snapshot.sessionShort} | State: ${snapshot.statusText}`,
    `${c.dim}Codebase:${c.reset} ${snapshot.codebaseFiles} files, ${snapshot.codebaseChunks} chunks`,
    `${c.dim}Activity:${c.reset} ${snapshot.toolSummary || 'idle'}`,
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
  
  return [
    '',
    header,
    `${c.brightGreen}B${c.reset} ${c.bright}${c.cyan}Build  ${c.reset} ${c.dim}/auto /debug /tdd /swe /composer${c.reset}`,
    `${c.brightGreen}I${c.reset} ${c.bright}${c.cyan}Inspect${c.reset} ${c.dim}/read /grep /glob /search /context${c.reset}`,
    `${c.brightGreen}M${c.reset} ${c.bright}${c.cyan}Model  ${c.reset} ${c.dim}/provider /providers /model /models /scorecard${c.reset}`,
    `${c.brightGreen}K${c.reset} ${c.bright}${c.cyan}Memory ${c.reset} ${c.dim}/remember /memories /memory-vault /compress${c.reset}`,
    `${c.brightGreen}V${c.reset} ${c.bright}${c.cyan}Visual ${c.reset} ${c.dim}/image /paste ^V img /designs /page-agent${c.reset}`,
    `${c.brightGreen}S${c.reset} ${c.bright}${c.cyan}System ${c.reset} ${c.dim}/doctor full /stats /permissions /mcp /help${c.reset}`,
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
    const lPlain = lText.replace(/\x1b\[[0-9;]*m/g, '');
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
  const status = success ? `${c.brightGreen}✓${c.reset}` : `${c.red}✖${c.reset}`;
  
  if (!summary.includes('\n')) {
    return `${status} ${c.bright}${c.cyan}${toolName}${c.reset} ${c.dim}· ${summary}${c.reset}`;
  }

  const lines = summary.split('\n');
  const firstLine = lines.shift();
  
  const formattedRest = lines.map(line => {
    if (line.startsWith('+')) return `    ${c.green}${line}${c.reset}`;
    if (line.startsWith('-')) return `    ${c.red}${line}${c.reset}`;
    if (line.startsWith('@@')) return `    ${c.cyan}${line}${c.reset}`;
    return `    ${c.dim}${line}${c.reset}`;
  }).join('\n');

  let output = `${status} ${c.bright}${c.cyan}${toolName}${c.reset} ${c.dim}· ${firstLine}${c.reset}`;
  if (formattedRest) output += `\n${formattedRest}`;
  return output;
}
