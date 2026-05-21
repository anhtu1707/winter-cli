/**
 * ❄ @-SYMBOLS CONTEXT SYSTEM ❄
 * Parses @-symbols in user input and resolves them to context.
 * Supports: @file, @folder, @def, @code, @problems, @web, @docs, @search
 *
 * Inspired by Cursor's @-symbols feature.
 */
import path from 'path';
import { promises as fs } from 'fs';

const AT_SYMBOL_PATTERN = /@(file|folder|dir|def|definition|code|problems|web|docs|search)(?::([^\s"'`]+))?/gi;
const BARE_FILE_MENTION_PATTERN = /(^|\s)@([^\s"'`]+)/g;
const AT_PREFIXES = new Set(['file', 'folder', 'dir', 'def', 'definition', 'code', 'problems', 'web', 'docs', 'search']);

export class AtContextResolver {
  constructor(options = {}) {
    this.projectPath = options.projectPath || process.cwd();
    this.codebaseSearch = options.codebaseSearch || null;
    this.tools = options.tools || null;
  }

  /**
   * Parse user input and extract @-symbol references.
   * Returns { input, contexts } where input has @-symbols removed
   * and contexts is an array of resolved context objects.
   */
  async parse(input) {
    const contexts = [];
    let modifiedInput = input;

    let match;
    AT_SYMBOL_PATTERN.lastIndex = 0;

    while ((match = AT_SYMBOL_PATTERN.exec(input)) !== null) {
      const [fullMatch, type, value] = match;
      const resolved = await this._resolve(type, (value || '').trim());

      if (resolved) {
        contexts.push(resolved);
        modifiedInput = modifiedInput.replace(fullMatch, '').trim();
      }
    }

    BARE_FILE_MENTION_PATTERN.lastIndex = 0;
    while ((match = BARE_FILE_MENTION_PATTERN.exec(input)) !== null) {
      const [fullMatch, leading, value] = match;
      const token = String(value || '').trim();
      if (!token || AT_PREFIXES.has(token.split(':')[0].toLowerCase())) continue;
      const resolved = await this._resolveBareFile(token);
      if (resolved) {
        contexts.push(resolved);
        modifiedInput = modifiedInput.replace(fullMatch, leading).trim();
      }
    }

    return {
      input: modifiedInput,
      contexts,
      hasAtReferences: contexts.length > 0,
    };
  }

  /**
   * Check if input contains @-symbols.
   */
  hasAtReferences(input) {
    AT_SYMBOL_PATTERN.lastIndex = 0;
    BARE_FILE_MENTION_PATTERN.lastIndex = 0;
    return AT_SYMBOL_PATTERN.test(input) || BARE_FILE_MENTION_PATTERN.test(input);
  }

  /**
   * Format contexts as a system prompt section.
   */
  formatContextPrompt(contexts) {
    if (!contexts || contexts.length === 0) return '';

    const parts = contexts.map(ctx => {
      switch (ctx.type) {
        case 'file':
          return `--- @file:${ctx.path} ---\n${ctx.content}`;
        case 'folder':
          return `--- @folder:${ctx.path} ---\n${ctx.content}`;
        case 'def':
        case 'definition':
          return `--- @def:${ctx.name} (${ctx.filePath}:${ctx.line}) ---\n${ctx.content}`;
        case 'code':
          return `--- @code search: "${ctx.query}" ---\n${ctx.content}`;
        case 'problems':
          return `--- @problems ---\n${ctx.content}`;
        case 'web':
          return `--- @web: ${ctx.query} ---\n${ctx.content}`;
        case 'docs':
          return `--- @docs: ${ctx.query} ---\n${ctx.content}`;
        case 'search':
          return `--- @search: "${ctx.query}" ---\n${ctx.content}`;
        default:
          return ctx.content || '';
      }
    });

    return `## @-References Context\n${parts.join('\n\n')}`;
  }

  // ── Resolvers ──────────────────────────────────────

  async _resolve(type, value) {
    switch (type.toLowerCase()) {
      case 'file':
        return this._resolveFile(value);
      case 'folder':
      case 'dir':
        return this._resolveFolder(value);
      case 'def':
      case 'definition':
        return this._resolveDefinition(value);
      case 'code':
        return this._resolveCodeSearch(value);
      case 'problems':
        return this._resolveProblems(value);
      case 'web':
        return this._resolveWeb(value);
      case 'docs':
        return this._resolveDocs(value);
      case 'search':
        return this._resolveSearch(value);
      default:
        return null;
    }
  }

  async _resolveBareFile(value) {
    const clean = String(value || '').replace(/[),.;:!?]+$/g, '');
    if (!clean) return null;
    if (!/[./\\]/.test(clean) && !/\.[A-Za-z0-9]+$/.test(clean)) return null;
    return this._resolveFile(clean);
  }

  async _resolveFile(value) {
    if (!value) return null;
    const filePath = path.resolve(this.projectPath, value);
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return {
        type: 'file',
        path: value,
        content: content.length > 8000 ? content.slice(0, 8000) + '\n[... truncated]' : content,
        lineCount: content.split('\n').length,
      };
    } catch {
      return { type: 'file', path: value, content: `[File not found: ${value}]` };
    }
  }

  async _resolveFolder(value) {
    if (!value) return null;
    const dirPath = path.resolve(this.projectPath, value);
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const files = entries
        .filter(e => e.isFile())
        .map(e => `  ${e.name}`)
        .join('\n');
      const dirs = entries
        .filter(e => e.isDirectory())
        .map(e => `  ${e.name}/`)
        .join('\n');
      return {
        type: 'folder',
        path: value,
        content: `Directory: ${value}\n\nSubdirectories:\n${dirs || '  (none)'}\n\nFiles:\n${files || '  (none)'}`,
        fileCount: entries.length,
      };
    } catch {
      return { type: 'folder', path: value, content: `[Directory not found: ${value}]` };
    }
  }

  async _resolveDefinition(value) {
    if (!value || !this.codebaseSearch) return null;
    const matches = await this.codebaseSearch.findSymbol(value, { limit: 5 });
    if (matches.length === 0) return { type: 'def', name: value, content: `[Symbol "${value}" not found]` };

    const content = matches.map(m =>
      `  ${m.type}: ${m.name} → ${m.filePath}:${m.line}`
    ).join('\n');

    // Get full context of the top match
    let fullContext = '';
    if (matches[0]) {
      const fileCtx = this.codebaseSearch.getFileContext(matches[0].filePath);
      const matchChunk = fileCtx.chunks.find(c => c.symbols.some(s => s.name.toLowerCase() === value.toLowerCase()));
      if (matchChunk) {
        fullContext = `\n\n--- ${matches[0].filePath} (lines ${matchChunk.startLine}-${matchChunk.endLine}) ---\n${matchChunk.content}`;
      }
    }

    return {
      type: 'def',
      name: value,
      filePath: matches[0]?.filePath || '',
      line: matches[0]?.line || 0,
      content: `Found ${matches.length} definition(s):\n${content}${fullContext}`,
    };
  }

  async _resolveCodeSearch(value) {
    if (!value || !this.codebaseSearch) return null;
    const results = await this.codebaseSearch.query(value, { limit: 10 });

    if (results.totalResults === 0) {
      return { type: 'code', query: value, content: `[No results for code search: ${value}]` };
    }

    const content = results.byFile.slice(0, 5).map(f => {
      const snippet = f.chunks.slice(0, 2).map(c =>
        `  (lines ${c.startLine}-${c.endLine}) ${c.content.split('\n').slice(0, 3).join('\n  ')}`
      ).join('\n');
      return `📄 ${f.filePath} (score: ${f.score.toFixed(0)})\n${snippet}`;
    }).join('\n\n');

    return {
      type: 'code',
      query: value,
      content,
      resultCount: results.totalResults,
    };
  }

  async _resolveProblems(value) {
    // Try to get lint/build errors from terminal or config
    if (!this.tools) return { type: 'problems', content: '[@problems requires tool access to lint/build commands]' };

    const result = await this.tools.execute('Bash', {
      command: 'npm run lint 2>&1 || npm run typecheck 2>&1 || echo "No lint/typecheck scripts found"',
    }).catch(() => ({ stdout: '', stderr: 'Error running linter' }));

    return {
      type: 'problems',
      content: result.stdout || result.stderr || 'No problems found',
    };
  }

  async _resolveWeb(value) {
    if (!value) return { type: 'web', query: '', content: '[@web requires a search query]' };
    // Web search would use the tool system
    return {
      type: 'web',
      query: value,
      content: `[Web search for "${value}" requires active provider]`,
    };
  }

  async _resolveDocs(value) {
    if (!value) return { type: 'docs', query: '', content: '[@docs requires a documentation query]' };
    return {
      type: 'docs',
      query: value,
      content: `[Documentation search for "${value}" requires active provider]`,
    };
  }

  async _resolveSearch(value) {
    if (!value || !this.codebaseSearch) return null;
    return this._resolveCodeSearch(value);
  }
}

export default AtContextResolver;
