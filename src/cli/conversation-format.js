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
    return `Tool failed: ${result.error || 'unknown error'}`;
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

export function normalizeToolCalls(toolCalls, parseArguments = parseToolArguments) {
  if (!Array.isArray(toolCalls)) return [];

  return toolCalls.map((tc, index) => {
    const fn = tc.function || {};
    const rawArgs = fn.arguments ?? tc.arguments ?? tc.input ?? {};
    const parsedArgs = parseArguments(rawArgs);
    const nestedName = parsedArgs?.name || parsedArgs?.tool || parsedArgs?.tool_name;
    const nestedArgs = parsedArgs?.arguments ?? parsedArgs?.args ?? parsedArgs?.input;

    return {
      ...tc,
      id: tc.id || `call-${index}`,
      toolName: fn.name || tc.name || tc.tool_name || nestedName || tc.type,
      toolArgs: nestedName && nestedArgs !== undefined ? parseArguments(nestedArgs) : parsedArgs,
    };
  });
}

export function extractInlineToolCalls(content, idFactory = index => `inline-${Date.now()}-${index}`) {
  const text = String(content || '');
  const toolCalls = [];
  let cleaned = text;
  const pushToolCall = (name, args) => {
    toolCalls.push({
      id: idFactory(toolCalls.length),
      type: 'function',
      function: {
        name,
        arguments: typeof args === 'string' ? args : JSON.stringify(args || {}),
      },
    });
  };

  const invokePattern = /(?:<[\w.-]+:tool_call>\s*)?<invoke\s+name=["']([^"']+)["']>([\s\S]*?)<\/invoke>\s*(?:<\/[\w.-]+:tool_call>)?/gi;

  cleaned = cleaned.replace(invokePattern, (_match, name, body) => {
    const args = {};
    const paramPattern = /<parameter\s+name=["']([^"']+)["']>([\s\S]*?)<\/parameter>/gi;
    let param;
    while ((param = paramPattern.exec(body))) {
      args[param[1]] = decodeXmlEntities(param[2].trim());
    }
    pushToolCall(name, args);
    return '';
  }).trim();

  const namedToolPattern = /<tool_call\s+name=["']([^"']+)["']>([\s\S]*?)<\/tool_call>/gi;
  cleaned = cleaned.replace(namedToolPattern, (_match, name, body) => {
    pushToolCall(name, decodeXmlEntities(body.trim()));
    return '';
  }).trim();

  const jsonToolPattern = /<tool_call>([\s\S]*?)<\/tool_call>/gi;
  cleaned = cleaned.replace(jsonToolPattern, (_match, body) => {
    const parsed = parseToolArguments(decodeXmlEntities(body.trim()));
    const name = parsed.name || parsed.tool || parsed.tool_name;
    const args = parsed.arguments ?? parsed.args ?? parsed.input ?? parsed;
    if (name) pushToolCall(name, args);
    return name ? '' : _match;
  }).trim();

  const functionPattern = /<function(?:\s+name=["']([^"']+)["']|=([^>\s]+))>([\s\S]*?)<\/function>/gi;
  cleaned = cleaned.replace(functionPattern, (_match, quotedName, bareName, body) => {
    pushToolCall(quotedName || bareName, decodeXmlEntities(body.trim()));
    return '';
  }).trim();

  const fencedToolPattern = /```(?:tool|tool_call|function)\s*\n([\s\S]*?)```/gi;
  cleaned = cleaned.replace(fencedToolPattern, (_match, body) => {
    const trimmed = body.trim();
    const parsed = parseToolArguments(trimmed);
    const name = parsed.name || parsed.tool || parsed.tool_name;
    if (name) {
      pushToolCall(name, parsed.arguments ?? parsed.args ?? parsed.input ?? parsed);
      return '';
    }
    const lineMatch = trimmed.match(/^([A-Za-z][\w.-]*)\s+([\s\S]+)$/);
    if (lineMatch) {
      pushToolCall(lineMatch[1], lineMatch[2].trim());
      return '';
    }
    return _match;
  }).trim();

  return { content: cleaned, toolCalls };
}

export function decodeXmlEntities(value) {
  return String(value || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

export function parseToolArguments(rawArgs) {
  if (!rawArgs) return {};
  if (typeof rawArgs === 'object') return rawArgs;
  if (typeof rawArgs !== 'string') return {};

  const text = rawArgs.trim();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch (error) {
    const extracted = extractFirstJsonObject(text);
    if (extracted && extracted !== text) {
      try {
        return JSON.parse(extracted);
      } catch {}
    }

    for (const repaired of buildJsonRepairCandidates(extracted || text)) {
      try {
        return JSON.parse(repaired);
      } catch {}
    }

    return {
      __toolArgParseError: error.message,
      __rawToolArgs: text.length > 800 ? `${text.slice(0, 800)}...` : text,
    };
  }
}

export function buildJsonRepairCandidates(text) {
  const value = String(text || '').trim();
  if (!value) return [];
  const candidates = [];

  candidates.push(
    value
      .replace(/([{,]\s*)([A-Za-z_$][\w$-]*)(\s*:)/g, '$1"$2"$3')
      .replace(/:\s*'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_m, inner) => `: "${inner.replace(/"/g, '\\"')}"`)
      .replace(/:\s*([^'",{}\[\]\r\n][^,}\]\r\n]*)/g, (_m, inner) => {
        const trimmed = inner.trim();
        if (trimmed.startsWith('"')) return `: ${trimmed}`;
        if (/^(true|false|null|-?\d+(?:\.\d+)?)$/i.test(trimmed)) return `: ${trimmed}`;
        return `: "${trimmed.replace(/"/g, '\\"')}"`;
      })
      .replace(/,\s*([}\]])/g, '$1')
  );

  candidates.push(
    value
      .replace(/'/g, '"')
      .replace(/,\s*([}\]])/g, '$1')
  );

  return [...new Set(candidates)].filter(candidate => candidate && candidate !== value);
}

export function extractFirstJsonObject(text) {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return null;
}

export function formatToolCallsForMessage(toolCalls) {
  return toolCalls.map((tc) => ({
    id: tc.id,
    type: 'function',
    function: {
      name: tc.toolName || tc.function?.name || 'unknown',
      arguments: JSON.stringify(tc.toolArgs || {}),
    },
  }));
}

export function buildToolCallSignature(toolCalls, normalizeToolName = name => name) {
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) return '';

  return toolCalls.map((tc) => {
    const rawName = tc.toolName || tc.function?.name || tc.type || '';
    const toolName = normalizeToolName(rawName) || rawName;
    const toolArgs = tc.toolArgs && typeof tc.toolArgs === 'object' ? tc.toolArgs : {};
    return `${toolName}:${JSON.stringify(toolArgs)}`;
  }).join(' | ');
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
