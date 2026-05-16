import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addUsage,
  buildToolCallSignature,
  compactText,
  extractInlineToolCalls,
  formatAnswerFooter,
  formatToolResultForConsole,
  normalizeToolCalls,
  parseToolArguments,
  summarizePromptList,
} from './conversation-format.js';

test('usage helpers aggregate OpenAI and Anthropic style token usage', () => {
  const usage = {};
  addUsage(usage, { prompt_tokens: 3, completion_tokens: 2 });
  addUsage(usage, { input_tokens: 5, output_tokens: 7 });

  assert.deepEqual(usage, { prompt_tokens: 8, completion_tokens: 9, total_tokens: 17 });
  assert.equal(formatAnswerFooter(1000, usage, 2500), 'Time: 1.5s · Tokens: 17 total (8 in, 9 out)');
});

test('tool argument parser recovers embedded JSON and reports malformed args', () => {
  assert.deepEqual(parseToolArguments('prefix {"command":"npm test"} suffix'), { command: 'npm test' });

  const bad = parseToolArguments('{"command":');
  assert.match(bad.__toolArgParseError, /Unexpected/);
  assert.equal(bad.__rawToolArgs, '{"command":');
});

test('inline minimax tool calls are extracted and normalized', () => {
  const inline = '<minimax:tool_call><invoke name="Bash"><parameter name="command">echo &quot;ok&quot;</parameter></invoke></minimax:tool_call>';
  const extracted = extractInlineToolCalls(`run ${inline}`, index => `id-${index}`);
  const normalized = normalizeToolCalls(extracted.toolCalls);

  assert.equal(extracted.content, 'run');
  assert.equal(normalized[0].toolName, 'Bash');
  assert.deepEqual(normalized[0].toolArgs, { command: 'echo "ok"' });
});

test('tool result and signature helpers stay compact', () => {
  const result = formatToolResultForConsole('Bash', { success: true, stdout: 'x'.repeat(1300) });
  assert.match(result, /truncated/);

  const signature = buildToolCallSignature([{ toolName: 'bash', toolArgs: { command: 'pwd' } }], name => name.toUpperCase());
  assert.equal(signature, 'BASH:{"command":"pwd"}');
});

test('prompt text helpers compact long entries', () => {
  const compact = compactText('a'.repeat(100), 30, 'sample');
  assert.match(compact, /sample truncated/);

  const summary = summarizePromptList([{ text: 'one' }, { text: 'two' }, { text: 'three' }], { limit: 2 });
  assert.match(summary, /two/);
  assert.match(summary, /items omitted/);
});
