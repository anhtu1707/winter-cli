import { highlight } from 'cli-highlight';

import { colors } from './snowflake-logo.js';
import { renderBox, terminalWidth, visibleWidth, wrapText, padVisible } from './terminal-ui.js';

export function formatMarkdown(text) {
  if (!text) return '';
  let formatted = text;

  formatted = formatted.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
    const label = lang || 'code';
    let coloredCode = code.trimEnd();
    try {
      coloredCode = highlight(coloredCode, { language: lang || 'javascript', ignoreIllegals: true });
    } catch {
      // Keep raw code when the highlighter cannot parse a language.
    }

    const boxWidth = Math.max(60, Math.min(terminalWidth(60, 100, 80), 100));
    const body = wrapText(coloredCode, boxWidth - 4);

    return `\n${renderBox({
      title: label,
      width: boxWidth,
      borderColor: colors.dim,
      titleColor: colors.dim,
      body,
    })}\n${colors.white}`;
  });

  formatted = formatMarkdownTables(formatted);
  formatted = formatted.replace(/\*\*(.*?)\*\*/g, `${colors.bright}$1${colors.reset}${colors.white}`);
  formatted = formatted.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, `${colors.italic || colors.dim}$1${colors.reset}${colors.white}`);
  formatted = formatted.replace(/`([^`\n]+)`/g, `${colors.cyan}$1${colors.reset}${colors.white}`);
  formatted = formatted.replace(/^### (.+)$/gm, `${colors.cyan}   $1${colors.reset}`);
  formatted = formatted.replace(/^## (.+)$/gm, `${colors.cyan}${colors.bright}  $1${colors.reset}`);
  formatted = formatted.replace(/^# (.+)$/gm, `\n${colors.bright}${colors.cyan}━━ $1${colors.reset}\n`);
  formatted = formatted.replace(/^---+$/gm, `${colors.dim}${'─'.repeat(50)}${colors.reset}`);
  formatted = formatted.replace(/^(\s*)[-*] /gm, `$1${colors.cyan}•${colors.reset} `);
  formatted = formatted.replace(/^(\s*)(\d+)\. /gm, `$1${colors.cyan}$2.${colors.reset} `);

  return formatted;
}

export function formatMarkdownTables(text) {
  const lines = String(text ?? '').split(/\r?\n/);
  const output = [];

  for (let index = 0; index < lines.length;) {
    const currentLine = lines[index];
    const nextLine = lines[index + 1];

    if (isMarkdownTableRow(currentLine) && isMarkdownTableSeparator(nextLine)) {
      const block = [currentLine, nextLine];
      index += 2;

      while (index < lines.length && isMarkdownTableRow(lines[index])) {
        block.push(lines[index]);
        index++;
      }

      output.push(renderMarkdownTableBlock(block));
      continue;
    }

    output.push(currentLine);
    index++;
  }

  return output.join('\n');
}

function isMarkdownTableRow(line) {
  return /^\s*\|.*\|\s*$/.test(String(line || ''));
}

function isMarkdownTableSeparator(line) {
  if (!isMarkdownTableRow(line)) return false;
  const cells = splitMarkdownTableRow(line);
  return cells.length > 0 && cells.every(cell => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, '')));
}

function splitMarkdownTableRow(line) {
  return String(line || '')
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cell => cell.trim());
}

function renderMarkdownTableBlock(tableLines) {
  const rows = tableLines
    .filter((line, index) => index !== 1)
    .map(splitMarkdownTableRow)
    .filter(row => row.length > 0);

  const columnCount = Math.max(...rows.map(row => row.length), 0);
  if (columnCount === 0) return tableLines.join('\n');

  const boxWidth = Math.max(60, Math.min(terminalWidth(60, 100, 84), 100));
  const innerWidth = boxWidth - 4;
  const separatorWidth = (columnCount - 1) * 3;
  const availableWidth = Math.max(columnCount * 8, innerWidth - separatorWidth);

  const widestCells = Array.from({ length: columnCount }, (_, columnIndex) => {
    return Math.max(8, ...rows.map(row => visibleWidth(row[columnIndex] || '')));
  });

  const widestTotal = widestCells.reduce((sum, width) => sum + width, 0);
  const scale = widestTotal > availableWidth ? availableWidth / widestTotal : 1;
  const columnWidths = widestCells.map(width => Math.max(8, Math.floor(width * scale)));

  const renderRow = (cells) => {
    const wrappedCells = cells.map((cell, index) => wrapText(cell || '', columnWidths[index]));
    const lineCount = Math.max(...wrappedCells.map(lines => lines.length), 1);
    const rendered = [];

    for (let lineIndex = 0; lineIndex < lineCount; lineIndex++) {
      const parts = [];
      for (let columnIndex = 0; columnIndex < columnCount; columnIndex++) {
        const cellLine = wrappedCells[columnIndex][lineIndex] || '';
        parts.push(padVisible(cellLine, columnWidths[columnIndex]));
      }
      rendered.push(parts.join(' │ '));
    }

    return rendered;
  };

  const renderedRows = [];
  for (const row of rows) {
    renderedRows.push(...renderRow(row));
  }

  return renderBox({
    title: 'TABLE',
    width: boxWidth,
    borderColor: colors.dim,
    titleColor: colors.dim,
    body: renderedRows,
  });
}
