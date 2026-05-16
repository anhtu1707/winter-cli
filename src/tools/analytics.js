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
      }))
      .sort((a, b) => b.calls - a.calls || a.tool.localeCompare(b.tool));
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

