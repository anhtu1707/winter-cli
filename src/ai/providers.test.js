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

test('sendRequestToProvider includes reasoning_effort for OpenAI provider', async () => {
  const originalFetch = globalThis.fetch;
  const bodies = [];

  globalThis.fetch = async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    return {
      ok: true,
      async json() {
        return { choices: [{ message: { content: 'reasoned response' } }] };
      },
    };
  };

  try {
    const ai = new AIProviderManager({
      async load() {
        return {
          defaultProvider: 'openai',
          openai: {
            baseURL: 'https://api.openai.com/v1',
            apiKey: 'sk-test',
            model: 'o3-mini',
          },
        };
      },
    });
    ai.loadAuthToken = async () => null;
    await ai.init();

    await ai.sendRequestToProvider(ai.providers.openai, [{ role: 'user', content: 'complex task' }], {
      reasoning: { reasoning_effort: 'high' },
    });

    assert.equal(bodies[0].reasoning_effort, 'high');
    assert.equal(bodies[0].model, 'o3-mini');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('sendRequestToProvider includes thinking budget for Claude provider', async () => {
  const originalFetch = globalThis.fetch;
  const bodies = [];

  globalThis.fetch = async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    return {
      ok: true,
      async json() {
        return { choices: [{ message: { content: 'thinking response' } }] };
      },
    };
  };

  try {
    const ai = new AIProviderManager({
      async load() {
        return {
          defaultProvider: 'claude',
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

    await ai.sendRequestToProvider(ai.providers.claude, [{ role: 'user', content: 'complex task' }], {
      reasoning: { thinking: { type: 'enabled', budget_tokens: 8192 } },
    });

    assert.equal(bodies[0].thinking.budget_tokens, 8192);
    assert.equal(bodies[0].thinking.type, 'enabled');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('streamRequestToProvider includes reasoning params in request body', async () => {
  const originalFetch = globalThis.fetch;
  const bodies = [];
  const encoder = new TextEncoder();

  globalThis.fetch = async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    return {
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"ok"}}]}\n\n'));
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
          defaultProvider: 'openai',
          openai: {
            baseURL: 'https://api.openai.com/v1',
            apiKey: 'sk-test',
            model: 'o1',
          },
        };
      },
    });
    ai.loadAuthToken = async () => null;
    await ai.init();

    const chunks = [];
    for await (const chunk of ai.streamRequestToProvider(ai.providers.openai, [{ role: 'user', content: 'hello' }], {
      reasoning: { reasoning_effort: 'medium' },
    })) {
      chunks.push(chunk);
    }

    assert.equal(bodies[0].reasoning_effort, 'medium');
    assert.equal(bodies[0].stream, true);
    assert(chunks.length > 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('selectExecutionProfile includes reasoning level for complex tasks', async () => {
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
  await ai.init();

  // Complex task with deep signals
  const profile = ai.selectExecutionProfile('Refactor the architecture and redesign the full stack migration for security optimization');

  assert.equal(profile.provider, 'custom');
  assert.ok(profile.reasoningLevel, 'should have reasoningLevel');
  assert.ok(profile.reasoningParam === null || typeof profile.reasoningParam === 'object');
  assert.equal(typeof profile.reasoningPrompt, 'string');
});

test('getSystemPrompt injects reasoning instructions when reasoningLevel is high and provider lacks API reasoning', async () => {
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
  await ai.init();

  // Explicitly set high reasoning level
  const prompt = ai.getSystemPrompt({
    task: 'Fix a bug',
    reasoningLevel: 'high',
  });

  assert.ok(prompt.length > 0);
  // High reasoning level should inject 'analyze' instructions
  assert.ok(prompt.includes('analyze') || prompt.includes('reason') || prompt.includes('thinking'),
    'High reasoning prompt should contain reasoning instructions for non-API-reasoning providers');
});

test('_getReasoningParam returns null when no reasoning config provided', async () => {
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
  await ai.init();

  const param = ai._getReasoningParam({}, { name: 'custom' });
  assert.equal(param, null);
});

test('_getReasoningParam builds param from reasoningLevel string', async () => {
  const ai = new AIProviderManager({
    async load() {
      return {
        defaultProvider: 'openai',
        openai: {
          baseURL: 'https://api.openai.com/v1',
          apiKey: 'sk-test',
          model: 'o3-mini',
        },
      };
    },
  });
  ai.loadAuthToken = async () => null;
  await ai.init();

  const param = ai._getReasoningParam({ reasoningLevel: 'high' }, ai.providers.openai);
  assert.deepEqual(param, { reasoning_effort: 'high' });
});

test('small model system prompt stays compact and uses real tool names', async () => {
  const ai = new AIProviderManager({
    async load() {
      return {
        defaultProvider: 'ollama',
        ollama: {
          baseURL: 'http://ollama.test/v1',
          model: 'llama3.2:3b',
        },
      };
    },
  });
  ai.loadAuthToken = async () => null;
  ai.setTools([{ name: 'Read' }, { name: 'Write' }, { name: 'Bash' }]);
  await ai.init();

  const prompt = ai.getSystemPrompt({ task: 'fix a bug' });

  assert(prompt.length < 2500);
  assert.match(prompt, /Read, Write, Bash/);
  assert(!prompt.includes('<thinking>'));
  assert(!prompt.includes('MANDATORY DEEP REASONING'));
});

test('model tier updates when switching provider', async () => {
  const ai = new AIProviderManager({
    async load() {
      return {
        defaultProvider: 'ollama',
        ollama: {
          baseURL: 'http://ollama.test/v1',
          model: 'llama3.2:3b',
        },
        custom: {
          baseURL: 'http://custom.test/v1',
          apiKey: 'not-required',
          model: 'qwen2.5-72b',
        },
      };
    },
  });
  ai.loadAuthToken = async () => null;
  await ai.init();
  const smallPrompt = ai.getSystemPrompt({ task: 'fix bug' });

  await ai.switchProvider('custom');
  const largePrompt = ai.getSystemPrompt({ task: 'fix bug' });

  assert(smallPrompt.includes('small local model'));
  assert(!largePrompt.includes('small local model'));
});
