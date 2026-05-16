/**
 * Priority Scoring - Score and rank context items by importance.
 * Determines what to keep, summarize, or drop during context management.
 */

export const PRIORITY_LEVELS = {
  CRITICAL: 100,
  HIGH: 75,
  MEDIUM: 50,
  LOW: 25,
  TRIVIAL: 10,
};

export class PriorityScorer {
  constructor() {
    this.rules = [
      // User's direct requests are highest priority
      { test: (item) => item.role === 'user' && item.content?.length > 20, score: PRIORITY_LEVELS.CRITICAL },
      // System instructions
      { test: (item) => item.role === 'system', score: PRIORITY_LEVELS.HIGH },
      // Tool results with errors
      { test: (item) => item.role === 'tool' && item.error, score: PRIORITY_LEVELS.HIGH },
      // File contents (long messages)
      { test: (item) => item.content?.length > 1000, score: PRIORITY_LEVELS.MEDIUM },
      // Normal responses
      { test: (item) => item.role === 'assistant' && item.content?.length > 10, score: PRIORITY_LEVELS.MEDIUM },
      // Acknowledgments
      { test: (item) => item.content?.length < 10, score: PRIORITY_LEVELS.LOW },
      // Default
      { test: () => true, score: PRIORITY_LEVELS.LOW },
    ];
  }

  /**
   * Score a single context item.
   */
  score(item) {
    for (const rule of this.rules) {
      if (rule.test(item)) return rule.score;
    }
    return PRIORITY_LEVELS.LOW;
  }

  /**
   * Score and rank all items, returning sorted array with scores.
   */
  rank(items) {
    return items
      .map(item => ({
        item,
        score: this.score(item),
        length: String(item.content || '').length,
        timestamp: item.timestamp || 0,
      }))
      .sort((a, b) => b.score - a.score || b.timestamp - a.timestamp);
  }

  /**
   * Determine which items to keep based on token budget.
   */
  select(items, tokenBudget = 4000) {
    const ranked = this.rank(items);
    const selected = [];
    let usedTokens = 0;

    for (const entry of ranked) {
      const tokens = Math.ceil(entry.length / 4); // rough token estimate
      if (usedTokens + tokens <= tokenBudget || entry.score >= PRIORITY_LEVELS.HIGH) {
        selected.push(entry.item);
        usedTokens += tokens;
      }
    }

    return {
      selected,
      totalItems: items.length,
      keptItems: selected.length,
      usedTokens,
      budget: tokenBudget,
      dropped: items.length - selected.length,
    };
  }

  /**
   * Categorize items into what to keep verbatim vs what to summarize.
   */
  categorize(items) {
    const keep = [];
    const summarize = [];
    const drop = [];

    for (const item of items) {
      const s = this.score(item);
      if (s >= PRIORITY_LEVELS.HIGH) {
        keep.push(item);
      } else if (s >= PRIORITY_LEVELS.LOW) {
        summarize.push(item);
      } else {
        drop.push(item);
      }
    }

    return { keep, summarize, drop };
  }

  /**
   * Add custom scoring rules.
   */
  addRule(test, score) {
    this.rules.unshift({ test, score });
    return this;
  }
}

export default PriorityScorer;
