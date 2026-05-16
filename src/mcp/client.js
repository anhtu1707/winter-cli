import { spawn } from 'child_process';
import { encodeMcpMessage, decodeMcpMessages, createNotification, createRequest } from './protocol.js';

export class MCPClient {
  constructor(serverConfig = {}) {
    this.serverConfig = serverConfig;
    this.process = null;
    this.requestId = 0;
    this.pending = new Map();
    this.buffer = '';
    this.initialized = false;
    this.capabilities = null;
    this.tools = [];
    this.requestTimeoutMs = Number(serverConfig.requestTimeoutMs || 30000);
  }

  async connect() {
    if (this.process) return;

    const command = this.serverConfig.command;
    if (!command) {
      throw new Error('MCP server command is required');
    }

    const args = Array.isArray(this.serverConfig.args) ? this.serverConfig.args : [];
    this.process = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
      windowsHide: true,
    });

    this.process.stdout.on('data', chunk => this.handleStdout(chunk));
    this.process.stderr.on('data', chunk => {
      const text = String(chunk || '').trim();
      if (text) {
        this.lastStderr = text;
      }
    });
    this.process.on('error', error => {
      this.rejectAllPending(error);
      this.process = null;
      this.initialized = false;
    });
    this.process.on('exit', code => {
      this.rejectAllPending(new Error(`MCP server exited${code === null ? '' : ` with code ${code}`}${this.lastStderr ? `: ${this.lastStderr}` : ''}`));
      this.process = null;
      this.initialized = false;
    });

    await this.initialize();
  }

  async initialize() {
    if (this.initialized) return this.capabilities;
    const result = await this.request('initialize', {
      protocolVersion: this.serverConfig.protocolVersion || '2024-11-05',
      clientInfo: { name: 'winter-cli', version: '2026.5.26' },
      capabilities: { tools: {} },
    });
    this.capabilities = result?.capabilities || null;
    this.initialized = true;
    this.sendNotification('initialized', {});
    return this.capabilities;
  }

  async listTools() {
    await this.connect();
    const response = await this.request('tools/list', {});
    this.tools = response?.tools || [];
    return this.tools;
  }

  async callTool(name, argumentsObject = {}) {
    await this.connect();
    return await this.request('tools/call', { name, arguments: argumentsObject });
  }

  sendNotification(method, params = {}) {
    if (!this.process?.stdin) return;
    this.process.stdin.write(encodeMcpMessage(createNotification(method, params)));
  }

  request(method, params = {}) {
    if (!this.process?.stdin) {
      return Promise.reject(new Error('MCP server is not connected'));
    }

    const id = ++this.requestId;
    const message = createRequest(id, method, params);
    const packet = encodeMcpMessage(message);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request timed out: ${method}`));
      }, this.requestTimeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.process.stdin.write(packet, error => {
        if (error) {
          clearTimeout(timer);
          this.pending.delete(id);
          reject(error);
        }
      });
    });
  }

  handleStdout(chunk) {
    this.buffer += String(chunk || '');
    const decoded = decodeMcpMessages(this.buffer);
    this.buffer = decoded.remaining;

    for (const message of decoded.messages) {
      if (message.id && this.pending.has(message.id)) {
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error) {
          pending.reject(new Error(message.error.message || 'MCP request failed'));
        } else {
          pending.resolve(message.result);
        }
      }
    }
  }

  async close() {
    if (!this.process) return;
    try {
      this.process.stdin.end();
      this.process.kill();
    } finally {
      this.process = null;
      this.initialized = false;
      this.pending.clear();
    }
  }

  rejectAllPending(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}
