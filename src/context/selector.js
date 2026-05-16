/**
 * Context Selector - Selects the optimal subset of context for each request.
 * Maximizes relevant information within the context window limit.
 */

import { PriorityScorer, PRIORITY_LEVELS } from './priority.js';
import { ContextSummarizer } from './summarizer.js';

export class ContextSelector {
  constructor(options = {}) {
    this.scorer = new PriorityScorer();
    this.summarizer = new ContextSummarizer();
    this.maxTokens = options.maxTokens || 128000;
    this.reservedTokens = options.reservedTokens || 4000; // Reserve for response
  }

  /**
   * Select optimal context for a given request.
   */
  select(contexts, query, options = {}) {
    const budget = (options.maxTokens || this.maxTokens) - this.reservedTokens;

    // 1. Score all contexts
    const ranked = this.scorer.rank(contexts);

    // 2. Categorize
    const { keep, summarize, drop } = this.scorer.categorize(ranked.map(r => r.item));

    // 3. Calculate token usage
    const keepTokens = this._estimateTokens(keep);
    const remaining = budget - keepTokens;

    if (remaining <= 0) {
      // Keep only critical items
      return {
        contexts: keep.slice(0, this._fitToBudget(keep, budget)),
        summary: null,
        dropped: contexts.length - keep.slice(0, this._fitToBudget(keep, budget)).length,
        strategy: 'critical-only',
      };
    }

    // 4. Summarize medium-priority items
    const summary = this.summarizer.summarize(summarize, {
      maxItems: options.maxSummaryItems || 10,
    });

    const summaryTokens = this._estimateTokens([{ content: summary }]);

    if (keepTokens + summaryTokens <= budget) {
      return {
        contexts: [...keep, { role: 'system', content: `[Summary of previous context]\n${summary}` }],
        summary,
        dropped: drop.length,
        strategy: 'keep-critical-summarize-medium',
      };
    }

    // 5. Budget exceeded - trim further
    const trimmedKeep = this._fitToBudget(keep, budget - summaryTokens);
    return {
      contexts: [...trimmedKeep, { role: 'system', content: `[Summary of previous context]\n${summary}` }],
      summary,
      dropped: drop.length + (keep.length - trimmedKeep.length),
      strategy: 'trimmed-keep-summarize',
    };
  }

  /**
   * Smart context window management - decide if compression is needed.
   */
  needsCompression(contexts) {
    const totalTokens = this._estimateTokens(contexts);
    const threshold = this.maxTokens * 0.7; // Compress at 70% capacity
    return {
      needsCompression: totalTokens > threshold,
      currentTokens: totalTokens,
      maxTokens: this.maxTokens,
      usagePercent: ((totalTokens / this.maxTokens) * 100).toFixed(1),
    };
  }

  /**
   * Get priority-ordered context items for a request.
   */
  prioritizeForRequest(contexts, query) {
    const queryWords = new Set(query.toLowerCase().split(/\s+/));
    const results = [];

    for (const ctx of contexts) {
      const content = String(ctx.content || '');
      const baseScore = this.scorer.score(ctx);

      // Boost score for items relevant to the query
      let relevanceBoost = 0;
      for (const word of queryWords) {
        if (word.length > 2 && content.toLowerCase().includes(word)) {
          relevanceBoost += 5;
        }
      }

      results.push({
        item: ctx,
        score: Math.min(baseScore + relevanceBoost, 100),
        relevance: relevanceBoost > 0 ? 'high' : 'normal',
      });
    }

    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * Estimate how many contexts will fit in a token budget.
   */
  _fitToBudget(items, budget) {
    const result = [];
    let used = 0;
    for (const item of items) {
      const tokens = this._estimateTokens([item]);
      if (used + tokens <= budget) {
        result.push(item);
        used += tokens;
      } else {
        break;
      }
    }
    return result;
  }

  /**
   * Rough token estimation (4 chars per token).
   */
  _estimateTokens(items) {
    let total = 0;
    for (const item of items) {
      const content = String(item.content || '');
      total += Math.ceil(content.length / 4);
      // Add overhead for role and metadata
      total += 4;
    }
    return total;
  }
}

export default ContextSelector;
