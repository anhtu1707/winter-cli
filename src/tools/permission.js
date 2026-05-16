const DEFAULT_ALLOWED = new Set(['Read', 'Glob', 'Grep', 'LSP', 'TaskCreate', 'TaskUpdate', 'TaskList', 'WebFetch', 'WebSearch', 'Parallel']);
const SENSITIVE_TOOLS = new Set(['Bash', 'Write', 'Edit', 'MCP']);

export class PermissionManager {
  constructor(config, session = null) {
    this.config = config;
    this.session = session;
    this.lastSavedConfig = null;
  }

  async getPolicy() {
    const cfg = this.config?.load ? await this.config.load() : {};
    const permissions = cfg.permissions || {};
    const allowlist = permissions.allowlist || {};

    return {
      promptByDefault: permissions.promptByDefault !== false,
      allowedTools: new Set([...(allowlist.tools || []), ...DEFAULT_ALLOWED]),
      allowedCommands: new Set(allowlist.commands || []),
      allowedServers: new Set(allowlist.mcpServers || []),
    };
  }

  async isAllowedTool(toolName) {
    const policy = await this.getPolicy();
    return policy.allowedTools.has(toolName);
  }

  async shouldPromptForTool(toolName) {
    const policy = await this.getPolicy();
    if (!policy.promptByDefault) return false;
    if (policy.allowedTools.has(toolName)) return false;
    return SENSITIVE_TOOLS.has(toolName);
  }

  async shouldPromptForToolPermission(toolName) {
    return await this.shouldPromptForTool(toolName);
  }

  async isMcpServerAllowed(serverName) {
    if (!serverName) return false;
    const policy = await this.getPolicy();
    return policy.allowedServers.has(serverName);
  }

  async allowTool(toolName) {
    if (!this.config?.load || !this.config?.save) return;
    const cfg = this.mergeWithLastSavedConfig(await this.config.load());
    cfg.permissions = cfg.permissions || { allowlist: {} };
    cfg.permissions.allowlist = cfg.permissions.allowlist || {};
    const tools = new Set([...(cfg.permissions.allowlist.tools || []), toolName]);
    cfg.permissions.allowlist.tools = [...tools];
    await this.config.save(cfg);
    this.lastSavedConfig = cfg;
  }

  async allowMcpServer(serverName) {
    if (!this.config?.load || !this.config?.save) return;
    const cfg = this.mergeWithLastSavedConfig(await this.config.load());
    cfg.permissions = cfg.permissions || { allowlist: {} };
    cfg.permissions.allowlist = cfg.permissions.allowlist || {};
    const servers = new Set([...(cfg.permissions.allowlist.mcpServers || []), serverName]);
    cfg.permissions.allowlist.mcpServers = [...servers];
    await this.config.save(cfg);
    this.lastSavedConfig = cfg;
  }

  mergeWithLastSavedConfig(cfg = {}) {
    if (!this.lastSavedConfig?.permissions?.allowlist) return cfg;

    const current = cfg.permissions?.allowlist || {};
    const previous = this.lastSavedConfig.permissions.allowlist;

    return {
      ...cfg,
      permissions: {
        ...(cfg.permissions || {}),
        allowlist: {
          tools: [...new Set([...(previous.tools || []), ...(current.tools || [])])],
          commands: [...new Set([...(previous.commands || []), ...(current.commands || [])])],
          mcpServers: [...new Set([...(previous.mcpServers || []), ...(current.mcpServers || [])])],
        },
      },
    };
  }
}
