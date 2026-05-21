import { TokenJuice } from '../context/token-juice.js';
import { getModelBudgetMultiplier } from '../ai/model-capabilities.js';

export function getMutatingToolNames() {
  return new Set([
    'Write',
    'Edit',
    'Bash',
    'StrReplaceAll',
    'InsertText',
    'NotebookEdit',
    'TodoWrite',
    'TodoUpdate',
    'TodoDelete',
    'SchedulerCreate',
    'SchedulerDelete',
    'SchedulerClear',
    'MCP',
  ]);
}

export function getToolResultPromptBudget(toolName, compact = false, modelTier = '') {
  const scale = getModelBudgetMultiplier(modelTier);
  const budgets = {
    Read: compact ? 2800 : 5000,
    Grep: compact ? 2200 : 4200,
    Glob: compact ? 1600 : 3000,
    Bash: compact ? 2600 : 5000,
    WebFetch: compact ? 3000 : 5500,
    WebSearch: compact ? 2200 : 3800,
    BrowserDebug: compact ? 2200 : 4200,
    NotebookRead: compact ? 2600 : 5000,
  };
  return Math.max(400, Math.round((budgets[toolName] || (compact ? 1800 : 3200)) * scale));
}

export function buildPromptToolResult({
  toolName,
  result,
  compact = false,
  modelTier = '',
  compactText = (value, maxChars) => String(value || '').slice(0, maxChars),
  summarizeToolResult = value => ({ ...value }),
} = {}) {
  if (!result || typeof result !== 'object') return result;

  const budget = getToolResultPromptBudget(toolName, compact, modelTier);
  const copy = summarizeToolResult(result);
  const preserveKeys = ['content', 'stdout', 'stderr', 'diff', 'matches', 'files', 'cells'];
  let remaining = budget;

  for (const key of preserveKeys) {
    const value = result[key];
    if (typeof value === 'string' && value) {
      const sliceSize = Math.max(400, Math.min(remaining, budget));
      copy[key] = compactText(value, sliceSize, `${toolName}.${key}`);
      remaining -= Math.min(value.length, sliceSize);
    } else if (Array.isArray(value)) {
      const json = JSON.stringify(value);
      const sliceSize = Math.max(400, Math.min(remaining, budget));
      try {
        copy[key] = JSON.parse(compactText(json, sliceSize, `${toolName}.${key}`));
      } catch {
        copy[key] = compactText(json, sliceSize, `${toolName}.${key}`);
      }
      remaining -= Math.min(json.length, sliceSize);
    }
    if (remaining <= 400) break;
  }

  if (result.size && typeof result.size === 'number') copy.size = result.size;
  if (result.lines && typeof result.lines === 'number') copy.lines = result.lines;
  if (result.path) copy.path = result.path;
  if (result.success !== undefined) copy.success = result.success;
  return copy;
}

export async function buildPromptToolResultWithTokenJuice({
  toolName,
  result,
  projectPath = process.cwd(),
  tokenJuice,
  compact = false,
  modelTier = '',
  compactText = (value, maxChars) => String(value || '').slice(0, maxChars),
  summarizeToolResult = value => ({ ...value }),
} = {}) {
  const promptResult = buildPromptToolResult({
    toolName,
    result,
    compact,
    modelTier,
    compactText,
    summarizeToolResult,
  });
  const juice = tokenJuice || new TokenJuice({ projectPath });
  return juice.compressToolResult({ toolName, result, promptResult });
}

export async function recordToolCallAdapterStats(session, toolCalls = []) {
  if (!Array.isArray(toolCalls) || toolCalls.length === 0 || typeof session?.updateContext !== 'function') return;
  const context = session.getContext?.() || {};
  const current = context.toolCallAdapterStats?.value || context.toolCallAdapterStats || {};
  const next = {
    total: Number(current.total || 0),
    bySource: { ...(current.bySource || {}) },
    byTool: { ...(current.byTool || {}) },
    updatedAt: new Date().toISOString(),
  };

  for (const call of toolCalls) {
    const source = call.source || 'unknown';
    const tool = call.toolName || call.function?.name || call.name || 'unknown';
    next.total += 1;
    next.bySource[source] = (next.bySource[source] || 0) + 1;
    next.byTool[tool] = (next.byTool[tool] || 0) + 1;
  }

  await session.updateContext('toolCallAdapterStats', next);
}
