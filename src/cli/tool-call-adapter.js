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
    if (!parsed || typeof parsed !== 'object') return false;
    const name = parsed.name || parsed.tool || parsed.tool_name || parsed.function?.name || parsed.action;
    const args = parsed.arguments ?? parsed.args ?? parsed.input ?? parsed.parameters ?? parsed.params ?? parsed.function?.arguments ?? {};
    if (!name || typeof name !== 'string') return false;
    pushToolCall(name, args, 'object');
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
