import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyModelTier, getModelBudgetMultiplier, isSmallModel, MODEL_TIERS } from './model-capabilities.js';

test('classifyModelTier detects small/local models instead of pretending all are flagship', () => {
  assert.equal(classifyModelTier('ollama/minimax-m2.5', 'custom'), MODEL_TIERS.FLAGSHIP);
  assert.equal(classifyModelTier('local-mini', 'custom'), MODEL_TIERS.SMALL);
  assert.equal(classifyModelTier('tiny-code-model', 'custom'), MODEL_TIERS.TINY);
  assert.equal(classifyModelTier('llama3.2:3b', 'ollama'), MODEL_TIERS.SMALL);
  assert.equal(classifyModelTier('qwen2.5-72b', 'custom'), MODEL_TIERS.LARGE);
  assert.equal(isSmallModel(MODEL_TIERS.SMALL), true);
  assert.equal(isSmallModel(MODEL_TIERS.FLAGSHIP), false);
});

test('small model tiers use tighter context budgets than flagship models', () => {
  assert(getModelBudgetMultiplier(MODEL_TIERS.SMALL) < getModelBudgetMultiplier(MODEL_TIERS.FLAGSHIP));
});
