/**
 * ❄ CODEBASE INDEXER ❄
 * Scans project files, creates chunks for embedding/search.
 * Phase 1 — Cursor-like codebase indexing.
 */
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

const DEFAULT_IGNORE = new Set([
  'node_modules', '.git', 'dist', 'build', '.winter', '.codegraph', '.claude',
  '.next', '.cache', 'coverage', '.nyc_output',
  '__pycache__', '.venv', 'venv', 'env', '.env',
  'VSCode-win32-x64', 'vscode-main',
  '*.min.js', '*.bundle.js', '*.chunk.js',
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  '*.svg', '*.png', '*.jpg', '*.jpeg', '*.gif', '*.ico', '*.woff', '*.woff2',
]);

const DEFAULT_IGNORE_PATHS = new Set([
  'resources/local',
]);

const EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
  '.json', '.md', '.css', '.scss', '.less', '.html',
  '.py', '.rb', '.go', '.java', '.rs', '.c', '.cpp', '.h', '.hpp',
  '.yaml', '.yml', '.toml', '.xml', '.sql',
  '.sh', '.bash', '.zsh', '.ps1',
  '.vue', '.svelte', '.astro',
  '.graphql', '.prisma',
  '.swift', '.kt', '.kts',
]);

const CHUNK_MIN_LINES = 10;
const CHUNK_MAX_LINES = 80;
const CHUNK_OVERLAP_LINES = 5;

export class CodebaseIndexer {
  constructor(options = {}) {
    this.projectPath = path.resolve(options.projectPath || process.cwd());
    this.cacheDir = options.cacheDir || path.join(this.projectPath, '.winter', 'codebase-index');
    this.ignorePatterns = new Set([...DEFAULT_IGNORE, ...(options.extraIgnore || [])]);
    this.ignorePaths = new Set([...DEFAULT_IGNORE_PATHS, ...(options.extraIgnorePaths || [])].map(p => this._normalizePath(p)));
    this.extensions = new Set([...EXTENSIONS, ...(options.extraExtensions || [])]);
    this.chunks = [];
    this.fileHashes = new Map(); // filePath -> content hash
    this.lastIndexedAt = null;
  }

  async init() {
    await fs.mkdir(this.cacheDir, { recursive: true });
    await this._loadCache();
  }

  async indexAll() {
    await this.init();
    const files = await this._discoverFiles();
    const newChunks = [];
    const updatedFiles = [];

    for (const filePath of files) {
      try {
        const content = await fs.readFile(filePath, 'utf8');
        const relativePath = this._relativePath(filePath);
        const hash = this._hashContent(content);

        if (this.fileHashes.get(relativePath) === hash) continue; // unchanged

        this.fileHashes.set(relativePath, hash);
        updatedFiles.push(relativePath);

        const fileChunks = this._chunkContent(relativePath, content);
        newChunks.push(...fileChunks);
      } catch {
        // skip unreadable files
      }
    }

    // Remove chunks for deleted files
    const indexedPaths = new Set(files.map(filePath => this._relativePath(filePath)));
    this.chunks = this.chunks.filter(chunk => indexedPaths.has(chunk.filePath));
    this.fileHashes.forEach((_hash, fp) => {
      if (!indexedPaths.has(fp)) this.fileHashes.delete(fp);
    });

    // Replace chunks for updated files
    const updatedPaths = new Set(updatedFiles);
    this.chunks = this.chunks.filter(chunk => !updatedPaths.has(chunk.filePath));
    this.chunks.push(...newChunks);

    this.lastIndexedAt = Date.now();
    await this._saveCache();

    return {
      totalFiles: files.length,
      indexedFiles: updatedFiles.length,
      totalChunks: this.chunks.length,
      newChunks: newChunks.length,
      skipped: files.length - updatedFiles.length,
    };
  }

  async indexFile(filePath) {
    const absolutePath = path.resolve(this.projectPath, filePath);
    const relativePath = this._relativePath(absolutePath);

    if (!this.extensions.has(path.extname(absolutePath))) return null;
    if (this._isIgnored(relativePath)) return null;

    try {
      const content = await fs.readFile(absolutePath, 'utf8');
      const hash = this._hashContent(content);

      // Remove old chunks for this file
      this.chunks = this.chunks.filter(chunk => chunk.filePath !== relativePath);
      this.fileHashes.set(relativePath, hash);

      const fileChunks = this._chunkContent(relativePath, content);
      this.chunks.push(...fileChunks);

      await this._saveCache();
      return { filePath: relativePath, chunks: fileChunks.length };
    } catch {
      return null;
    }
  }

  async removeFile(filePath) {
    const relativePath = this._relativePath(path.resolve(this.projectPath, filePath));
    this.chunks = this.chunks.filter(chunk => chunk.filePath !== relativePath);
    this.fileHashes.delete(relativePath);
    await this._saveCache();
  }

  search(query, options = {}) {
    const limit = options.limit || 20;
    const queryLower = query.toLowerCase();
    const queryTokens = queryLower.split(/\s+/).filter(t => t.length > 1);

    const scored = this.chunks.map(chunk => ({
      ...chunk,
      score: this._scoreChunk(chunk, queryLower, queryTokens),
    }))
      .filter(c => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return scored;
  }

  getStats() {
    return {
      totalChunks: this.chunks.length,
      totalFiles: this.fileHashes.size,
      lastIndexedAt: this.lastIndexedAt,
      cacheDir: this.cacheDir,
    };
  }

  async clear() {
    this.chunks = [];
    this.fileHashes.clear();
    this.lastIndexedAt = null;
    await this._saveCache();
  }

  // ── Private Methods ──────────────────────────────────────

  async _discoverFiles() {
    const files = [];
    await this._walkDir(this.projectPath, files);
    return files;
  }

  async _walkDir(dir, results) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relPath = path.relative(this.projectPath, fullPath);

        if (this._isIgnored(relPath, entry)) continue;

        if (entry.isDirectory()) {
          await this._walkDir(fullPath, results);
        } else if (entry.isFile() && this.extensions.has(path.extname(fullPath))) {
          results.push(fullPath);
        }
      }
    } catch {
      // skip unreadable dirs
    }
  }

  _isIgnored(relPath, entry) {
    const normalizedPath = this._normalizePath(relPath);
    if (this.ignorePaths.has(normalizedPath)) return true;
    for (const ignoredPath of this.ignorePaths) {
      if (normalizedPath.startsWith(`${ignoredPath}/`)) return true;
    }

    const parts = normalizedPath.split('/');
    for (const part of parts) {
      if (this.ignorePatterns.has(part)) return true;
      // Do NOT hide all dotfiles — only specific ones in ignorePatterns (like .git, .winter).
      // .env, .gitignore, .editorconfig should be indexable.
    }
    // Glob-like ignores
    for (const pattern of this.ignorePatterns) {
      if (pattern.startsWith('*') && normalizedPath.endsWith(pattern.slice(1))) return true;
    }
    return false;
  }

  _relativePath(filePath) {
    return this._normalizePath(path.relative(this.projectPath, path.resolve(filePath)));
  }

  _normalizePath(filePath) {
    return String(filePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  }

  _chunkContent(filePath, content) {
    const lines = content.split(/\r?\n/);
    const chunks = [];
    const ext = path.extname(filePath);
    const language = this._detectLanguage(ext);

    // For small files, keep as one chunk
    if (lines.length <= CHUNK_MAX_LINES) {
      return [{
        id: this._makeChunkId(filePath, 0),
        filePath,
        language,
        startLine: 1,
        endLine: lines.length,
        content: content,
        tokens: lines.length,
        symbols: this._extractSymbols(content, language),
      }];
    }

    // Split into overlapping chunks
    let start = 0;
    let chunkIndex = 0;
    while (start < lines.length) {
      const end = Math.min(start + CHUNK_MAX_LINES, lines.length);
      const chunkLines = lines.slice(start, end);

      // Skip chunks that are too short (likely tail)
      if (chunkLines.length >= CHUNK_MIN_LINES || chunkIndex === 0) {
        chunks.push({
          id: this._makeChunkId(filePath, chunkIndex),
          filePath,
          language,
          startLine: start + 1,
          endLine: end,
          content: chunkLines.join('\n'),
          tokens: chunkLines.length,
          symbols: chunkIndex === 0 ? this._extractSymbols(content, language) : [],
        });
        chunkIndex++;
      }

      start += CHUNK_MAX_LINES - CHUNK_OVERLAP_LINES;
    }

    return chunks;
  }

  _extractSymbols(content, language) {
    const symbols = [];
    const lines = content.split(/\r?\n/);

    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];
      const trimmed = line.trim();
      const lineNumber = idx + 1; // 1-based line number

      // Function/class/method definitions
      const defMatch = trimmed.match(/^(?:export\s+)?(?:async\s+)?(?:function\s+\*?\s*|class\s+|interface\s+|type\s+|enum\s+|const\s+\w+\s*=\s*(?:async\s+)?(?:function|\(|[A-Z]\w*\s*:\s*))/);
      if (defMatch) {
        const name = trimmed.match(/(?:function|class|interface|type|enum|const)\s+(\w+)/);
        if (name) symbols.push({ type: 'definition', name: name[1], line: lineNumber });
        continue;
      }

      // Method definitions in classes/objects
      const methodMatch = trimmed.match(/^\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*[^{]+)?\s*\{/);
      if (methodMatch && !['if', 'for', 'while', 'switch', 'catch'].includes(methodMatch[1])) {
        symbols.push({ type: 'method', name: methodMatch[1], line: lineNumber });
        continue;
      }

      // Export default
      const exportMatch = trimmed.match(/^export\s+default\s+(?:function|class)\s+(\w+)/);
      if (exportMatch) {
        symbols.push({ type: 'export', name: exportMatch[1], line: lineNumber });
        continue;
      }

      // Module exports (Node.js)
      const moduleExport = trimmed.match(/^(?:module\.)?exports\s*[.=]\s*(?:async\s+)?(?:function\s+)?(\w+)/);
      if (moduleExport) {
        symbols.push({ type: 'export', name: moduleExport[1], line: lineNumber });
      }
    }

    return symbols;
  }

  _detectLanguage(ext) {
    const map = {
      '.js': 'javascript', '.jsx': 'jsx', '.ts': 'typescript', '.tsx': 'tsx',
      '.mjs': 'javascript', '.cjs': 'javascript',
      '.json': 'json', '.md': 'markdown', '.css': 'css', '.scss': 'scss', '.less': 'less',
      '.html': 'html', '.py': 'python', '.rb': 'ruby', '.go': 'go', '.java': 'java',
      '.rs': 'rust', '.c': 'c', '.cpp': 'cpp', '.h': 'c', '.hpp': 'cpp',
      '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'toml', '.xml': 'xml', '.sql': 'sql',
      '.sh': 'bash', '.bash': 'bash', '.zsh': 'bash', '.ps1': 'powershell',
      '.vue': 'vue', '.svelte': 'svelte', '.astro': 'astro',
      '.graphql': 'graphql', '.prisma': 'prisma',
      '.swift': 'swift', '.kt': 'kotlin', '.kts': 'kotlin',
    };
    return map[ext] || 'text';
  }

  _scoreChunk(chunk, queryLower, queryTokens) {
    let score = 0;
    const contentLower = chunk.content.toLowerCase();

    // Exact phrase match
    if (contentLower.includes(queryLower)) {
      score += 50;
    }

    // Token matches
    for (const token of queryTokens) {
      if (contentLower.includes(token)) {
        score += 10;
        // Boost for matches in first N lines (likely headers/signatures)
        const firstLines = contentLower.split('\n').slice(0, 5).join(' ');
        if (firstLines.includes(token)) score += 5;
      }
    }

    // Symbol match boost
    for (const sym of chunk.symbols) {
      if (queryLower.includes(sym.name.toLowerCase()) || sym.name.toLowerCase().includes(queryLower)) {
        score += 20;
      }
    }

    // File name match boost
    const fileName = path.basename(chunk.filePath).toLowerCase();
    for (const token of queryTokens) {
      if (fileName.includes(token) || token.includes(fileName)) {
        score += 15;
      }
    }

    return score;
  }

  _makeChunkId(filePath, index) {
    const raw = `${filePath}::${index}`;
    return crypto.createHash('md5').update(raw).digest('hex').slice(0, 12);
  }

  _hashContent(content) {
    return crypto.createHash('md5').update(content).digest('hex');
  }

  async _loadCache() {
    const indexPath = path.join(this.cacheDir, 'index.json');
    try {
      const raw = await fs.readFile(indexPath, 'utf8');
      const data = JSON.parse(raw);
      this.chunks = data.chunks || [];
      this.fileHashes = new Map(Object.entries(data.fileHashes || {}));
      this.lastIndexedAt = data.lastIndexedAt || null;
    } catch {
      this.chunks = [];
      this.fileHashes = new Map();
      this.lastIndexedAt = null;
    }
  }

  async _saveCache() {
    const indexPath = path.join(this.cacheDir, 'index.json');
    const data = {
      chunks: this.chunks,
      fileHashes: Object.fromEntries(this.fileHashes),
      lastIndexedAt: this.lastIndexedAt,
      projectPath: this.projectPath,
    };
    await fs.writeFile(indexPath, JSON.stringify(data), 'utf8');
  }
}

export default CodebaseIndexer;
