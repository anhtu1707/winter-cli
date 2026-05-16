export class ToolUsageAnalytics {
  constructor(limit = 1000) {
    this.limit = Math.max(50, Number(limit || 1000));
    this.events = [];
  }

  track(event = {}) {
    const item = {
      tool: event.tool || 'unknown',
      durationMs: Math.max(0, Number(event.durationMs || 0)),
      success: event.success !== false,
      error: event.error || null,
      ts: event.ts || new Date().toISOString(),
    };
    this.events.push(item);
    if (this.events.length > this.limit) {
      this.events.splice(0, this.events.length - this.limit);
    }
    return item;
  }

  summary() {
    const byTool = new Map();
    for (const event of this.events) {
      const current = byTool.get(event.tool) || {
        tool: event.tool,
        calls: 0,
        failures: 0,
        totalMs: 0,
        lastUsedAt: event.ts,
      };
      current.calls += 1;
      current.failures += event.success ? 0 : 1;
      current.totalMs += event.durationMs;
      current.lastUsedAt = event.ts;
      byTool.set(event.tool, current);
    }

    return [...byTool.values()]
      .map(item => ({
        ...item,
        avgMs: item.calls ? Math.round(item.totalMs / item.calls) : 0,
        successRate: item.calls ? Math.round(((item.calls - item.failures) / item.calls) * 100) : 100,
      }))
      .sort((a, b) => b.calls - a.calls || a.tool.localeCompare(b.tool));
  }

  /**
   * Generate actionable insights based on usage patterns.
   * - Slowing tools: avg duration trending up
   * - Error-prone tools: high failure rate
   * - Underutilized tools: called rarely but could replace failing ones
   * - Performance benchmarks: fast vs slow tools
   */
  insights() {
    const tools = this.summary();
    const totalCalls = tools.reduce((s, t) => s + t.calls, 0);
    const globalFailRate = totalCalls
      ? Math.round((tools.reduce((s, t) => s + t.failures, 0) / totalCalls) * 100)
      : 0;

    // Find error-prone tools (failure rate > 20%)
    const errorProne = tools
      .filter(t => t.calls >= 3 && t.failures / t.calls > 0.2)
      .map(t => ({ tool: t.tool, failureRate: Math.round((t.failures / t.calls) * 100), calls: t.calls }));

    // Find slow tools (avgMs > 5000ms)
    const slowTools = tools
      .filter(t => t.avgMs > 5000 && t.calls >= 2)
      .map(t => ({ tool: t.tool, avgMs: t.avgMs, calls: t.calls }));

    // Detect trends from recent events vs overall average
    const recentWindow = Math.min(50, Math.floor(this.events.length * 0.3));
    const recent = this.events.slice(-recentWindow);
    const recentByTool = new Map();
    for (const event of recent) {
      const cur = recentByTool.get(event.tool) || { calls: 0, totalMs: 0, failures: 0 };
      cur.calls += 1;
      cur.totalMs += event.durationMs;
      cur.failures += event.success ? 0 : 1;
      recentByTool.set(event.tool, cur);
    }

    const slowingTools = [];
    for (const tool of tools) {
      const recentData = recentByTool.get(tool.tool);
      if (recentData && recentData.calls >= 2) {
        const recentAvg = recentData.totalMs / recentData.calls;
        if (recentAvg > tool.avgMs * 1.3) {
          slowingTools.push({ tool: tool.tool, recentAvgMs: Math.round(recentAvg), overallAvgMs: tool.avgMs });
        }
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      totalCalls,
      globalFailRate,
      topTool: tools[0] || null,
      errorProneTools: errorProne,
      slowTools,
      slowingTrends: slowingTools,
      totalUniqueTools: tools.length,
      failureRateTrend: this._failureRateTrend(),
    };
  }

  /**
   * Compare failure rate of recent events vs older events.
   * Returns: 'improving', 'worsening', or 'stable'.
   */
  _failureRateTrend() {
    if (this.events.length < 20) return 'insufficient-data';
    const mid = Math.floor(this.events.length / 2);
    const older = this.events.slice(0, mid);
    const newer = this.events.slice(mid);

    const olderFailures = older.filter(e => !e.success).length;
    const newerFailures = newer.filter(e => !e.success).length;
    const olderRate = older.length ? olderFailures / older.length : 0;
    const newerRate = newer.length ? newerFailures / newer.length : 0;

    if (newerRate < olderRate * 0.8) return 'improving';
    if (newerRate > olderRate * 1.2) return 'worsening';
    return 'stable';
  }

  /**
   * Get raw events for external processing.
   */
  getEvents() {
    return [...this.events];
  }

  /**
   * Clear all tracked events.
   */
  reset() {
    this.events = [];
  }
}

export const globalToolUsageAnalytics = new ToolUsageAnalytics();

export function trackToolUse(toolName, durationMs, success, error = null) {
  return globalToolUsageAnalytics.track({
    tool: toolName,
    durationMs,
    success,
    error,
  });
}

export function getToolUsageSummary() {
  return globalToolUsageAnalytics.summary();
}

export function getToolUsageInsights() {
  return globalToolUsageAnalytics.insights();
}
