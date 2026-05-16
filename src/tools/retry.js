export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate delay with optional jitter to avoid thundering herd.
 */
function calculateDelay(baseDelayMs, attempt, strategy, enableJitter) {
  let delay;

  switch (strategy) {
    case 'linear':
      delay = baseDelayMs * (attempt + 1);
      break;
    case 'fibonacci': {
      let a = 0, b = 1;
      for (let i = 0; i < attempt; i++) {
        [a, b] = [b, a + b];
      }
      delay = baseDelayMs * Math.max(b, 1);
      break;
    }
    case 'exponential':
    default:
      delay = baseDelayMs * (2 ** attempt);
      break;
  }

  if (enableJitter && delay > 0) {
    // Add ±25% jitter
    const jitter = delay * 0.25 * (Math.random() * 2 - 1);
    delay = Math.round(delay + jitter);
  }

  return Math.max(0, delay);
}

/**
 * Default error classifier: returns true for retryable errors.
 * Retry on: network errors, rate limits (429), server errors (5xx).
 * Do NOT retry on: bad requests (400), auth errors (401/403), not found (404).
 */
function isRetryableError(error) {
  if (!error) return true;
  const status = error.status || error.statusCode || (error.response && error.response.status);
  if (status) {
    if (status === 429 || status === 503) return true;
    if (status >= 500 && status < 600) return true;
    if (status === 408) return true;
    if (status === 400 || status === 401 || status === 403 || status === 404) return false;
    return false;
  }
  const msg = (error.message || '').toLowerCase();
  if (msg.includes('econnrefused') || msg.includes('enetunreach') ||
      msg.includes('timeout') || msg.includes('econnreset') ||
      msg.includes('etimedout') || msg.includes('socket')) {
    return true;
  }
  return true;
}

export async function withRetry(task, options = {}) {
  const maxAttempts = Math.max(1, Number(options.maxAttempts ?? 3));
  const baseDelayMs = Math.max(0, Number(options.baseDelayMs ?? 100));
  const strategy = options.strategy || 'exponential';
  const enableJitter = options.jitter !== false;
  const retryable = typeof options.retryable === 'function'
    ? options.retryable
    : isRetryableError;

  let lastError = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await task(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts - 1 || !retryable(error)) {
        throw error;
      }
      const delay = calculateDelay(baseDelayMs, attempt, strategy, enableJitter);
      if (delay > 0) {
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error('Retry failed');
}
