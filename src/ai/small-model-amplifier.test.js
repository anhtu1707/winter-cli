import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSmallModelAmplification, isWeakTier } from './small-model-amplifier.js';

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
  assert.match(cfg.hint, /Every model/);
});
