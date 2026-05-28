import test from 'node:test';
import assert from 'node:assert/strict';

import { buildHermesCoreContract, detectHermesCoreSignals, shouldApplyHermesCore } from './hermes-core.js';

test('Hermes core detects agent, skill, memory, automation, TUI, and MCP signals', () => {
  const signals = detectHermesCoreSignals({
    taskText: 'Improve Winter TUI gateway with subagent memory, skill learning loop, cron automation, and MCP tool gateway',
    projectSignals: ['agent', 'webhook'],
  });

  assert.equal(signals.agent, true);
  assert.equal(signals.skills, true);
  assert.equal(signals.memory, true);
  assert.equal(signals.automation, true);
  assert.equal(signals.tui, true);
  assert.equal(signals.mcp, true);
  assert.equal(shouldApplyHermesCore({ taskText: 'build an agent skill system' }), true);
});

test('Hermes core contract exposes self-improvement and tool gateway rules', () => {
  const full = buildHermesCoreContract();
  const compact = buildHermesCoreContract({ compact: true });

  assert.match(full, /Hermes Core Agent Contract/);
  assert.match(full, /self-improving skills/);
  assert.match(full, /Session search and compression/);
  assert.match(full, /TUI gateway separation/);
  assert.match(full, /Tool gateway discipline/);
  assert.match(compact, /Skill lifecycle/);
  assert.doesNotMatch(compact, /TUI gateway separation/);
});
