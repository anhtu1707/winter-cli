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
  for (let i = 0; i < chars.length; i += width) {
    chunks.push(chars.slice(i, i + width).join(''));
  }
  return chunks.length > 0 ? chunks : [''];
}

export function renderBox({ title = '', body = [], width, borderColor = '\x1b[35m', titleColor = '\x1b[36m', reset = '\x1b[0m' }) {
  const innerWidth = Math.max(28, (width || terminalWidth()) - 4);
  const top = `${borderColor}╭${'─'.repeat(innerWidth)}╮${reset}`;
  const bottom = `${borderColor}╰${'─'.repeat(innerWidth)}╯${reset}`;
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
      lines.push(`${borderColor}│${reset}${' '.repeat(left)}${titleColor}${plainSegment}${reset}${' '.repeat(right)}${borderColor}│${reset}`);
    });
    lines.push(`${borderColor}├${'─'.repeat(innerWidth)}┤${reset}`);
  }

  for (const item of body) {
    const rawText = String(item ?? '');
    if (visibleWidth(rawText) <= innerWidth) {
      const visible = visibleWidth(rawText);
      const padding = Math.max(0, innerWidth - visible);
      lines.push(`${borderColor}│${reset} ${rawText}${' '.repeat(Math.max(0, padding - 1))}${borderColor}│${reset}`);
      continue;
    }

    const wrapped = wrapText(rawText, innerWidth);
    if (wrapped.length === 0) {
      lines.push(`${borderColor}│${reset} ${' '.repeat(Math.max(0, innerWidth - 1))}${borderColor}│${reset}`);
      continue;
    }

    for (const segment of wrapped) {
      const text = stripAnsi(segment);
      const visible = visibleWidth(text);
      const padding = Math.max(0, innerWidth - visible);
      lines.push(`${borderColor}│${reset} ${text}${' '.repeat(Math.max(0, padding - 1))}${borderColor}│${reset}`);
    }
  }

  return [top, ...lines, bottom].join('\n');
}

export function renderKeyValueRows(rows, width, colors) {
  const innerWidth = Math.max(28, (width || terminalWidth()) - 4);
  return rows.map(([left, right]) => {
    const leftWidth = Math.floor(innerWidth * 0.5);
    const rightWidth = innerWidth - leftWidth - 1;
    const leftText = padVisible(left, leftWidth);
    const rightText = padVisible(right, rightWidth);
    return `${colors.border}│${colors.reset} ${leftText}${colors.spacer}${rightText} ${colors.border}│${colors.reset}`;
  });
}
