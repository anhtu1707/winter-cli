import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildChromeDevtoolsArgs,
  createChromeDevtoolsMcpServer,
  createFigmaMcpServer,
  getMcpPreset,
  upsertMcpServer,
} from './presets.js';

test('chrome-devtools preset builds npx command for non-Windows platforms', () => {
  const server = createChromeDevtoolsMcpServer(['--headless', '--isolated'], 'linux', {});

  assert.equal(server.name, 'chrome-devtools');
  assert.equal(server.command, 'npx');
  assert.deepEqual(server.args, ['-y', 'chrome-devtools-mcp@latest', '--headless', '--isolated']);
  assert.equal(server.enabled, true);
  assert.equal(server.requestTimeoutMs, 60000);
});

test('chrome-devtools preset builds cmd wrapper and environment for Windows', () => {
  const server = createChromeDevtoolsMcpServer(['--browser-url', 'http://127.0.0.1:9222'], 'win32', {
    SystemRoot: 'C:\\Windows',
    PROGRAMFILES: 'C:\\Program Files',
  });

  assert.equal(server.command, 'cmd');
  assert.deepEqual(server.args, ['/c', 'npx', '-y', 'chrome-devtools-mcp@latest', '--browser-url', 'http://127.0.0.1:9222']);
  assert.equal(server.env.SystemRoot, 'C:\\Windows');
  assert.equal(server.env.PROGRAMFILES, 'C:\\Program Files');
});

test('chrome-devtools preset validates option values', () => {
  assert.throws(() => buildChromeDevtoolsArgs(['--browser-url']), /Missing value/);
  assert.deepEqual(
    buildChromeDevtoolsArgs(['--viewport', '1280x720', '--acceptInsecureCerts']),
    ['-y', 'chrome-devtools-mcp@latest', '--viewport', '1280x720', '--acceptInsecureCerts'],
  );
});

test('figma preset bridges the local Dev Mode MCP server through mcp-remote', () => {
  const server = createFigmaMcpServer([], 'win32', {
    SystemRoot: 'C:\\Windows',
    PROGRAMFILES: 'C:\\Program Files',
  });

  assert.equal(server.name, 'figma');
  assert.equal(server.command, 'cmd');
  assert.deepEqual(server.args, ['/c', 'npx', '-y', 'mcp-remote@latest', 'http://127.0.0.1:3845/mcp']);
  assert.equal(server.enabled, true);
  assert.equal(server.requestTimeoutMs, 60000);
});

test('mcp preset upsert also allowlists the server', () => {
  const config = {
    mcp: { servers: [{ name: 'chrome-devtools', command: 'old', args: [], enabled: true }] },
    permissions: { allowlist: { tools: [], commands: [], mcpServers: [] } },
  };

  const server = getMcpPreset('chrome', ['--headless']);
  upsertMcpServer(config, server);

  assert.equal(config.mcp.servers.length, 1);
  assert.equal(config.mcp.servers[0].command, process.platform === 'win32' ? 'cmd' : 'npx');
  assert.deepEqual(config.permissions.allowlist.mcpServers, ['chrome-devtools']);
});

test('mcp preset accepts figma aliases', () => {
  const server = getMcpPreset('figma-dev-mode');

  assert.equal(server.name, 'figma');
  assert.ok(server.args.includes('http://127.0.0.1:3845/mcp'));
});
