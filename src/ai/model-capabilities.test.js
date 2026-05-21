import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyModelTier, isSmallModel, MODEL_TIERS } from './model-capabilities.js';

test('all model names are classified as flagship', () => {
  assert.equal(classifyModelTier('ollama/minimax-m2.5', 'custom'), MODEL_TIERS.FLAGSHIP);
  assert.equal(classifyModelTier('local-mini', 'custom'), MODEL_TIERS.FLAGSHIP);
  assert.equal(classifyModelTier('tiny-code-model', 'custom'), MODEL_TIERS.FLAGSHIP);
  assert.equal(isSmallModel(MODEL_TIERS.FLAGSHIP), false);
});
