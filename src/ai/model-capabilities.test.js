import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyModelTier, isSmallModel, MODEL_TIERS } from './model-capabilities.js';

test('minimax model names are not misclassified as tiny because they contain mini', () => {
  const tier = classifyModelTier('ollama/minimax-m2.5', 'custom');

  assert.equal(tier, MODEL_TIERS.FLAGSHIP);
  assert.equal(isSmallModel(tier), false);
});

test('real mini model names are still classified as tiny', () => {
  assert.equal(classifyModelTier('local-mini', 'custom'), MODEL_TIERS.TINY);
  assert.equal(classifyModelTier('tiny-code-model', 'custom'), MODEL_TIERS.TINY);
});
