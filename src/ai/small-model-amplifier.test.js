import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSmallModelAmplification, isWeakTier } from './small-model-amplifier.js';

test('small model amplifier escalates constraints for weak tiers', () => {
  assert.equal(isWeakTier('small'), true);
  const cfg = buildSmallModelAmplification({
    modelTier: 'small',
    workflowProfile: 'backend-debug',
    depth: 'deep',
  });

  assert.equal(cfg.weak, true);
  assert.equal(cfg.enforceSelfCritique, true);
  assert(cfg.maxToolTurns >= 10);
  assert.match(cfg.hint, /Small Model Amplifier/);
});

test('small model amplifier is neutral for strong tiers', () => {
  const cfg = buildSmallModelAmplification({
    modelTier: 'large',
    workflowProfile: 'webapp-build',
    depth: 'standard',
  });

  assert.equal(cfg.weak, false);
  assert.equal(cfg.enforceSelfCritique, false);
  assert.equal(cfg.maxToolTurns, 8);
});

