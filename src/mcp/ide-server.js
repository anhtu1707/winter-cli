/**
 * IDE Server - MCP server for IDE integration (VS Code, JetBrains).
 * Provides endpoints for file operations, diagnostics, and inline completions.
 */

import { createServer } from 'net';
import { promises as fs } from 'fs';
import path from 'path';
import { CompletionProvider } from './completions.js';
import { ConfigLoader } from '../cli/config.js';
import { AIProviderManager } from '../ai/providers.js';
import { extractTextFromResponse } from '../ai/provider-adapters.js';

const SERVER_NAME = 'winter-ide';
const SERVER_VERSION = '1.0.0';

export class IDEServer {
  constructor(options = {}) {
    this.port = options.port || 4157;
    this.host = options.host || '127.0.0.1';
    this.projectPath = options.projectPath || process.cwd();
    this.server = null;
    this.clients = new Map();
    this.handlers = new Map();
    this.completionProvider = new CompletionProvider();
    this.config = options.config || new ConfigLoader();
    this.ai = options.ai || new AIProviderManager(this.config);
    this.aiReady = false;
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

    this.handlers.set('inline:complete', async (clientId, msg) => {
      try {
        const filePath = msg.path || msg.filePath;
        if (!filePath) {
          this._sendTo(clientId, { type: 'error', message: 'inline:complete requires path' });
          return;
        }

        const fullPath = path.isAbsolute(filePath) ? filePath : path.resolve(this.projectPath, filePath);
        const content = await fs.readFile(fullPath, 'utf8');
        const lines = content.split(/\r?\n/);
        const line = Number.isFinite(Number(msg.line)) ? Math.max(1, Number(msg.line)) : lines.length;
        const column = Number.isFinite(Number(msg.column)) ? Math.max(0, Number(msg.column)) : (lines[line - 1] || '').length;

        const result = await this.completionProvider.generate({
          filePath: fullPath,
          content,
          cursorLine: Math.min(line - 1, Math.max(0, lines.length - 1)),
          cursorColumn: column,
          language: detectLanguage(fullPath),
        });
        this._sendTo(clientId, { type: 'inline:complete:result', ...result });
      } catch (error) {
        this._sendTo(clientId, { type: 'error', message: `Inline completion failed: ${error.message}` });
      }
    });

    this.handlers.set('ai:action', async (clientId, msg) => {
      try {
        const action = String(msg.action || 'explain').toLowerCase();
        const code = String(msg.code || '');
        if (!code.trim()) {
          this._sendTo(clientId, { type: 'error', message: 'ai:action requires code' });
          return;
        }

        await this._ensureAi();
        const prompt = buildActionPrompt(action, code, msg.filePath || msg.path);
        const data = await this.ai.sendRequest([
          { role: 'system', content: 'You are Winter IDE assistant. Be concise, practical, and return code only when asked to fix, refactor, or generate tests.' },
          { role: 'user', content: prompt },
        ], { reason: `ide:${action}` });

        const response = extractTextFromResponse(data);
        const payload = {
          type: 'ai:action:result',
          action,
          response,
        };

        if (['fix', 'refactor', 'generate-tests'].includes(action)) {
          const editedContent = extractCodeBlock(response);
          if (editedContent) payload.editedContent = editedContent;
        }

        this._sendTo(clientId, payload);
      } catch (error) {
        this._sendTo(clientId, { type: 'error', message: `AI action failed: ${error.message}` });
      }
    });
  }

  async _ensureAi() {
    if (this.aiReady) return;
    await this.ai.init();
    this.aiReady = true;
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

function detectLanguage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    '.js': 'javascript',
    '.jsx': 'javascriptreact',
    '.ts': 'typescript',
    '.tsx': 'typescriptreact',
    '.py': 'python',
    '.go': 'go',
    '.rs': 'rust',
    '.java': 'java',
    '.cs': 'csharp',
    '.cpp': 'cpp',
    '.c': 'c',
    '.h': 'c',
    '.hpp': 'cpp',
    '.json': 'json',
    '.md': 'markdown',
  };
  return map[ext] || ext.replace(/^\./, '') || 'text';
}

function buildActionPrompt(action, code, filePath = '') {
  const location = filePath ? `File: ${filePath}\n\n` : '';
  const prompts = {
    explain: 'Explain what this code does and point out notable risks.',
    refactor: 'Refactor this code. Return the improved code in one fenced code block, followed by a brief note.',
    fix: 'Find and fix bugs in this code. Return the fixed code in one fenced code block, followed by a brief note.',
    review: 'Review this code for bugs, risks, and missing tests. Prioritize findings.',
    'generate-tests': 'Generate practical tests for this file. Return the test code in one fenced code block.',
  };
  return `${location}${prompts[action] || prompts.explain}\n\nCode:\n\`\`\`\n${code}\n\`\`\``;
}

function extractCodeBlock(text = '') {
  const match = String(text).match(/```(?:[\w-]+)?\r?\n([\s\S]*?)```/);
  return match ? match[1].trimEnd() : '';
}

export default IDEServer;
