import { renderBox, supportsUnicodeUi, terminalWidth } from './terminal-ui.js';

export const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  bgBlack: '\x1b[40m',
  bgBlue: '\x1b[44m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m',
  bgBrightBlue: '\x1b[104m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  white: '\x1b[37m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  brightGreen: '\x1b[92m',
  bgMagenta: '\x1b[45m',
};

const DARK_THEME = { ...colors };
const LIGHT_THEME = { ...colors };

export function applyColorTheme(theme = 'dark') {
  colors.theme = theme;
  return colors.theme;
}

export const miniLogo = `${colors.cyan}❄${colors.reset}`;

export function welcomeBanner(version, info = {}) {
  const displayPath = info.project || 'Unknown';
  const provider = info.provider || 'default';
  const model = info.model || 'unknown';

  const W = Math.max(60, Math.min(process.stdout.columns || 80, 100));
  const white = colors.white;
  const dim = colors.dim;
  const bright = colors.bright;
  const reset = colors.reset;
  const green = '\x1b[92m';
  const cyan = '\x1b[36m';
  const bgBrightBlue = '\x1b[104m';
  const bgBlue = '\x1b[48;5;236m';

  const logo = [
    '╔══════════════════════════════════════════════════════════════════╗',
    '║                                                                  ║',
    '║   ██╗    ██╗██╗███╗  ██╗████████╗███████╗██████╗                 ║',
    '║   ██║    ██║██║████╗ ██║╚══██╔══╝██╔════╝██╔══██╗                ║',
    '║   ██║ █╗ ██║██║██╔██╗██║   ██║   █████╗  ██████╔╝                ║',
    '║   ██║███╗██║██║██║╚████║   ██║   ██╔══╝  ██╔══██╗                ║',
    '║   ╚███╔███╔╝██║██║ ╚███║   ██║   ███████╗██║  ██║                ║',
    '║    ╚══╝╚══╝ ╚═╝╚═╝  ╚══╝   ╚═╝   ╚══════╝╚═╝  ╚═╝                ║',
    '║                                                                  ║',
    '║              A I   C o d i n g   A s s i s t a n t               ║',
    '║══════════════════════════════════════════════════════════════════║',
    '║ fb.com/iam.anhtu           ║           github.com/anhtu1707      ║',
    '╚══════════════════════════════════════════════════════════════════╝',
  ];
  const logoLines = logo.map(line => `${bright}${cyan}${line}${reset}`);

  const leftStatus = ` ${provider} · ${model} `;
  const rightStatus = ` ESC×2 exit · /help `;
  const padding = Math.max(0, W - leftStatus.length - rightStatus.length);
  const statusBar = `${bgBlue}${white}${leftStatus}${' '.repeat(padding)}${rightStatus}${reset}`;

  const banner = [
    ...logoLines,
    '',
    `${white}Winter will run commands on your behalf to help you build.${reset}`,
    '',
    `${white}Directory${reset} ${dim}${displayPath}${reset}`,
    '',
    statusBar
  ].join('\n');
  return banner;
}

export const statusIcons = {
  online: `${colors.green}●${colors.reset}`,
  offline: `${colors.dim}○${colors.reset}`,
  warning: `${colors.yellow}◆${colors.reset}`,
  error: `${colors.red}✖${colors.reset}`,
  success: `${colors.green}✓${colors.reset}`,
  thinking: `${colors.cyan}◉${colors.reset}`,
  queue: `${colors.magenta}◎${colors.reset}`,
};

export function providerStatus(name, status) {
  return `${statusIcons[status] || statusIcons.offline} ${name}`;
}

export function sessionIndicator(sessionId) {
  return `session:${sessionId}`;
}

export const snowflake = '';
