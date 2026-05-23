export {
  buildJsonRepairCandidates,
  buildToolCallSignature,
  decodeXmlEntities,
  extractFirstJsonObject,
  extractInlineToolCalls,
  formatToolCallsForMessage,
  normalizeToolCalls,
  parseToolArguments,
} from './tool-call-adapter.js';

export function formatAnswerFooter(startedAt, usage = {}, now = Date.now()) {
  const elapsedMs = Math.max(0, now - startedAt);
  const seconds = (elapsedMs / 1000).toFixed(elapsedMs < 10000 ? 1 : 0);
  const tokenText = formatUsage(usage);
  return tokenText ? `Time: ${seconds}s · Tokens: ${tokenText}` : `Time: ${seconds}s · Tokens: n/a`;
}

export function addUsage(totalUsage, usage = {}) {
  if (!usage || typeof usage !== 'object') return totalUsage;

  const prompt = usage.prompt_tokens ?? usage.input_tokens;
  const completion = usage.completion_tokens ?? usage.output_tokens;
  const total = usage.total_tokens ?? (
    typeof prompt === 'number' || typeof completion === 'number'
      ? (prompt || 0) + (completion || 0)
      : undefined
  );

  if (typeof prompt === 'number') {
    totalUsage.prompt_tokens = (totalUsage.prompt_tokens || 0) + prompt;
  }
  if (typeof completion === 'number') {
    totalUsage.completion_tokens = (totalUsage.completion_tokens || 0) + completion;
  }
  if (typeof total === 'number') {
    totalUsage.total_tokens = (totalUsage.total_tokens || 0) + total;
  }

  return totalUsage;
}

export function formatUsage(usage = {}) {
  const prompt = usage.prompt_tokens;
  const completion = usage.completion_tokens;
  const total = usage.total_tokens;

  if (typeof total === 'number' && typeof prompt === 'number' && typeof completion === 'number') {
    return `${total} total (${prompt} in, ${completion} out)`;
  }
  if (typeof total === 'number') return `${total} total`;
  if (typeof prompt === 'number' || typeof completion === 'number') {
    return `${prompt || 0} in, ${completion || 0} out`;
  }
  return '';
}

export function buildToolFallbackAnswer(toolSummaries, errorMessage = '') {
  const lines = ['I used the requested tools but could not get a final model response.'];
  if (errorMessage) lines.push(`Final answer request failed: ${errorMessage}`);
  if (toolSummaries.length) {
    lines.push('Tool results:');
    lines.push(...toolSummaries.map(summary => `- ${summary}`));
  }
  return lines.join('\n');
}

export function formatToolResultForConsole(toolName, result) {
  if (!result) return '';
  if (result.success === false) {
    return [
      `Tool failed: ${result.error || 'unknown error'}`,
      result.recovery ? `Recovery: ${result.recovery}` : '',
    ].filter(Boolean).join('\n');
  }

  switch (toolName) {
    case 'Read':
      return `Read ${result.path} (${result.lines} lines, ${result.size} chars)`;
    case 'Write':
      return result.diff ? `Wrote ${result.path}\n${result.diff}` : `Wrote ${result.path} (${result.size} chars)`;
    case 'Edit':
      return result.diff ? `Edited ${result.path}\n${result.diff}` : `Edited ${result.path} (${result.replacements} replacements)`;
    case 'Glob':
      return `Found ${result.count} file(s)`;
    case 'Grep':
      return `Found ${result.count} match(es)`;
    case 'Bash': {
      const output = (result.stdout || result.stderr || '').trim();
      return output.length > 1200 ? `${output.slice(0, 1200)}\n... truncated` : output;
    }
    case 'WebFetch':
      return `Fetched ${result.url} (${result.length} chars)`;
    case 'WebSearch':
      return `Found ${result.count} result(s)`;
    default:
      return result.message || '';
  }
}

export function compactText(text, maxChars = 1200, label = 'text') {
  const value = String(text ?? '');
  if (value.length <= maxChars) return value;

  const headChars = Math.max(0, Math.floor(maxChars * 0.7));
  const tailChars = Math.max(0, Math.floor(maxChars * 0.2));
  const head = value.slice(0, headChars);
  const tail = tailChars > 0 ? value.slice(-tailChars) : '';
  const omitted = Math.max(0, value.length - head.length - tail.length);

  return [
    head,
    `[${label} truncated: ${omitted} chars omitted]`,
    tail,
  ].filter(Boolean).join('\n');
}

export function summarizePromptList(items, { limit = 8, maxEntryChars = 220, maxTotalChars = 1600, mapper = value => value?.text ?? String(value ?? '') } = {}) {
  const selected = [];
  let total = 0;

  for (const item of items.slice(-limit)) {
    const raw = compactText(mapper(item), maxEntryChars, 'entry').trim();
    if (!raw) continue;
    if (total + raw.length > maxTotalChars && selected.length > 0) break;
    selected.push(`- ${raw}`);
    total += raw.length;
  }

  if (items.length > selected.length) {
    selected.push(`- ... (${items.length - selected.length} items omitted)`);
  }

  return selected.join('\n');
}
