import test from 'node:test';
import assert from 'node:assert/strict';

import { compressConversation, buildConversationSummary } from './compress.js';

test('compressConversation keeps recent entries and summarizes older context', () => {
  const entries = Array.from({ length: 8 }, (_, index) => ({
    role: index % 2 ? 'assistant' : 'user',
    content: `message ${index} ${'x'.repeat(200)}`,
  }));

  const result = compressConversation(entries, { keepRecent: 3, maxChars: 500 });

  assert.equal(result.compressed, true);
  assert.equal(result.recent.length, 3);
  assert.equal(result.omittedCount, 5);
  assert.match(result.summary, /Conversation summary/);
});

test('buildConversationSummary supports multimodal message arrays', () => {
  const summary = buildConversationSummary([
    {
      role: 'user',
      content: [
        { type: 'text', text: 'look at this' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
      ],
    },
  ]);

  assert.match(summary, /look at this/);
  assert.match(summary, /\[image\]/);
});

