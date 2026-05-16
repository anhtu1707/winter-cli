/**
 * Inline Completions - Provides AI-powered code completions for IDE integration.
 * Generates context-aware code suggestions based on cursor position.
 */

import { SimilaritySearch } from '../cache/similarity.js';

export class CompletionProvider {
  constructor(options = {}) {
    this.model = options.model || null;
    this.maxPrefixLines = options.maxPrefixLines || 30;
    this.maxSuffixLines = options.maxSuffixLines || 10;
    this.maxCompletions = options.maxCompletions || 3;
    this.minConfidence = options.minConfidence || 0.3;
    this.cache = new SimilaritySearch();
  }

  /**
   * Generate completions for a given cursor position.
   */
  async generate(context, options = {}) {
    const {
      filePath,
      content,
      cursorLine,
      cursorColumn,
      language,
    } = context;

    const prefix = this._getPrefix(content, cursorLine);
    const suffix = this._getSuffix(content, cursorLine);
    const currentLine = content.split('\n')[cursorLine] || '';
    const indent = currentLine.match(/^\s*/)[0];

    const completions = [];

    // Strategy 1: Line completion (if on a new line)
    if (currentLine.trim() === '' || currentLine.trim() === indent) {
      const lineCompletions = await this._suggestLineStart(prefix, language);
      completions.push(...lineCompletions);
    }

    // Strategy 2: Current line completion
    const currentPrefix = currentLine.substring(0, cursorColumn);
    const lineContinues = await this._completeCurrentLine(currentPrefix, prefix, language);
    if (lineContinues) {
      completions.push(...lineContinues);
    }

    // Strategy 3: Function/block completion
    const blockCompletions = await this._completeBlock(prefix, suffix, language);
    if (blockCompletions) {
      completions.push(...blockCompletions);
    }

    // Strategy 4: Similar code from cache
    const cachedCompletions = await this._completionsFromCache(prefix, language);
    if (cachedCompletions) {
      completions.push(...cachedCompletions);
    }

    // Rank by confidence
    const ranked = completions
      .filter(c => c.confidence >= this.minConfidence)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, this.maxCompletions);

    return {
      completions: ranked.map(c => ({
        text: c.text,
        line: cursorLine,
        column: cursorColumn,
        confidence: c.confidence,
        type: c.type,
      })),
      context: {
        filePath,
        language,
        line: cursorLine,
      },
    };
  }

  /**
   * Cache a completion for future reuse.
   * Uses await to ensure cache persistence before returning.
   */
  async learn(prefix, completion) {
    await this.cache.add(prefix, completion.text, {
      type: completion.type,
      language: completion.language,
    });
  }

  // --- Completion strategies ---

  async _suggestLineStart(prefix, language) {
    const suggestions = [];
    const lastLine = prefix.split('\n').filter(Boolean).pop() || '';

    // Suggest import statements
    if (this._isTimeForImport(prefix, language)) {
      suggestions.push({
        text: `import {  } from '...';`,
        confidence: 0.6,
        type: 'import',
      });
    }

    // Suggest function/class
    if (prefix.trim().endsWith('\n\n') || prefix.trim().endsWith('}')) {
      suggestions.push({
        text: `function () {\n  \n}`,
        confidence: 0.4,
        type: 'function',
      });
    }

    // Suggest return/export based on context
    if (lastLine.includes('=>') || lastLine.includes('function')) {
      suggestions.push({
        text: 'return ',
        confidence: 0.5,
        type: 'keyword',
      });
    }

    if (prefix.trim().endsWith('}')) {
      suggestions.push({
        text: 'export default ',
        confidence: 0.35,
        type: 'export',
      });
    }

    return suggestions;
  }

  async _completeCurrentLine(currentPrefix, fullPrefix, language) {
    const suggestions = [];

    // Complete common patterns
    if (currentPrefix.endsWith('.')) {
      suggestions.push({
        text: 'map(() => )',
        confidence: 0.5,
        type: 'method',
      });
      suggestions.push({
        text: 'filter(() => )',
        confidence: 0.45,
        type: 'method',
      });
      suggestions.push({
        text: 'then(() => )',
        confidence: 0.4,
        type: 'method',
      });
    }

    if (currentPrefix.trimEnd().endsWith('=>')) {
      suggestions.push({
        text: ' {',
        confidence: 0.5,
        type: 'arrow-function',
      });
    }

    if (currentPrefix.endsWith('const ')) {
      suggestions.push({
        text: 'result = ',
        confidence: 0.4,
        type: 'variable',
      });
    }

    if (currentPrefix.endsWith('import ')) {
      suggestions.push({
        text: '{  } from ',
        confidence: 0.6,
        type: 'import',
      });
    }

    if (currentPrefix.endsWith('from ')) {
      suggestions.push({
        text: "'module'",
        confidence: 0.3,
        type: 'import-path',
      });
    }

    return suggestions;
  }

  async _completeBlock(prefix, suffix, language) {
    const lines = prefix.split('\n');
    const openBraces = lines.filter(l => l.includes('{')).length;
    const closeBraces = lines.filter(l => l.includes('}')).length;

    if (openBraces > closeBraces) {
      const indent = '  '.repeat(openBraces - closeBraces - 1);
      return [{
        text: `\n${indent}}`,
        confidence: 0.7,
        type: 'block-close',
      }];
    }

    return [];
  }

  async _completionsFromCache(prefix, language) {
    const similar = this.cache.search(prefix, { limit: 2, threshold: 0.5 });
    return similar.map(s => ({
      text: s.text,
      confidence: s.score * 0.8,
      type: 'cached',
      source: s.id,
    }));
  }

  // --- Helpers ---

  _getPrefix(content, cursorLine) {
    const lines = content.split('\n');
    const start = Math.max(0, cursorLine - this.maxPrefixLines);
    return lines.slice(start, cursorLine).join('\n');
  }

  _getSuffix(content, cursorLine) {
    const lines = content.split('\n');
    const end = Math.min(lines.length, cursorLine + this.maxSuffixLines);
    return lines.slice(cursorLine, end).join('\n');
  }

  _isTimeForImport(prefix, language) {
    if (['js', 'ts', 'jsx', 'tsx'].includes(language)) {
      const lastFewLines = prefix.split('\n').slice(-5).join('\n');
      return !lastFewLines.includes('import ') && !lastFewLines.includes('require(');
    }
    return false;
  }
}

export default CompletionProvider;
