/**
 * Tool Optimizer - Analyzes tool usage patterns and suggests improvements.
 * Uses analytics data to optimize tool selection, timing, and strategies.
 */

export class ToolOptimizer {
  constructor(analytics) {
    this.analytics = analytics;
    this.optimizations = new Map();
    this.thresholds = {
      highFailureRate: 0.3,       // >30% failure = problematic
      slowExecutionMs: 5000,       // >5s = slow
      lowUsageCount: 3,            // <3 uses = insufficient data
    };
  }

  /**
   * Analyze tool usage and generate optimization suggestions.
   */
  analyze() {
    const summary = typeof this.analytics.summary === 'function'
      ? this.analytics.summary()
      : this.analytics;

    if (!Array.isArray(summary)) return { suggestions: [] };

    const suggestions = [];

    for (const tool of summary) {
      const name = tool.name || tool.tool;
      const calls = tool.calls || 0;
      const failures = tool.failures || 0;
      const avgMs = tool.avgMs || tool.totalMs / calls || 0;

      if (calls < this.thresholds.lowUsageCount) continue;

      // Check for high failure rate
      const failureRate = calls > 0 ? failures / calls : 0;
      if (failureRate > this.thresholds.highFailureRate) {
        suggestions.push({
          tool: name,
          type: 'high-failure',
          severity: 'warning',
          message: `${name} has ${(failureRate * 100).toFixed(0)}% failure rate (${failures}/${calls})`,
          suggestion: 'Consider using fallback strategies or simplifying inputs',
          metrics: { calls, failures, failureRate },
        });
      }

      // Check for slow execution
      if (avgMs > this.thresholds.slowExecutionMs) {
        suggestions.push({
          tool: name,
          type: 'slow-execution',
          severity: 'info',
          message: `${name} averages ${(avgMs / 1000).toFixed(1)}s per call`,
          suggestion: 'Reduce input size or use faster alternatives',
          metrics: { calls, avgMs },
        });
      }
    }

    // Cross-tool optimization suggestions
    if (summary.length >= 2) {
      const mostCalled = [...summary].sort((a, b) => (b.calls || 0) - (a.calls || 0));
      if (mostCalled.length > 0 && mostCalled[0].calls > 10) {
        suggestions.push({
          tool: mostCalled[0].name || mostCalled[0].tool,
          type: 'high-usage',
          severity: 'info',
          message: `Most used: ${mostCalled[0].name || mostCalled[0].tool} (${mostCalled[0].calls} calls)`,
          suggestion: 'Consider caching results for repeated calls',
          metrics: { calls: mostCalled[0].calls },
        });
      }
    }

    return { suggestions, totalTools: summary.length, generatedAt: Date.now() };
  }

  /**
   * Get optimization hint for a specific tool.
   */
  getHint(toolName) {
    const analysis = this.analyze();
    return analysis.suggestions.filter(s => s.tool === toolName);
  }

  /**
   * Apply automatic optimization - adjust tool configuration based on patterns.
   */
  autoOptimize(executor) {
    const analysis = this.analyze();
    const adjustments = [];

    for (const suggestion of analysis.suggestions) {
      if (suggestion.type === 'high-failure' && suggestion.severity === 'warning') {
        adjustments.push({
          tool: suggestion.tool,
          action: 'add-fallback',
          reason: suggestion.message,
        });
      }
      if (suggestion.type === 'slow-execution') {
        adjustments.push({
          tool: suggestion.tool,
          action: 'reduce-timeout',
          reason: suggestion.message,
        });
      }
    }

    return adjustments;
  }

  /**
   * Track a successful optimization.
   */
  trackOptimization(optimization, result) {
    const key = `${optimization.tool}:${optimization.action}`;
    if (!this.optimizations.has(key)) {
      this.optimizations.set(key, { count: 0, results: [] });
    }
    const entry = this.optimizations.get(key);
    entry.count++;
    entry.results.push({ result, timestamp: Date.now() });
  }

  /**
   * Get optimization history.
   */
  getHistory() {
    const history = [];
    for (const [key, entry] of this.optimizations) {
      history.push({ key, count: entry.count, lastResult: entry.results[entry.results.length - 1] });
    }
    return history;
  }
}

export default ToolOptimizer;
