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
  assert.deepEqual(parseToolArguments('prefix [{"command":"npm test"}] suffix'), [{ command: 'npm test' }]);
  assert.deepEqual(parseToolArguments("{command:'npm test',}"), { command: 'npm test' });
  assert.deepEqual(parseToolArguments("{file_path:'README.md'}"), { file_path: 'README.md' });
  assert.deepEqual(parseToolArguments('{command:npm test, timeout:1000}'), { command: 'npm test', timeout: 1000 });

  const bad = parseToolArguments('{"command":');
  assert.match(bad.__toolArgParseError, /Unexpected/);
  assert.equal(bad.__rawToolArgs, '{"command":');
});

test('inline XML invoke tool calls are extracted and normalized for any provider wrapper', () => {
  const inline = '<provider:tool_call><invoke name="Bash"><parameter name="command">echo &quot;ok&quot;</parameter></invoke></provider:tool_call>';
  const extracted = extractInlineToolCalls(`run ${inline}`, index => `id-${index}`);
  const normalized = normalizeToolCalls(extracted.toolCalls);

  assert.equal(extracted.content, 'run');
  assert.equal(normalized[0].toolName, 'Bash');
  assert.deepEqual(normalized[0].toolArgs, { command: 'echo "ok"' });
});

test('inline XML invoke tool calls work without provider-specific wrapper', () => {
  const inline = '<invoke name="Read"><parameter name="path">src/cli/repl.js</parameter></invoke>';
  const extracted = extractInlineToolCalls(`check ${inline}`, index => `id-${index}`);
  const normalized = normalizeToolCalls(extracted.toolCalls);

  assert.equal(extracted.content, 'check');
  assert.equal(normalized[0].toolName, 'Read');
  assert.deepEqual(normalized[0].toolArgs, { path: 'src/cli/repl.js' });
});

test('inline tool extraction accepts common XML and fenced formats', () => {
  const content = [
    '<tool_call name="Read">{"file_path":"README.md"}</tool_call>',
    '<tool_call>{"name":"Bash","arguments":{"command":"npm test"}}</tool_call>',
    '```tool\nGrep {"pattern":"Winter","path":"README.md"}\n```',
  ].join('\n');
  const extracted = extractInlineToolCalls(content, index => `id-${index}`);
  const normalized = normalizeToolCalls(extracted.toolCalls);

  assert.equal(normalized.length, 3);
  assert.equal(normalized[0].toolName, 'Read');
  assert.deepEqual(normalized[0].toolArgs, { file_path: 'README.md' });
  assert.equal(normalized[1].toolName, 'Bash');
  assert.deepEqual(normalized[1].toolArgs, { command: 'npm test' });
  assert.equal(normalized[2].toolName, 'Grep');
  assert.deepEqual(normalized[2].toolArgs, { pattern: 'Winter', path: 'README.md' });
  assert(!extracted.content.includes('tool_call'));
});

test('inline tool extraction accepts provider fallback JSON and command formats', () => {
  const cases = [
    '{"tool":"Read","arguments":{"path":"README.md"}}',
    '```json\n{"name":"Grep","args":{"pattern":"Winter","path":"README.md"}}\n```',
    'Tool: Bash\nArguments: {"command":"npm test"}',
    'CALL_TOOL Read {"file_path":"src/cli/repl.js"}',
    '<tool name="Glob">{"pattern":"src/**/*.js"}</tool>',
  ];

  const normalized = cases.flatMap((content, caseIndex) => {
    const extracted = extractInlineToolCalls(content, index => `case-${caseIndex}-${index}`);
    return normalizeToolCalls(extracted.toolCalls);
  });

  assert.deepEqual(normalized.map(call => call.toolName), ['Read', 'Grep', 'Bash', 'Read', 'Glob']);
  assert.deepEqual(normalized[0].toolArgs, { path: 'README.md' });
  assert.deepEqual(normalized[1].toolArgs, { pattern: 'Winter', path: 'README.md' });
  assert.deepEqual(normalized[2].toolArgs, { command: 'npm test' });
  assert.deepEqual(normalized[3].toolArgs, { file_path: 'src/cli/repl.js' });
  assert.deepEqual(normalized[4].toolArgs, { pattern: 'src/**/*.js' });
});

test('inline tool extraction accepts arrays of JSON tool calls', () => {
  const extracted = extractInlineToolCalls(JSON.stringify([
    { tool: 'Read', arguments: { path: 'README.md' } },
    { action: 'Bash', params: { command: 'npm test' } },
  ]));
  const normalized = normalizeToolCalls(extracted.toolCalls);

  assert.equal(extracted.content, '');
  assert.equal(normalized.length, 2);
  assert.equal(normalized[0].toolName, 'Read');
  assert.deepEqual(normalized[1].toolArgs, { command: 'npm test' });
});

test('normalizeToolCalls supports anthropic, gemini, and responses-api payload styles', () => {
  const normalized = normalizeToolCalls([
    { type: 'tool_use', name: 'Read', input: { file_path: 'README.md' } },
    { functionCall: { name: 'Bash', args: { command: 'npm test' } } },
    { type: 'function', name: 'Grep', arguments: '{"pattern":"Winter","path":"README.md"}' },
  ]);

  assert.deepEqual(normalized.map(call => call.toolName), ['Read', 'Bash', 'Grep']);
  assert.deepEqual(normalized[0].toolArgs, { file_path: 'README.md' });
  assert.deepEqual(normalized[1].toolArgs, { command: 'npm test' });
  assert.deepEqual(normalized[2].toolArgs, { pattern: 'Winter', path: 'README.md' });
});

test('tool failure output includes recovery guidance', () => {
  const output = formatToolResultForConsole('Bash', {
    success: false,
    error: 'Command failed',
    recovery: 'Try npm test',
  });

  assert.match(output, /Tool failed: Command failed/);
  assert.match(output, /Recovery: Try npm test/);
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
