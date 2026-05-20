import test from 'node:test';
import assert from 'node:assert/strict';

import { selectExecutionProfile } from './router.js';
import { REASONING_LEVELS } from '../ai/reasoning.js';

const providers = {
  claude: { model: 'claude-sonnet' },
  openai: { model: 'gpt-5-mini' },
  ollama: { model: 'llama3.1' },
  groq: { model: 'llama-fast' },
};

test('router keeps active provider for coding work when user selected one', () => {
  const profile = selectExecutionProfile({
    messages: [{ role: 'user', content: 'please fix this bug and run tests' }],
    activeProvider: 'openai',
    providers,
  });

  assert.equal(profile.provider, 'openai');
});

test('router only auto-routes when explicitly enabled and no active provider is valid', () => {
  const profile = selectExecutionProfile({
    messages: [{ role: 'user', content: 'please fix this bug and run tests' }],
    activeProvider: 'missing',
    providers,
    options: { autoRouteProvider: true },
  });

  assert.equal(profile.provider, 'claude');
});

test('router respects explicit valid provider override', () => {
  const profile = selectExecutionProfile({
    messages: [{ role: 'user', content: 'quick summary' }],
    activeProvider: 'claude',
    providers,
    options: { provider: 'ollama', model: 'custom-local' },
  });

  assert.equal(profile.provider, 'ollama');
  assert.equal(profile.model, 'custom-local');
});

test('router defaults every selected model to max reasoning', () => {
  const profile = selectExecutionProfile({
    messages: [{ role: 'user', content: 'quick summary' }],
    activeProvider: 'ollama',
    providers,
  });

  assert.equal(profile.provider, 'ollama');
  assert.equal(profile.reasoningLevel, REASONING_LEVELS.MAX);
});
