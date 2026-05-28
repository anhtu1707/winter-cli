import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AgentRuntime } from './runtime.js';

test('AgentRuntime enforces scoped tools even for fallback tool calls', async () => {
  let turns = 0;
  let executed = false;
  const repl = {
    hydrateSessionToolPermissions() {},
    isCancelled: false,
    useUnicodeUi: false,
    sessionPermissionGrants: new Set(),
    session: {
      getContext: () => ({}),
      updateContext: async () => {},
    },
    ai: {
      tools: [],
      _modelTier: 'medium',
      setTools() {},
    },
    tools: {
      normalizeToolName: name => String(name),
      execute: async () => {
        executed = true;
        return { success: true };
      },
    },
    selectExecutionProfile: () => ({ provider: 'custom', model: 'mock' }),
    actionRequiresTools: () => false,
    async requestAssistantTurn() {
      turns += 1;
      if (turns === 1) {
        return {
          assistantMsg: { content: '' },
          toolCalls: [{ id: 'tool-1', toolName: 'Bash', toolArgs: { command: 'echo blocked' } }],
        };
      }
      return {
        assistantMsg: { content: 'blocked' },
        toolCalls: [],
        finalContent: 'blocked',
      };
    },
    buildToolCallSignature: calls => JSON.stringify(calls.map(call => call.toolName)),
    formatToolCallsForMessage: calls => calls,
    buildPromptToolResultForModel: async (_tool, result) => result,
    formatToolResultForConsole: (_tool, result) => result.error || '',
    shouldPromptForToolPermission: async () => false,
    recoverToolArgs: () => null,
    enrichToolArgs: (_tool, args) => args,
    buildToolFallbackAnswer: summaries => summaries.join('\n'),
    getLatestUserText: messages => messages.at(-1)?.content || '',
    shouldAutoVerifyAfterTools: () => false,
  };

  const runtime = new AgentRuntime(repl);
  const messages = [{ role: 'user', content: 'try disallowed shell' }];
  const result = await runtime.runConversation(messages, 'test subagent', [{ name: 'Read' }]);

  assert.equal(executed, false);
  assert.equal(result.finalContent, 'blocked');
  assert.equal(result.executedTools.length, 0);
  assert.match(result.toolSummaries.join('\n'), /not allowed for this agent/);
  assert.match(messages.find(message => message.role === 'tool')?.content || '', /not allowed/);
});
