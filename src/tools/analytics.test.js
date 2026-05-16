import test from 'node:test';
import assert from 'node:assert/strict';

import { ToolUsageAnalytics } from './analytics.js';

test('ToolUsageAnalytics aggregates calls by tool', () => {
  const analytics = new ToolUsageAnalytics();
  analytics.track({ tool: 'Read', durationMs: 10, success: true });
  analytics.track({ tool: 'Read', durationMs: 30, success: false, error: 'missing' });
  analytics.track({ tool: 'Bash', durationMs: 20, success: true });

  const summary = analytics.summary();
  const read = summary.find(item => item.tool === 'Read');

  assert.equal(read.calls, 2);
  assert.equal(read.failures, 1);
  assert.equal(read.avgMs, 20);
});

