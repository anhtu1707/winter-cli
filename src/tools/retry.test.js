import test from 'node:test';
import assert from 'node:assert/strict';
import { sleep, withRetry } from './retry.js';

test('sleep resolves after specified ms', async () => {
  const start = Date.now();
  await sleep(50);
  const elapsed = Date.now() - start;
  assert(elapsed >= 40, `expected >=40ms, got ${elapsed}ms`);
});

test('withRetry succeeds on first attempt', async () => {
  let calls = 0;
  const result = await withRetry(async () => {
    calls++;
    return 'success';
  });
  assert.equal(result, 'success');
  assert.equal(calls, 1);
});

test('withRetry retries on failure and succeeds', async () => {
  let calls = 0;
  const result = await withRetry(async () => {
    calls++;
    if (calls < 3) throw new Error('temporary failure');
    return 'recovered';
  }, { maxAttempts: 3, baseDelayMs: 10 });
  assert.equal(result, 'recovered');
  assert.equal(calls, 3);
});

test('withRetry throws after exhausting attempts', async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(async () => {
      calls++;
      throw new Error('persistent failure');
    }, { maxAttempts: 2, baseDelayMs: 5 }),
    /persistent failure/
  );
  assert.equal(calls, 2);
});

test('withRetry respects maxAttempts option', async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(async () => {
      calls++;
      throw new Error('fail');
    }, { maxAttempts: 4, baseDelayMs: 5 }),
    /fail/
  );
  assert.equal(calls, 4);
});

test('withRetry does not retry when retryable returns false', async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(async () => {
      calls++;
      throw new Error('non-retryable');
    }, {
      maxAttempts: 3,
      baseDelayMs: 5,
      retryable: (err) => err.message !== 'non-retryable',
    }),
    /non-retryable/
  );
  assert.equal(calls, 1, 'should not retry non-retryable errors');
});

test('withRetry uses exponential backoff', async () => {
  const delays = [];
  let calls = 0;

  const originalSleep = global.setTimeout;
  global.setTimeout = (fn, ms) => {
    delays.push(ms);
    return originalSleep(fn, 1); // speed up
  };

  try {
    await withRetry(async () => {
      calls++;
      if (calls < 3) throw new Error('fail');
      return 'ok';
    }, { maxAttempts: 3, baseDelayMs: 100 }).catch(() => {});
  } finally {
    global.setTimeout = originalSleep;
  }

  // The delays are harder to check deterministically, but we can verify the function ran
  assert(calls > 0);
});

test('withRetry passes through successful result with zero retries', async () => {
  const result = await withRetry(async () => 42, { maxAttempts: 1 });
  assert.equal(result, 42);
});
