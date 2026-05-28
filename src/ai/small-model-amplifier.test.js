import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCodingMasteryContract, buildSmallModelAmplification, isWeakTier } from './small-model-amplifier.js';

test('strength amplifier escalates constraints for weak tiers', () => {
  assert.equal(isWeakTier('small'), true);
  const cfg = buildSmallModelAmplification({
    modelTier: 'small',
    workflowProfile: 'backend-debug',
    depth: 'deep',
  });

  assert.equal(cfg.weak, true);
  assert.equal(cfg.enforceSelfCritique, true);
  assert(cfg.maxToolTurns >= 10);
  assert.match(cfg.hint, /Winter Strength Amplifier/);
  assert.match(cfg.hint, /Active model tier: small/);
  assert.match(cfg.hint, /exactly one tool call/);
  assert.match(cfg.hint, /tool output/);
  assert.match(cfg.hint, /Coding Mastery Contract/);
});

test('strength amplifier also applies to strong tiers', () => {
  const cfg = buildSmallModelAmplification({
    modelTier: 'large',
    workflowProfile: 'webapp-build',
    depth: 'standard',
  });

  assert.equal(isWeakTier('large'), true);
  assert.equal(cfg.weak, true);
  assert.equal(cfg.enforceSelfCritique, true);
  assert.equal(cfg.maxToolTurns, 14);
  assert.match(cfg.hint, /Active model tier: large/);
});

test('coding mastery contract enforces senior coding discipline', () => {
  const contract = buildCodingMasteryContract();

  assert.match(contract, /Coding Mastery Contract/);
  assert.match(contract, /entrypoint, caller, callee/);
  assert.match(contract, /invariants and side effects/);
  assert.match(contract, /review the diff/);
  assert.match(contract, /Verify with the closest command/);
  assert.match(contract, /verification before the final answer/);
  assert.match(contract, /concrete verification results/);
});
