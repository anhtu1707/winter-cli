import test from 'node:test';
import assert from 'node:assert/strict';

import { PermissionManager } from './permission.js';

test('PermissionManager prompts for sensitive tools and allows defaults', async () => {
  const config = {
    load: async () => ({
      permissions: {
        promptByDefault: true,
        allowlist: {
          tools: ['Read'],
          commands: [],
          mcpServers: [],
        },
      },
    }),
    save: async () => {},
  };

  const manager = new PermissionManager(config);

  assert.equal(await manager.shouldPromptForToolPermission('Read'), false);
  assert.equal(await manager.shouldPromptForToolPermission('Bash'), true);
});

test('PermissionManager can persist tool and MCP allowlists', async () => {
  let savedConfig = null;
  const config = {
    load: async () => ({
      permissions: { allowlist: { tools: [], commands: [], mcpServers: [] } },
    }),
    save: async (value) => { savedConfig = value; },
  };

  const manager = new PermissionManager(config);
  await manager.allowTool('Bash');
  await manager.allowMcpServer('workspace');

  assert(savedConfig.permissions.allowlist.tools.includes('Bash'));
  assert(savedConfig.permissions.allowlist.mcpServers.includes('workspace'));
});