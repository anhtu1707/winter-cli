const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;
const ZERO_WIDTH_PATTERN = /[\u200B-\u200D\u2060\uFE0E\uFE0F]/u;
const WIDE_CODE_POINT_RANGES = [
  [0x1100, 0x115f],
  [0x2329, 0x232a],
  [0x2e80, 0x303e],
  [0x3040, 0xa4cf],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe10, 0xfe19],
  [0xfe30, 0xfe6f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x1f300, 0x1f64f],
  [0x1f680, 0x1f6ff],
  [0x1f900, 0x1f9ff],
  [0x1fa70, 0x1faff],
];

const UNICODE_BOX = {
  topLeft: '╭',
  topRight: '╮',
  bottomLeft: '╰',
  bottomRight: '╯',
  horizontal: '─',
  vertical: '│',
  teeLeft: '├',
  teeRight: '┤',
};

const ASCII_BOX = {
  topLeft: '+',
  topRight: '+',
  bottomLeft: '+',
  bottomRight: '+',
  horizontal: '-',
  vertical: '|',
  teeLeft: '+',
  teeRight: '+',
};

export function stripAnsi(text) {
  return String(text ?? '').replace(ANSI_PATTERN, '');
}

export function visibleWidth(text) {
  let width = 0;
  for (const char of Array.from(stripAnsi(text))) {
    width += charDisplayWidth(char);
  }
  return width;
}

export function charDisplayWidth(char) {
  if (!char || ZERO_WIDTH_PATTERN.test(char) || /\p{Mark}/u.test(char)) return 0;

  const codePoint = char.codePointAt(0);
  if (codePoint === undefined) return 0;
  if (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)) return 0;
  if (codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff) return 2;
  if (/\p{Extended_Pictographic}/u.test(char)) return 2;
  if (WIDE_CODE_POINT_RANGES.some(([start, end]) => codePoint >= start && codePoint <= end)) return 2;
  return 1;
}

export function terminalWidth(min = 72, max = 120, fallback = 88) {
  const columns = process.stdout.columns || fallback;
  return Math.max(min, Math.min(columns - 2, max));
}

export function supportsUnicodeUi(env = process.env, platform = process.platform) {
  if (env.WINTER_ASCII_UI === '1' || env.WINTER_ASCII_UI === 'true') return false;
  if (env.WINTER_UNICODE_UI === '1' || env.WINTER_UNICODE_UI === 'true') return platform !== 'win32';
  if (platform !== 'win32') return true;
  return false;
}

export function getBoxChars() {
  return ASCII_BOX;
}

export function padVisible(text, width, fill = ' ') {
  const visible = visibleWidth(text);
  const padCount = Math.max(0, width - visible);
  return `${text}${fill.repeat(padCount)}`;
}

export function wrapText(text, width) {
  const output = [];
  const lines = String(text ?? '').split(/\r?\n/);

  for (const line of lines) {
    const plain = stripAnsi(line);
    if (visibleWidth(plain) <= width) {
      output.push(line);
      continue;
    }

    const words = plain.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      output.push(plain.slice(0, width));
      continue;
    }

    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (visibleWidth(candidate) <= width) {
        current = candidate;
      } else {
        if (current) output.push(current);
        if (visibleWidth(word) > width) {
          const chunks = chunkText(word, width);
          output.push(...chunks.slice(0, -1));
          current = chunks[chunks.length - 1] || '';
        } else {
          current = word;
        }
      }
    }
    if (current) output.push(current);
  }

  return output;
}

export function chunkText(text, width) {
  const chars = Array.from(stripAnsi(text));
  const chunks = [];
  let current = '';
  let currentWidth = 0;
  for (const char of chars) {
    const charWidth = charDisplayWidth(char);
    if (current && currentWidth + charWidth > width) {
      chunks.push(current);
      current = '';
      currentWidth = 0;
    }
    current += char;
    currentWidth += charWidth;
  }
  if (current) chunks.push(current);
  return chunks.length > 0 ? chunks : [''];
}

export function renderBox({
  title = '',
  body = [],
  width,
  borderColor = '\x1b[35m',
  titleColor = '\x1b[36m',
  reset = '\x1b[0m',
  boxChars = getBoxChars(),
} = {}) {
  const innerWidth = Math.max(28, (width || terminalWidth()) - 4);
  const top = `${borderColor}${boxChars.topLeft}${boxChars.horizontal.repeat(innerWidth)}${boxChars.topRight}${reset}`;
  const bottom = `${borderColor}${boxChars.bottomLeft}${boxChars.horizontal.repeat(innerWidth)}${boxChars.bottomRight}${reset}`;
  const lines = [];
  const titleText = title ? ` ${title} ` : '';

  if (titleText) {
    const wrappedTitle = wrapText(titleText, innerWidth);
    wrappedTitle.forEach((segment, index) => {
      const plainSegment = stripAnsi(segment);
      const visible = visibleWidth(plainSegment);
      const padding = Math.max(0, innerWidth - visible);
      const left = index === 0 ? Math.floor(padding / 2) : 0;
      const right = index === 0 ? padding - left : padding;
      lines.push(`${borderColor}${boxChars.vertical}${reset}${' '.repeat(left)}${titleColor}${plainSegment}${reset}${' '.repeat(right)}${borderColor}${boxChars.vertical}${reset}`);
    });
    lines.push(`${borderColor}${boxChars.teeLeft}${boxChars.horizontal.repeat(innerWidth)}${boxChars.teeRight}${reset}`);
  }

  for (const item of body) {
    const rawText = String(item ?? '');
    if (visibleWidth(rawText) <= innerWidth) {
      const visible = visibleWidth(rawText);
      const padding = Math.max(0, innerWidth - visible);
      lines.push(`${borderColor}${boxChars.vertical}${reset} ${rawText}${' '.repeat(Math.max(0, padding - 1))}${borderColor}${boxChars.vertical}${reset}`);
      continue;
    }

    const wrapped = wrapText(rawText, innerWidth);
    if (wrapped.length === 0) {
      lines.push(`${borderColor}${boxChars.vertical}${reset} ${' '.repeat(Math.max(0, innerWidth - 1))}${borderColor}${boxChars.vertical}${reset}`);
      continue;
    }

    for (const segment of wrapped) {
      const text = stripAnsi(segment);
      const visible = visibleWidth(text);
      const padding = Math.max(0, innerWidth - visible);
      lines.push(`${borderColor}${boxChars.vertical}${reset} ${text}${' '.repeat(Math.max(0, padding - 1))}${borderColor}${boxChars.vertical}${reset}`);
    }
  }

  return [top, ...lines, bottom].join('\n');
}

export function renderKeyValueRows(rows, width, colors) {
  const innerWidth = Math.max(28, (width || terminalWidth()) - 4);
  const boxChars = getBoxChars();
  return rows.map(([left, right]) => {
    const leftWidth = Math.floor(innerWidth * 0.5);
    const rightWidth = innerWidth - leftWidth - 1;
    const leftText = padVisible(left, leftWidth);
    const rightText = padVisible(right, rightWidth);
    return `${colors.border}${boxChars.vertical}${colors.reset} ${leftText}${colors.spacer}${rightText} ${colors.border}${boxChars.vertical}${colors.reset}`;
  });
}



export const PANEL_HEIGHT = 5;

let _fixedEnabled = false;

export function enableFixedPanel() {
  if (!process.stdout.isTTY) return false;
  _fixedEnabled = true;
  const rows = process.stdout.rows || 24;
  const scrollBottom = Math.max(1, rows - PANEL_HEIGHT);
  process.stdout.write("\x1b[1;" + scrollBottom + "r");
  return true;
}

export function disableFixedPanel() {
  _fixedEnabled = false;
  process.stdout.write("\x1b[r");
}

export function refreshFixedPanel() {
  if (!_fixedEnabled || !process.stdout.isTTY) return;
  const rows = process.stdout.rows || 24;
  const scrollBottom = Math.max(1, rows - PANEL_HEIGHT);
  process.stdout.write("\x1b[1;" + scrollBottom + "r");
}

export function drawInFixedArea(content) {
  if (!_fixedEnabled || !process.stdout.isTTY) return;
  const rows = process.stdout.rows || 24;
  const startRow = Math.max(1, rows - PANEL_HEIGHT + 1);
  process.stdout.write("\x1b7");
  process.stdout.write("\x1b[" + startRow + ";1H");
  process.stdout.write("\x1b[J");
  process.stdout.write(String(content ?? ""));
  process.stdout.write("\x1b8");
}

export function moveToScrollRegion() {
  if (!process.stdout.isTTY) return;
  const rows = process.stdout.rows || 24;
  const scrollBottom = Math.max(1, rows - PANEL_HEIGHT);
  process.stdout.write("\x1b[" + scrollBottom + ";1H");
}

export function moveToPromptRow() {
  if (!process.stdout.isTTY) return;
  const rows = process.stdout.rows || 24;
  // Position prompt at last scrollable row (just above the fixed panel)
  const promptRow = Math.max(1, rows - PANEL_HEIGHT - 1);
  process.stdout.write("\x1b[" + promptRow + ";1H");
}

