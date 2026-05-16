import test from 'node:test';
import assert from 'node:assert/strict';

import { selectExecutionProfile } from './router.js';

const providers = {
  claude: { model: 'claude-sonnet' },
  openai: { model: 'gpt-5-mini' },
  ollama: { model: 'llama3.1' },
  groq: { model: 'llama-fast' },
};

test('router sends coding work to Claude when available', () => {
  const profile = selectExecutionProfile({
    messages: [{ role: 'user', content: 'please fix this bug and run tests' }],
    activeProvider: 'openai',
    providers,
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
