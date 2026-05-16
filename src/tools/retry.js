export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function withRetry(task, options = {}) {
  const maxAttempts = Math.max(1, Number(options.maxAttempts ?? 3));
  const baseDelayMs = Math.max(0, Number(options.baseDelayMs ?? 100));
  const retryable = typeof options.retryable === 'function'
    ? options.retryable
    : () => true;

  let lastError = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await task(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts - 1 || !retryable(error)) {
        throw error;
      }
      const delay = baseDelayMs * (2 ** attempt);
      if (delay > 0) {
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error('Retry failed');
}