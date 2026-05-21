import path from 'path';
import { estimateTokens, WikiMemoryStore } from './wiki-memory.js';

const DEFAULT_INLINE_TOKENS = 1400;
const LARGE_ARRAY_LIMIT = 80;

function compactText(text, maxChars = 1600) {
  const value = String(text ?? '');
  if (value.length <= maxChars) return value;
  const head = value.slice(0, Math.floor(maxChars * 0.7));
  const tail = value.slice(-Math.floor(maxChars * 0.2));
  const omitted = value.length - head.length - tail.length;
  return `${head}\n[TokenJuice omitted ${omitted} chars]\n${tail}`;
}

function fenced(label, value) {
  const text = String(value ?? '');
  if (!text.trim()) return '';
  return [`## ${label}`, '', '```text', text, '```', ''].join('\n');
}

function tableRows(items = [], keys = []) {
  if (!items.length || !keys.length) return '';
  const header = `| ${keys.join(' | ')} |`;
  const divider = `| ${keys.map(() => '---').join(' | ')} |`;
  const rows = items.map(item => `| ${keys.map(key => String(item?.[key] ?? '').replace(/\r?\n/g, ' ').slice(0, 240)).join(' | ')} |`);
  return [header, divider, ...rows].join('\n');
}

export function serializeToolResultToMarkdown(toolName, result = {}) {
  const title = `Tool Result: ${toolName || 'unknown'}`;
  const lines = [`# ${title}`, ''];
  const metaKeys = ['success', 'path', 'url', 'command', 'cwd', 'lines', 'size', 'count', 'error'];
  const meta = metaKeys
    .filter(key => result[key] !== undefined && result[key] !== null && String(result[key]).length <= 1000)
    .map(key => `- ${key}: ${String(result[key]).replace(/\r?\n/g, ' ')}`);
  if (meta.length) lines.push('## Metadata', '', ...meta, '');

  for (const key of ['content', 'stdout', 'stderr', 'diff', 'message']) {
    if (typeof result[key] === 'string' && result[key]) lines.push(fenced(key, result[key]));
  }

  for (const key of ['matches', 'files', 'cells', 'results']) {
    const value = result[key];
    if (!Array.isArray(value) || value.length === 0) continue;
    lines.push(`## ${key}`, '');
    if (typeof value[0] === 'object' && value[0] !== null) {
      const keys = Object.keys(value[0]).slice(0, 6);
      lines.push(tableRows(value.slice(0, LARGE_ARRAY_LIMIT), keys), '');
      if (value.length > LARGE_ARRAY_LIMIT) lines.push(`- ${value.length - LARGE_ARRAY_LIMIT} additional items omitted from table preview.`, '');
    } else {
      lines.push(...value.slice(0, LARGE_ARRAY_LIMIT).map(item => `- ${String(item)}`), '');
      if (value.length > LARGE_ARRAY_LIMIT) lines.push(`- ${value.length - LARGE_ARRAY_LIMIT} additional items omitted from list preview.`, '');
    }
  }

  const known = new Set([...metaKeys, 'content', 'stdout', 'stderr', 'diff', 'message', 'matches', 'files', 'cells', 'results']);
  const rest = Object.fromEntries(Object.entries(result).filter(([key]) => !known.has(key)));
  if (Object.keys(rest).length) lines.push(fenced('json', JSON.stringify(rest, null, 2)));
  return lines.filter(value => value !== '').join('\n');
}

export function extractKeyLines(text = '', limit = 18) {
  const patterns = /(error|failed|exception|warning|todo|fixme|export |import |class |function |const |let |var |def |interface |type |=>)/i;
  const selected = [];
  const lines = String(text).split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (patterns.test(line)) selected.push(`L${index + 1}: ${line.trim()}`);
    if (selected.length >= limit) break;
  }
  return selected;
}

function buildExcerpts(text = '', maxChars = 700) {
  const value = String(text || '').trim();
  if (!value) return [];
  if (value.length <= maxChars) return [value];
  const head = value.slice(0, Math.floor(maxChars * 0.58)).trimEnd();
  const tail = value.slice(-Math.floor(maxChars * 0.32)).trimStart();
  return [
    `${head}\n[TokenJuice middle omitted from inline preview; full text is in memory]\n${tail}`,
  ];
}

function buildChunkMap(saved) {
  if (!saved?.files?.length) return [];
  return saved.files.map(file => {
    const label = `part ${file.part}/${saved.parts}`;
    return `- ${label}: ${file.wikiLink} (~${file.tokensEst} tokens)`;
  });
}

export function buildCompressedPreview(toolName, result, markdown, savedOrLinks = []) {
  const links = Array.isArray(savedOrLinks) ? savedOrLinks : (savedOrLinks?.links || []);
  const source = [result?.error, result?.content, result?.stdout, result?.stderr, result?.diff, result?.message]
    .filter(Boolean)
    .join('\n');
  const keyLines = extractKeyLines(source);
  const excerpts = buildExcerpts(source || markdown);
  const chunkMap = Array.isArray(savedOrLinks) ? [] : buildChunkMap(savedOrLinks);
  const lines = [
    `TokenJuice losslessly stored a large ${toolName || 'tool'} result before model context.`,
    links.length ? `Full detail chunks: ${links.join(', ')}` : '',
    chunkMap.length ? 'Chunk map for exact detail retrieval:' : '',
    ...chunkMap,
    'Instruction: use Read on the memory file behind a chunk link when exact omitted lines are needed.',
    keyLines.length ? 'Key lines with original line numbers:' : '',
    ...keyLines.map(line => `- ${line}`),
    excerpts.length ? 'Representative excerpts:' : '',
    ...excerpts.map(excerpt => compactText(excerpt, 900)),
  ].filter(Boolean);
  return lines.join('\n');
}

export class TokenJuice {
  constructor({
    projectPath = process.cwd(),
    store,
    maxChunkTokens = 3000,
    inlineBudgetTokens = DEFAULT_INLINE_TOKENS,
    enabled = true,
  } = {}) {
    this.projectPath = path.resolve(projectPath);
    this.store = store || new WikiMemoryStore({ projectPath: this.projectPath, maxChunkTokens });
    this.inlineBudgetTokens = inlineBudgetTokens;
    this.enabled = enabled;
  }

  shouldCompress(markdown, result = {}) {
    if (!this.enabled) return false;
    if (!result || typeof result !== 'object') return false;
    if (result.tokenJuice?.compressed) return false;
    return estimateTokens(markdown) > this.inlineBudgetTokens;
  }

  async compressToolResult({ toolName, result, promptResult } = {}) {
    if (!result || typeof result !== 'object') return promptResult ?? result;
    const basePromptResult = promptResult ?? result;
    const markdown = serializeToolResultToMarkdown(toolName, result);
    const originalTokens = estimateTokens(markdown);
    if (!this.shouldCompress(markdown, result)) {
      return basePromptResult;
    }

    try {
      const title = `${toolName || 'tool'} ${result.path || result.url || result.command || 'output'}`;
      const saved = await this.store.saveMarkdownChunks({
        title,
        markdown,
        type: 'tool-output',
        namespace: `tool-output/${String(toolName || 'unknown').toLowerCase()}`,
        metadata: {
          tool: toolName || 'unknown',
          source: result.path || result.url || result.command || '',
        },
      });
      const preview = buildCompressedPreview(toolName, result, markdown, saved);
      const compressed = {
        ...basePromptResult,
        content: preview,
        stdout: basePromptResult.stdout ? preview : basePromptResult.stdout,
        stderr: basePromptResult.stderr && !basePromptResult.stdout ? compactText(basePromptResult.stderr, 600) : basePromptResult.stderr,
        tokenJuice: {
          compressed: true,
          originalTokens,
          inlineTokens: estimateTokens(preview),
          chunkTokens: 3000,
          memoryRoot: saved.rootDir,
          memoryLinks: saved.links,
          memoryFiles: saved.files.map(file => file.relativePath),
          detailRetrieval: 'Read the listed memoryFiles for exact omitted content.',
          parts: saved.parts,
        },
      };

      if (!compressed.content && !compressed.stdout && !compressed.stderr) {
        compressed.content = `TokenJuice stored large tool output in ${saved.links.join(', ')}`;
      }

      return compressed;
    } catch (error) {
      return {
        ...basePromptResult,
        tokenJuice: {
          compressed: false,
          originalTokens,
          error: error?.message || String(error),
        },
      };
    }
  }
}
