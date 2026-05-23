export function normalizeToolCalls(toolCalls, parseArguments = parseToolArguments) {
  if (!Array.isArray(toolCalls)) return [];

  return toolCalls.map((tc, index) => {
    const fn = tc.function || {};
    const rawArgs = fn.arguments ?? tc.arguments ?? tc.input ?? {};
    const parsedArgs = parseArguments(rawArgs);
    const nested = extractToolPayload(parsedArgs, parseArguments);
    const nestedName = nested.name;
    const nestedArgs = nested.args;
    const direct = extractToolPayload(tc, parseArguments);
    const fnPayload = extractToolPayload(fn, parseArguments);
    const toolName = fnPayload.name || direct.name || nestedName || tc.name || tc.tool_name || fn.name;
    const toolArgs = fnPayload.args ?? direct.args ?? nestedArgs ?? parsedArgs;

    return {
      ...tc,
      id: tc.id || `call-${index}`,
      toolName,
      toolArgs,
    };
  }).filter(call => typeof call.toolName === 'string' && call.toolName.trim() !== '' && call.toolName !== 'function');
}

export function extractInlineToolCalls(content, idFactory = index => `inline-${Date.now()}-${index}`) {
  const text = String(content || '');
  const toolCalls = [];
  let cleaned = text;
  const pushToolCall = (name, args, source = 'inline') => {
    toolCalls.push({
      id: idFactory(toolCalls.length),
      source,
      type: 'function',
      function: {
        name,
        arguments: typeof args === 'string' ? args : JSON.stringify(args || {}),
      },
    });
  };
  const pushParsedToolObject = (parsed) => {
    const { name, args } = extractToolPayload(parsed, parseToolArguments);
    if (name && typeof name === 'string') {
      pushToolCall(name, args, 'object');
      return true;
    }

    const inferred = inferSafeToolFromBareArguments(parsed);
    if (!inferred) return false;
    pushToolCall(inferred.name, inferred.args, 'bare-arguments');
    return true;
  };

  const invokePattern = /(?:<[\w.-]+:tool_call>\s*)?<invoke\s+name=["']([^"']+)["']>([\s\S]*?)<\/invoke>\s*(?:<\/[\w.-]+:tool_call>)?/gi;
  cleaned = cleaned.replace(invokePattern, (_match, name, body) => {
    const args = {};
    const paramPattern = /<parameter\s+name=["']([^"']+)["']>([\s\S]*?)<\/parameter>/gi;
    let param;
    while ((param = paramPattern.exec(body))) {
      args[param[1]] = decodeXmlEntities(param[2].trim());
    }
    pushToolCall(name, args, 'xml-invoke');
    return '';
  }).trim();

  const namedToolPattern = /<tool_call\s+name=["']([^"']+)["']>([\s\S]*?)<\/tool_call>/gi;
  cleaned = cleaned.replace(namedToolPattern, (_match, name, body) => {
    pushToolCall(name, decodeXmlEntities(body.trim()), 'xml-tool-call');
    return '';
  }).trim();

  const genericNamedToolPattern = /<(?:tool|function_call|call)\s+name=["']([^"']+)["']>([\s\S]*?)<\/(?:tool|function_call|call)>/gi;
  cleaned = cleaned.replace(genericNamedToolPattern, (_match, name, body) => {
    pushToolCall(name, decodeXmlEntities(body.trim()), 'xml-generic');
    return '';
  }).trim();

  const jsonToolPattern = /<tool_call>([\s\S]*?)<\/tool_call>/gi;
  cleaned = cleaned.replace(jsonToolPattern, (_match, body) => {
    const parsed = parseToolArguments(decodeXmlEntities(body.trim()));
    const name = parsed.name || parsed.tool || parsed.tool_name;
    const args = parsed.arguments ?? parsed.args ?? parsed.input ?? parsed;
    if (name) pushToolCall(name, args, 'xml-json-tool-call');
    return name ? '' : _match;
  }).trim();

  const functionPattern = /<function(?:\s+name=["']([^"']+)["']|=([^>\s]+))>([\s\S]*?)<\/function>/gi;
  cleaned = cleaned.replace(functionPattern, (_match, quotedName, bareName, body) => {
    pushToolCall(quotedName || bareName, decodeXmlEntities(body.trim()), 'xml-function');
    return '';
  }).trim();

  const fencedToolPattern = /```(?:tool|tool_call|function)\s*\n([\s\S]*?)```/gi;
  cleaned = cleaned.replace(fencedToolPattern, (_match, body) => {
    const trimmed = body.trim();
    const parsed = parseToolArguments(trimmed);
    const name = parsed.name || parsed.tool || parsed.tool_name;
    if (name) {
      pushToolCall(name, parsed.arguments ?? parsed.args ?? parsed.input ?? parsed, 'fenced-tool-json');
      return '';
    }
    const lineMatch = trimmed.match(/^([A-Za-z][\w.-]*)\s+([\s\S]+)$/);
    if (lineMatch) {
      pushToolCall(lineMatch[1], lineMatch[2].trim(), 'fenced-tool-line');
      return '';
    }
    return _match;
  }).trim();

  const fencedJsonToolPattern = /```(?:json|javascript|js)?\s*\n([\s\S]*?)```/gi;
  cleaned = cleaned.replace(fencedJsonToolPattern, (_match, body) => {
    const parsed = parseToolArguments(body.trim());
    if (Array.isArray(parsed)) {
      const startCount = toolCalls.length;
      for (const item of parsed) pushParsedToolObject(item);
      return toolCalls.length > startCount ? '' : _match;
    }
    return pushParsedToolObject(parsed) ? '' : _match;
  }).trim();

  const labeledToolPattern = /(?:^|\n)\s*(?:tool|tool_name|function|call_tool|call|action)\s*[:=]\s*([A-Za-z][\w.-]*)\s*(?:\n|\r\n?)\s*(?:arguments|args|input|parameters|params)\s*[:=]\s*([\s\S]*?)(?=\n\s*(?:tool|tool_name|function|call_tool|call|action)\s*[:=]|\n\s*$|$)/gi;
  cleaned = cleaned.replace(labeledToolPattern, (_match, name, args) => {
    pushToolCall(name, args.trim(), 'labeled-text');
    return '';
  }).trim();

  const commandToolPattern = /(?:^|\n)\s*(?:CALL_TOOL|TOOL_CALL|USE_TOOL|RUN_TOOL|@tool)\s+([A-Za-z][\w.-]*)\s+({[\s\S]*?})(?=\n|$)/gi;
  cleaned = cleaned.replace(commandToolPattern, (_match, name, args) => {
    pushToolCall(name, args.trim(), 'command-text');
    return '';
  }).trim();

  const trimmedCleaned = cleaned.trim();
  if (trimmedCleaned) {
    const parsed = parseToolArguments(trimmedCleaned);
    if (Array.isArray(parsed)) {
      const startCount = toolCalls.length;
      for (const item of parsed) pushParsedToolObject(item);
      if (toolCalls.length > startCount) cleaned = '';
    } else if (pushParsedToolObject(parsed)) {
      cleaned = '';
    }
  }

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
    const extracted = extractFirstJsonValue(text);
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
  const extracted = extractFirstJsonValue(text);
  if (!extracted || extracted[0] !== '{') return null;
  return extracted;
}

export function extractFirstJsonValue(text) {
  const source = String(text || '');
  const objectStart = source.indexOf('{');
  const arrayStart = source.indexOf('[');
  if (objectStart === -1 && arrayStart === -1) return null;
  const startIndex = objectStart === -1
    ? arrayStart
    : arrayStart === -1
      ? objectStart
      : Math.min(objectStart, arrayStart);

  const openChar = source[startIndex];
  const closeChar = openChar === '[' ? ']' : '}';

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = startIndex; i < source.length; i++) {
    const ch = source[i];
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
    if (ch === openChar) depth++;
    if (ch === closeChar) {
      depth--;
      if (depth === 0) return source.slice(startIndex, i + 1);
    }
  }

  return null;
}

function extractToolPayload(payload, parseArguments) {
  if (!payload || typeof payload !== 'object') {
    return { name: null, args: undefined };
  }

  // Anthropic / Claude style content block: { type: "tool_use", name, input }
  if (payload.type === 'tool_use' && typeof payload.name === 'string') {
    return { name: payload.name, args: payload.input ?? payload.arguments ?? {} };
  }

  // OpenAI Responses style function-call object
  if (payload.type === 'function' && typeof payload.name === 'string') {
    return { name: payload.name, args: parseArguments(payload.arguments ?? payload.input ?? {}) };
  }

  // Gemini style object: { functionCall: { name, args } }
  if (payload.functionCall && typeof payload.functionCall === 'object') {
    return {
      name: payload.functionCall.name || null,
      args: payload.functionCall.args ?? payload.functionCall.arguments ?? {},
    };
  }

  const nestedFunction = payload.function && typeof payload.function === 'object' ? payload.function : null;
  const name = payload.name
    || payload.tool
    || payload.tool_name
    || payload.action
    || payload.function_name
    || nestedFunction?.name
    || null;

  const args = payload.arguments
    ?? payload.args
    ?? payload.input
    ?? payload.parameters
    ?? payload.params
    ?? payload.tool_input
    ?? payload.function_arguments
    ?? nestedFunction?.arguments
    ?? nestedFunction?.input
    ?? {};

  const normalizedName = typeof name === 'string' ? name : null;
  return {
    name: normalizedName,
    args: normalizedName ? parseArguments(args) : undefined,
  };
}

export function inferSafeToolFromBareArguments(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const keys = Object.keys(value);
  if (keys.length === 0) return null;

  const hasGenericPayloadKeys = keys.some(key => /^(arguments?|args?|input|parameters?|params?|tool[_-]?input|function[_-]?arguments?)$/i.test(key));
  if (!hasGenericPayloadKeys) return null;

  const name = value.name || value.tool || value.tool_name || value.function_name || null;
  if (typeof name !== 'string' || !name.trim()) return null;

  const args = value.arguments ?? value.args ?? value.input ?? value.parameters ?? value.params ?? value.tool_input ?? value.function_arguments ?? {};
  return { name, args };
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
