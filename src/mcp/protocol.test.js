import test from 'node:test';
import assert from 'node:assert/strict';

import { createNotification, createRequest, decodeMcpMessages, encodeMcpMessage } from './protocol.js';

test('MCP protocol encodes and decodes JSON-RPC packets', () => {
  const payload = createRequest(1, 'tools/list', { server: 'claude' });
  const packet = encodeMcpMessage(payload);
  const decoded = decodeMcpMessages(packet);

  assert.equal(decoded.remaining, '');
  assert.deepEqual(decoded.messages, [payload]);
});

test('MCP protocol supports notifications', () => {
  const payload = createNotification('initialized', {});
  const packet = encodeMcpMessage(payload);
  const decoded = decodeMcpMessages(packet);

  assert.deepEqual(decoded.messages, [payload]);
});