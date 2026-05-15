import test from 'node:test';
import assert from 'node:assert/strict';

import { AIProviderManager } from './providers.js';

test('streamRequest parses OpenAI-compatible SSE chunks with usage', async () => {
  const originalFetch = globalThis.fetch;
  const encoder = new TextEncoder();
  const bodies = [];

  globalThis.fetch = async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    return {
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Hello "}}]}\n\n'));
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"world"}}],"usage":{"prompt_tokens":3,"completion_tokens":2,"total_tokens":5}}\n\n'));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        },
      }),
    };
  };

  try {
    const ai = new AIProviderManager({
      async load() {
        return {
          defaultProvider: 'custom',
          custom: {
            baseURL: 'http://custom.test/v1',
            apiKey: 'not-required',
            model: 'custom-model',
          },
        };
      },
    });
    ai.loadAuthToken = async () => null;

    const chunks = [];
    for await (const chunk of ai.streamRequest([{ role: 'user', content: 'hello' }])) {
      chunks.push(chunk);
    }

    assert.equal(bodies[0].stream, true);
    assert.deepEqual(bodies[0].stream_options, { include_usage: true });
    assert.equal(chunks.map(chunk => chunk.content).join(''), 'Hello world');
    assert.deepEqual(chunks.at(-1).usage, {
      prompt_tokens: 3,
      completion_tokens: 2,
      total_tokens: 5,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('callAllProviders calls every ready configured provider', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return {
      ok: true,
      async json() {
        return { choices: [{ message: { content: `ok:${url}` } }] };
      },
    };
  };

  try {
    const ai = new AIProviderManager({
      async load() {
        return {
          defaultProvider: 'custom',
          custom: {
            baseURL: 'http://custom.test/v1',
            apiKey: 'not-required',
            model: 'custom-model',
          },
          ollama: {
            baseURL: 'http://ollama.test/v1',
            model: 'llama3',
          },
        };
      },
    });
    ai.loadAuthToken = async () => null;

    const results = await ai.callAllProviders('hello');

    assert.equal(calls.length, 2);
    assert.equal(calls[0].body.model, 'custom-model');
    assert.equal(calls[1].body.model, 'llama3');
    assert.equal(results.custom.model, 'custom-model');
    assert.equal(results.ollama.model, 'llama3');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('switchProvider reloads config before rejecting a provider', async () => {
  let cfg = {
    defaultProvider: 'ollama',
    ollama: {
      baseURL: 'http://ollama.test/v1',
      model: 'llama3',
    },
  };

  const ai = new AIProviderManager({
    async load() {
      return cfg;
    },
  });
  ai.loadAuthToken = async () => null;

  await ai.init();
  assert.equal(ai.getActiveProvider(), 'ollama');

  cfg = {
    ...cfg,
    custom: {
      baseURL: 'http://custom.test/v1',
      apiKey: 'not-required',
      model: 'custom-model',
    },
  };

  const switched = await ai.switchProvider(' CUSTOM ');

  assert.equal(switched, 'custom');
  assert.equal(ai.getActiveProvider(), 'custom');
  assert.equal(ai.providers.custom.model, 'custom-model');
});
