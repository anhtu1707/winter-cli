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

test('anthropic config is accepted as claude-compatible provider config', async () => {
  const ai = new AIProviderManager({
    async load() {
      return {
        defaultProvider: 'anthropic',
        anthropic: {
          baseURL: 'http://anthropic.test/v1',
          apiKey: 'not-required',
          model: 'claude-sonnet-4-20250514',
        },
      };
    },
  });
  ai.loadAuthToken = async () => null;

  await ai.init();

  assert.equal(ai.getActiveProvider(), 'claude');
  assert.equal(ai.providers.claude.baseURL, 'http://anthropic.test/v1');
  assert.equal(ai.providers.claude.model, 'claude-sonnet-4-20250514');
});

test('selectExecutionProfile routes review-style tasks to Claude when available', async () => {
  const ai = new AIProviderManager({
    async load() {
      return {
        defaultProvider: 'custom',
        custom: {
          baseURL: 'http://custom.test/v1',
          apiKey: 'not-required',
          model: 'custom-model',
        },
        claude: {
          baseURL: 'http://claude.test/v1',
          apiKey: 'not-required',
          model: 'claude-sonnet-4-20250514',
        },
      };
    },
  });
  ai.loadAuthToken = async () => null;

  await ai.init();

  const profile = ai.selectExecutionProfile('Please review this refactor and fix the bug');

  assert.equal(profile.provider, 'claude');
  assert.equal(profile.model, 'claude-sonnet-4-20250514');
});

test('sendRequest falls back to default provider when routed provider has auth error', async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body || '{}');
    calls.push({ url, model: body.model });
    if (body.model === 'claude-model') {
      return {
        ok: false,
        status: 401,
        async text() {
          return JSON.stringify({ error: { message: 'Invalid API key', type: 'authentication_error' } });
        },
      };
    }
    return {
      ok: true,
      async json() {
        return { choices: [{ message: { content: 'fallback response' } }] };
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
          claude: {
            baseURL: 'http://claude.test/v1',
            apiKey: 'bad-key',
            model: 'claude-model',
          },
        };
      },
    });
    ai.loadAuthToken = async () => null;
    await ai.init();

    // Routing to Claude triggers keyword 'fix', but fallback should go to custom
    const result = await ai.sendRequest([{ role: 'user', content: 'fix this bug' }]);

    assert.equal(calls.length, 4); // 3 retries to Claude + 1 fallback to custom
    assert.equal(calls[0].model, 'claude-model');
    assert.equal(calls[3].model, 'custom-model');
    assert.equal(result.choices[0].message.content, 'fallback response');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('sendRequest does NOT fall back when default provider is the same as routed provider', async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body || '{}');
    calls.push({ url, model: body.model });
    return {
      ok: false,
      status: 401,
      async text() {
        return 'Unauthorized';
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
            apiKey: 'bad-key',
            model: 'custom-model',
          },
        };
      },
    });
    ai.loadAuthToken = async () => null;
    await ai.init();

    await assert.rejects(
      () => ai.sendRequest([{ role: 'user', content: 'hello world' }]),
      /401|Unauthorized/
    );

    assert.equal(calls.length, 3); // 3 retries, no fallback
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('streamRequest falls back to default provider when routed provider has auth error', async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  const encoder = new TextEncoder();

  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body || '{}');
    calls.push({ url, model: body.model });
    if (body.model === 'claude-model') {
      return {
        ok: false,
        status: 401,
        async text() {
          return 'Invalid API key';
        },
      };
    }
    return {
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Hello from fallback"}}]}\n\n'));
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
          claude: {
            baseURL: 'http://claude.test/v1',
            apiKey: 'bad-key',
            model: 'claude-model',
          },
        };
      },
    });
    ai.loadAuthToken = async () => null;
    await ai.init();

    const chunks = [];
    for await (const chunk of ai.streamRequest([{ role: 'user', content: 'debug this error' }])) {
      chunks.push(chunk);
    }

    assert.equal(calls.length, 2); // 1 try to Claude + 1 fallback to custom (stream has no retry)
    assert.equal(calls[0].model, 'claude-model'); // tried Claude first
    assert.equal(calls[1].model, 'custom-model'); // fell back to custom
    assert.equal(chunks.map(c => c.content).join(''), 'Hello from fallback');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
