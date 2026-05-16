/**
 * IDE Server - MCP server for IDE integration (VS Code, JetBrains).
 * Provides endpoints for file operations, diagnostics, and inline completions.
 */

import { createServer } from 'net';
import { promises as fs } from 'fs';
import path from 'path';
import { MCPProtocol } from './protocol.js';

const SERVER_NAME = 'winter-ide';
const SERVER_VERSION = '1.0.0';

export class IDEServer {
  constructor(options = {}) {
    this.port = options.port || 4157;
    this.host = options.host || '127.0.0.1';
    this.projectPath = options.projectPath || process.cwd();
    this.protocol = new MCPProtocol();
    this.server = null;
    this.clients = new Map();
    this.handlers = new Map();
    this._registerDefaultHandlers();
  }

  /**
   * Start the IDE server.
   */
  async start() {
    return new Promise((resolve, reject) => {
      this.server = createServer((socket) => {
        const clientId = `${socket.remoteAddress}:${socket.remotePort}`;
        this.clients.set(clientId, socket);

        let buffer = '';
        socket.on('data', (data) => {
          buffer += data.toString();
          const messages = buffer.split('\n');
          buffer = messages.pop() || '';

          for (const msg of messages) {
            if (msg.trim()) {
              this._handleMessage(clientId, msg.trim());
            }
          }
        });

        socket.on('close', () => {
          this.clients.delete(clientId);
        });

        socket.on('error', () => {
          this.clients.delete(clientId);
        });

        // Send server info
        this._send(socket, {
          type: 'server:info',
          name: SERVER_NAME,
          version: SERVER_VERSION,
          projectPath: this.projectPath,
        });
      });

      this.server.on('error', reject);
      this.server.listen(this.port, this.host, () => {
        console.log(`[IDE Server] Listening on ${this.host}:${this.port}`);
        resolve();
      });
    });
  }

  /**
   * Stop the IDE server.
   */
  async stop() {
    for (const [id, socket] of this.clients) {
      socket.end();
    }
    this.clients.clear();

    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          this.server = null;
          resolve();
        });
      });
    }
  }

  /**
   * Register a custom message handler.
   */
  on(type, handler) {
    this.handlers.set(type, handler);
    return this;
  }

  /**
   * Broadcast a message to all connected clients.
   */
  broadcast(message) {
    for (const [, socket] of this.clients) {
      this._send(socket, message);
    }
  }

  /**
   * Send file changes to IDE.
   */
  notifyFileChange(filePath) {
    this.broadcast({
      type: 'file:changed',
      path: filePath,
      timestamp: Date.now(),
    });
  }

  /**
   * Send diagnostics to IDE.
   */
  notifyDiagnostics(diagnostics) {
    this.broadcast({
      type: 'diagnostics:update',
      diagnostics: Array.isArray(diagnostics) ? diagnostics : [diagnostics],
    });
  }

  // --- Private handlers ---

  _registerDefaultHandlers() {
    this.handlers.set('file:read', async (clientId, msg) => {
      try {
        const content = await fs.readFile(path.resolve(this.projectPath, msg.path), 'utf8');
        this._sendTo(clientId, { type: 'file:content', path: msg.path, content });
      } catch (error) {
        this._sendTo(clientId, { type: 'error', message: `Failed to read ${msg.path}: ${error.message}` });
      }
    });

    this.handlers.set('file:write', async (clientId, msg) => {
      try {
        const fullPath = path.resolve(this.projectPath, msg.path);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, msg.content, 'utf8');
        this._sendTo(clientId, { type: 'file:saved', path: msg.path });
      } catch (error) {
        this._sendTo(clientId, { type: 'error', message: `Failed to write ${msg.path}: ${error.message}` });
      }
    });

    this.handlers.set('project:info', (clientId) => {
      this._sendTo(clientId, {
        type: 'project:info',
        path: this.projectPath,
        name: path.basename(this.projectPath),
        files: null, // Could be expanded to return file tree
      });
    });

    this.handlers.set('ping', (clientId) => {
      this._sendTo(clientId, { type: 'pong', timestamp: Date.now() });
    });
  }

  async _handleMessage(clientId, raw) {
    try {
      const msg = JSON.parse(raw);
      const handler = this.handlers.get(msg.type);
      if (handler) {
        await handler(clientId, msg);
      } else {
        this._sendTo(clientId, { type: 'error', message: `Unknown message type: ${msg.type}` });
      }
    } catch (error) {
      this._sendTo(clientId, { type: 'error', message: `Parse error: ${error.message}` });
    }
  }

  _send(socket, message) {
    try {
      socket.write(JSON.stringify(message) + '\n');
    } catch {}
  }

  _sendTo(clientId, message) {
    const socket = this.clients.get(clientId);
    if (socket) {
      this._send(socket, message);
    }
  }
}

export default IDEServer;
