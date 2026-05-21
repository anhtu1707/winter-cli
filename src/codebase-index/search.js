/**
 * ❄ CODEBASE SEMANTIC SEARCH ❄
 * Wraps CodebaseIndexer with advanced query capabilities:
 * - Natural language search
 * - Symbol/definition search
 * - File path search
 * - Combined search
 */
import { CodebaseIndexer } from './indexer.js';
import { CodeGraphAdapter } from './codegraph-adapter.js';
import path from 'path';

export class CodebaseSearch {
  constructor(options = {}) {
    this.indexer = options.indexer || new CodebaseIndexer(options);
    this.projectPath = options.projectPath || this.indexer.projectPath;
    this.codeGraph = options.codeGraphAdapter || (
      options.enableCodeGraph ? new CodeGraphAdapter({ projectPath: this.projectPath }) : null
    );
  }

  async init() {
    await this.indexer.init();
    await this.codeGraph?.init?.();
  }

  async ensureIndexed() {
    const stats = this.indexer.getStats();
    await this.codeGraph?.ensureIndexed?.();
    if (stats.totalChunks === 0) {
      return await this.indexer.indexAll();
    }
    return stats;
  }

  /**
   * Search codebase with a natural language query.
   * Returns ranked chunks with scores.
   */
  async query(query, options = {}) {
    await this.ensureIndexed();
    const results = this.indexer.search(query, options);
    const graphResults = this.codeGraph
      ? await this.codeGraph.search(query, { limit: Math.min(options.limit || 20, 12) })
      : [];

    // Group by file for display
    const byFile = new Map();
    for (const r of results) {
      if (!byFile.has(r.filePath)) {
        byFile.set(r.filePath, []);
      }
      byFile.get(r.filePath).push(r);
    }

    return {
      query,
      totalResults: results.length + graphResults.length,
      totalFiles: byFile.size,
      results,
      graphResults,
      byFile: [...byFile.entries()].map(([filePath, chunks]) => ({
        filePath,
        score: Math.max(...chunks.map(c => c.score)),
        symbolCount: chunks.reduce((sum, c) => sum + c.symbols.length, 0),
        chunks,
      })),
    };
  }

  /**
   * Find symbol definitions (functions, classes, interfaces, etc.)
   */
  async findSymbol(name, options = {}) {
    await this.ensureIndexed();
    const graphMatches = this.codeGraph
      ? await this.codeGraph.findSymbol(name, options)
      : [];
    const nameLower = name.toLowerCase();
    const matches = [];

    for (const chunk of this.indexer.chunks) {
      for (const sym of chunk.symbols) {
        if (sym.name.toLowerCase() === nameLower || sym.name.toLowerCase().includes(nameLower)) {
          matches.push({
            ...sym,
            filePath: chunk.filePath,
            content: this._extractRelevantLine(chunk.content, sym.line),
            chunkId: chunk.id,
          });
        }
      }
    }

    return [...graphMatches, ...matches].slice(0, options.limit || 20);
  }

  async buildGraphContext(task, options = {}) {
    if (!this.codeGraph) return '';
    return await this.codeGraph.buildContext(task, options);
  }

  /**
   * Search by file path pattern
   */
  async findFiles(pattern) {
    await this.ensureIndexed();
    const patternLower = pattern.toLowerCase();
    const matchedPaths = new Set();

    for (const chunk of this.indexer.chunks) {
      const fp = chunk.filePath.toLowerCase();
      if (fp.includes(patternLower) || fp.endsWith(patternLower)) {
        matchedPaths.add(chunk.filePath);
      }
    }

    return [...matchedPaths].sort();
  }

  /**
   * Get context for a specific file (all chunks)
   */
  getFileContext(filePath) {
    const normalized = path.relative(this.projectPath, path.resolve(this.projectPath, filePath)).replace(/\\/g, '/');
    const chunks = this.indexer.chunks.filter(c => c.filePath === normalized);
    return {
      filePath: normalized,
      chunks,
      totalLines: chunks.reduce((sum, c) => sum + (c.endLine - c.startLine + 1), 0),
    };
  }

  /**
   * Get quick summary of what's in the codebase
   */
  getSummary() {
    const stats = this.indexer.getStats();
    const languages = new Map();
    const topFiles = [];

    for (const chunk of this.indexer.chunks) {
      const lang = chunk.language || 'unknown';
      languages.set(lang, (languages.get(lang) || 0) + 1);

      if (chunk.symbols.length > 0) {
        const existing = topFiles.find(f => f.filePath === chunk.filePath);
        if (!existing) {
          topFiles.push({
            filePath: chunk.filePath,
            symbols: chunk.symbols,
          });
        } else {
          existing.symbols.push(...chunk.symbols);
        }
      }
    }

    const topSymbols = topFiles
      .sort((a, b) => b.symbols.length - a.symbols.length)
      .slice(0, 20)
      .map(f => ({
        filePath: f.filePath,
        symbols: f.symbols.map(s => `${s.type}:${s.name}`).slice(0, 5),
      }));

    return {
      ...stats,
      codeGraph: this.codeGraph
        ? {
          available: this.codeGraph.available,
          stats: this.codeGraph.safeStats?.() || null,
          error: this.codeGraph.lastError?.message || null,
        }
        : null,
      languages: [...languages.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10),
      topSymbols,
    };
  }

  async reindex() {
    return await this.indexer.indexAll();
  }

  async clear() {
    return await this.indexer.clear();
  }

  close() {
    this.codeGraph?.close?.();
  }

  // ── Private ────────────────────────────────────────

  _extractRelevantLine(content, lineNumber) {
    const lines = content.split(/\r?\n/);
    const idx = lineNumber - 1;
    if (idx >= 0 && idx < lines.length) {
      return lines[idx].trim();
    }
    return '';
  }
}

export default CodebaseSearch;
