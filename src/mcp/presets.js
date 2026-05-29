export const CHROME_DEVTOOLS_MCP_NAME = 'chrome-devtools';
export const FIGMA_MCP_NAME = 'figma';

const CHROME_DEVTOOLS_PACKAGE = 'chrome-devtools-mcp@latest';
const CHROME_DEVTOOLS_SOURCE = 'https://github.com/ChromeDevTools/chrome-devtools-mcp';
const MCP_REMOTE_PACKAGE = 'mcp-remote@latest';
const FIGMA_DEV_MODE_MCP_URL = 'http://127.0.0.1:3845/mcp';
const FIGMA_DEV_MODE_MCP_SOURCE = 'https://developers.figma.com/docs/figma-mcp-server/local-server-installation/';

const CHROME_DEVTOOLS_FLAGS_WITH_VALUES = new Set([
  '--browser-url',
  '--channel',
  '--executablePath',
  '--logFile',
  '--viewport',
  '--proxy-server',
]);

const CHROME_DEVTOOLS_BOOLEAN_FLAGS = new Set([
  '--headless',
  '--isolated',
  '--acceptInsecureCerts',
  '--help',
]);

export function normalizeMcpPresetName(name = '') {
  return String(name || '').trim().toLowerCase();
}

export function isChromeDevtoolsPreset(name = '') {
  return ['chrome-devtools', 'chromedevtools', 'chrome', 'devtools', 'cdp'].includes(normalizeMcpPresetName(name));
}

export function isFigmaPreset(name = '') {
  return ['figma', 'figma-dev-mode', 'figmadevmode', 'figma-desktop', 'figmadesktop'].includes(normalizeMcpPresetName(name));
}

export function buildChromeDevtoolsArgs(options = []) {
  const input = Array.isArray(options) ? [...options] : [];
  const args = ['-y', CHROME_DEVTOOLS_PACKAGE];

  for (let index = 0; index < input.length; index += 1) {
    const flag = input[index];
    if (!String(flag || '').startsWith('--')) continue;

    if (CHROME_DEVTOOLS_BOOLEAN_FLAGS.has(flag)) {
      args.push(flag);
      continue;
    }

    if (CHROME_DEVTOOLS_FLAGS_WITH_VALUES.has(flag)) {
      const value = input[index + 1];
      if (value === undefined || String(value).startsWith('--')) {
        throw new Error(`Missing value for ${flag}`);
      }
      args.push(flag, String(value));
      index += 1;
    }
  }

  return args;
}

export function createChromeDevtoolsMcpServer(options = [], platform = process.platform, env = process.env) {
  const npxArgs = buildChromeDevtoolsArgs(options);
  const common = {
    name: CHROME_DEVTOOLS_MCP_NAME,
    enabled: true,
    requestTimeoutMs: 60000,
    metadata: {
      preset: CHROME_DEVTOOLS_MCP_NAME,
      source: CHROME_DEVTOOLS_SOURCE,
      purpose: 'Chrome DevTools MCP for live browser automation, debugging, screenshots, console, network, and performance traces.',
    },
  };

  if (platform === 'win32') {
    return {
      ...common,
      command: 'cmd',
      args: ['/c', 'npx', ...npxArgs],
      env: {
        SystemRoot: env.SystemRoot || 'C:\\Windows',
        PROGRAMFILES: env.PROGRAMFILES || 'C:\\Program Files',
      },
    };
  }

  return {
    ...common,
    command: 'npx',
    args: npxArgs,
  };
}

export function createFigmaMcpServer(options = [], platform = process.platform, env = process.env) {
  const input = Array.isArray(options) ? [...options] : [];
  const customUrlIndex = input.findIndex(value => value === '--url' || value === '--endpoint');
  const endpoint = customUrlIndex >= 0 && input[customUrlIndex + 1]
    ? String(input[customUrlIndex + 1])
    : FIGMA_DEV_MODE_MCP_URL;
  const npxArgs = ['-y', MCP_REMOTE_PACKAGE, endpoint];
  const common = {
    name: FIGMA_MCP_NAME,
    enabled: true,
    requestTimeoutMs: 60000,
    metadata: {
      preset: FIGMA_MCP_NAME,
      source: FIGMA_DEV_MODE_MCP_SOURCE,
      endpoint,
      purpose: 'Figma Dev Mode MCP for direct design context, selected frame inspection, assets, variables, and design-to-code workflows.',
    },
  };

  if (platform === 'win32') {
    return {
      ...common,
      command: 'cmd',
      args: ['/c', 'npx', ...npxArgs],
      env: {
        SystemRoot: env.SystemRoot || 'C:\\Windows',
        PROGRAMFILES: env.PROGRAMFILES || 'C:\\Program Files',
      },
    };
  }

  return {
    ...common,
    command: 'npx',
    args: npxArgs,
  };
}

export function getMcpPreset(name, options = []) {
  if (isChromeDevtoolsPreset(name)) {
    return createChromeDevtoolsMcpServer(options);
  }
  if (isFigmaPreset(name)) {
    return createFigmaMcpServer(options);
  }
  throw new Error(`Unknown MCP preset: ${name}`);
}

export function ensureMcpConfigShape(config = {}) {
  config.mcp = config.mcp || { servers: [] };
  config.mcp.servers = Array.isArray(config.mcp.servers) ? config.mcp.servers : [];
  config.permissions = config.permissions || { allowlist: {} };
  config.permissions.allowlist = config.permissions.allowlist || {};
  config.permissions.allowlist.tools = config.permissions.allowlist.tools || [];
  config.permissions.allowlist.commands = config.permissions.allowlist.commands || [];
  config.permissions.allowlist.mcpServers = config.permissions.allowlist.mcpServers || [];
  return config;
}

export function upsertMcpServer(config, server) {
  ensureMcpConfigShape(config);
  config.mcp.servers = config.mcp.servers.filter(item => item.name !== server.name);
  config.mcp.servers.push(server);
  config.permissions.allowlist.mcpServers = [
    ...new Set([...(config.permissions.allowlist.mcpServers || []), server.name]),
  ];
  return config;
}
