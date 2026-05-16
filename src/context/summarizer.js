/**
 * Summarizer - Smart conversation and context summarization.
 * Generates concise summaries while preserving critical information.
 */

export class ContextSummarizer {
  constructor(options = {}) {
    this.maxLineLength = options.maxLineLength || 520;
    this.maxSummaryItems = options.maxSummaryItems || 20;
  }

  /**
   * Build a summary of conversation history.
   */
  summarize(entries, options = {}) {
    const maxItems = options.maxItems || this.maxSummaryItems;
    const entries_ = Array.isArray(entries) ? entries : [entries];

    if (entries_.length === 0) return '';

    const summary = ['## Conversation Summary'];
    let count = 0;

    for (const entry of entries_) {
      if (count >= maxItems) break;
      const content = this._getContent(entry);
      if (!content) continue;

      const role = entry.role || 'unknown';
      const prefix = this._rolePrefix(role);
      const compacted = this._compact(content);

      if (compacted) {
        summary.push(`${prefix}: ${compacted}`);
        count++;
      }
    }

    return summary.join('\n');
  }

  /**
   * Summarize a single long text entry.
   */
  summarizeText(text, maxLength = 200) {
    const str = String(text || '');
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - 3) + '...';
  }

  /**
   * Create a structured summary with key points.
   */
  summarizeWithKeyPoints(entries) {
    const lines = [];
    let fileChanges = [];
    let decisions = [];
    let questions = [];

    for (const entry of Array.isArray(entries) ? entries : [entries]) {
      const content = String(entry.content || '');
      const role = entry.role || '';

      if (role === 'user') {
        if (content.includes('?')) questions.push(content);
      } else if (role === 'assistant') {
        // Extract file changes from tool calls
        if (Array.isArray(entry.tool_calls)) {
          for (const tc of entry.tool_calls) {
            if (tc.function?.name === 'Edit' || tc.function?.name === 'Write') {
              try {
                const args = JSON.parse(tc.function.arguments || '{}');
                if (args.path) fileChanges.push(args.path);
              } catch {}
            }
          }
        }
      } else if (role === 'tool') {
        if (content.includes('error') || content.includes('fail')) {
          decisions.push(`Error: ${this._compact(content.substring(0, 100))}`);
        }
      }
    }

    if (fileChanges.length > 0) {
      lines.push(`Files modified: ${[...new Set(fileChanges)].join(', ')}`);
    }
    if (decisions.length > 0) {
      lines.push(`Issues: ${decisions.join('; ')}`);
    }
    if (questions.length > 0) {
      questions = questions.filter(q => q.length < 200).slice(0, 3);
      lines.push(`Open questions: ${questions.join(' | ')}`);
    }

    return lines.join('\n');
  }

  /**
   * Merge multiple summaries into one.
   */
  merge(summaries) {
    const merged = summaries.filter(Boolean).join('\n---\n');
    return this.summarizeText(merged, 2000);
  }

  /**
   * Compress a result into a minimal representation.
   */
  compressResult(result, label) {
    const str = String(result || '');
    if (str.length <= this.maxLineLength) return `${label}: ${str}`;

    // Extract key info
    const lines = str.split('\n').filter(l => l.trim()).slice(0, 5);
    const compact = lines.join('; ').substring(0, this.maxLineLength);
    return `${label}: ${compact}... (+${str.length - compact.length} chars)`;
  }

  // --- Private helpers ---

  _getContent(entry) {
    if (typeof entry === 'string') return entry;
    if (entry.content) return entry.content;
    if (entry.text) return entry.text;
    return '';
  }

  _rolePrefix(role) {
    const prefixes = {
      system: 'System',
      user: 'User',
      assistant: 'Assistant',
      tool: 'Tool',
    };
    return prefixes[role] || role;
  }

  _compact(text, maxLen) {
    const str = String(text || '').replace(/\s+/g, ' ').trim();
    if (str.length <= maxLen) return str;
    return str.substring(0, maxLen - 3) + '...';
  }
}

export default ContextSummarizer;
