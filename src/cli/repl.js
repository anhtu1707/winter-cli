/**
 * ❄️ WINTER REPL ❄️
 * Claude Code / Codex style interactive REPL
 */

import readline from 'readline';
import { promises as fs, watch as fsWatch } from 'fs';
import { homedir } from 'os';
import { welcomeBanner, colors } from './snowflake-logo.js';
import { renderBox, terminalWidth, stripAnsi, visibleWidth, wrapText, padVisible } from './terminal-ui.js';
import { ToolExecutor } from '../tools/executor.js';
import { SessionManager } from '../session/manager.js';
import { AIProviderManager } from '../ai/providers.js';
import { ConfigLoader } from './config.js';
import { PermissionManager } from '../tools/permission.js';
import { compressConversation } from '../context/compress.js';
import { getToolUsageSummary } from '../tools/analytics.js';
import { SweAgent } from '../agent/swe-agent.js';
import { SLASH_COMMANDS } from './slash-commands.js';
import { formatMarkdown } from './markdown-format.js';
import { Spinner } from './spinner.js';
import { ContextLoader } from './context-loader.js';
import { PromptBuilder } from './prompt-builder.js';
import { classifyModelTier, isSmallModel } from '../ai/model-capabilities.js';
import {
  addUsage as mergeUsage,
  buildToolCallSignature as buildToolCallSignatureText,
  buildToolFallbackAnswer as buildFallbackAnswer,
  compactText as compactPromptText,
  decodeXmlEntities as decodeXmlValue,
  extractFirstJsonObject as extractJsonObject,
  extractInlineToolCalls as extractInlineCalls,
  formatAnswerFooter as formatFooterText,
  formatToolCallsForMessage as formatToolCalls,
  formatToolResultForConsole as formatToolResult,
  formatUsage as formatUsageText,
  normalizeToolCalls as normalizeCalls,
  parseToolArguments as parseArguments,
  summarizePromptList as summarizePrompts,
} from './conversation-format.js';
import { handleSlashCommand } from './repl-commands.js';
import path from 'path';



export class WinterREPL {
  constructor(options = {}) {
    this.config = new ConfigLoader();
    this.session = new SessionManager(this.config);
    this.ai = new AIProviderManager(this.config);
    this.tools = new ToolExecutor(this);
    this.projectPath = options.projectPath || process.cwd();
    this.sessionId = options.sessionId || null; // Nhận sessionId từ bin
    this.version = options.version || '1.0.0'; // Nhận version từ bin
    this.running = true;
    this.history = [];
    this.maxHistory = 500;
    this.slashMenu = { open: false, line: '', items: [], selected: 0 };
    this.inputQueue = Promise.resolve();
    this.readlineClosed = false;
    this.taskQueue = [];
    this.isProcessing = false;
    this.isCancelled = false;
    this.sessionPermissionGrants = new Set();
    this.permissionManager = new PermissionManager(this.config, this.session);
    this.contextLoader = new ContextLoader({ projectPath: this.projectPath, session: this.session, tools: this.tools });
    this.promptBuilder = new PromptBuilder({
      session: this.session,
      ai: this.ai,
      tools: this.tools,
      projectPath: this.projectPath,
      sessionPermissionGrants: this.sessionPermissionGrants,
      compactText: (text, maxChars, label) => this.compactText(text, maxChars, label),
      summarizePrompts: (items, opts) => this.summarizePromptList(items, opts),
    });
    this.watchers = [];
  }

  getSessionToolPermissionStore() {
    const context = this.session?.getContext?.() || {};
    const value = context.toolPermissions?.value;
    return value && typeof value === 'object' ? value : { session: [] };
  }

  hydrateSessionToolPermissions() {
    const store = this.getSessionToolPermissionStore();
    this.sessionPermissionGrants = new Set(Array.isArray(store.session) ? store.session : []);
  }

  async rememberSessionToolPermission(toolName) {
    const store = this.getSessionToolPermissionStore();
    const sessionGrants = new Set(Array.isArray(store.session) ? store.session : []);
    sessionGrants.add(toolName);
    await this.session.updateContext('toolPermissions', {
      session: [...sessionGrants],
    });
    this.sessionPermissionGrants = sessionGrants;
  }

  async shouldPromptForToolPermission(toolName) {
    if (this.sessionPermissionGrants.has(toolName)) return false;
    return await this.permissionManager.shouldPromptForToolPermission(toolName);
  }

  buildSessionSignalsPrompt() {
    return this.promptBuilder.buildSessionSignalsPrompt();
  }

  getProjectInstructionFiles() {
    return this.contextLoader.getProjectInstructionFiles();
  }

  async readProjectInstructionFiles() {
    return this.contextLoader.readProjectInstructionFiles();
  }

  async start() {
    await this.session.init({ project: this.projectPath, sessionId: this.sessionId });
    await this.ai.init();

    await this.session.updateContext('projectAnchor', {
      path: this.projectPath,
      name: path.basename(this.projectPath),
      openedAt: new Date().toISOString(),
    });
    await this.session.replaceMemory('[Project Anchor]', `Current project is ${this.projectPath}. Treat this path as the canonical working directory for the session.`, 'info');

    // Tự động đọc và ghi nhớ một số tài nguyên cục bộ (an toàn): chỉ nạp file hoặc README trong thư mục
    const fsPromises = await import('fs/promises');
    const resourcePaths = this.getResourcePaths();
    const autoLoadTargets = [resourcePaths.agents, resourcePaths.designs, resourcePaths.karpathy];

    for (const targetPath of autoLoadTargets) {
      try {
        const stat = await fsPromises.stat(targetPath).catch(() => null);
        if (!stat) continue;

        if (stat.isFile()) {
          const content = await fsPromises.readFile(targetPath, 'utf8');
          const fileName = path.basename(targetPath);
          const memoryKey = `[Tự động ghi nhớ file ${fileName}]`;
          await this.session.replaceMemory(memoryKey, content);
          console.log(`${colors.dim}ℹ Đã tự động nạp và ghi nhớ file ${fileName}${colors.reset}`);
          continue;
        }

        if (stat.isDirectory()) {
          // Try README.md, index.md, or manifest.json inside the directory
          const candidates = ['README.md', 'README.MD', 'index.md', 'manifest.json'];
          let loaded = false;
          for (const c of candidates) {
            const p = path.join(targetPath, c);
            try {
              const cstat = await fsPromises.stat(p).catch(() => null);
              if (cstat && cstat.isFile()) {
                const content = await fsPromises.readFile(p, 'utf8');
                const memoryKey = `[Tự động ghi nhớ file ${path.basename(targetPath)}/${c}]`;
                await this.session.replaceMemory(memoryKey, content);
                console.log(`${colors.dim}ℹ Đã tự động nạp và ghi nhớ ${path.basename(targetPath)}/${c}${colors.reset}`);
                loaded = true;
                break;
              }
            } catch (e) {
              // continue
            }
          }

          if (!loaded) {
            // nothing to load
          }
        }
      } catch (e) {
        // Ignore read errors for resources
      }
    }

    // Nạp các file quy tắc dự án theo thứ tự ưu tiên.
    const projectInstructionFiles = await this.readProjectInstructionFiles();
    try {
      if (projectInstructionFiles.length > 0) {
        for (const file of projectInstructionFiles) {
          const memoryKey = `[Quy tắc dự án từ ${file.relativePath}]`;
          await this.session.replaceMemory(memoryKey, file.content);
          console.log(`${colors.dim}ℹ Đã nạp quy tắc dự án từ ${file.relativePath}${colors.reset}`);
        }
      }
    } catch (e) {
      // Nếu không có, tự động tạo file mẫu!
      const template = `# Winter Project Rules

## 📝 Project Overview
- **Name**: [Tên dự án]
- **Description**: [Mô tả ngắn về dự án]

## 🛠 Tech Stack
- **Languages**: JavaScript / TypeScript
- **Runtime**: Node.js
- **Frameworks**: [Tự điền nếu có, VD: Express, React...]

## 🎯 AI Behavior & Coding Guidelines

### 1. Nguyên Tắc Code (Coding Standards)
- Luôn ưu tiên viết code sạch (Clean Code), dễ đọc và dễ bảo trì.
- Sử dụng ES Modules (\`import/export\`) thay vì CommonJS (\`require\`) trừ khi có lý do đặc biệt.
- Giữ nguyên các comment và JSDoc hiện có trong file trừ khi được yêu cầu sửa.

### 2. Tương Tác Với Người Dùng (User Interaction)
- Luôn giải thích NGẮN GỌN lý do thực hiện thay đổi trước khi sửa file.
- Khi gặp lỗi, hãy đề xuất giải pháp thay vì chỉ báo lỗi.
- KHÔNG tự tiện xóa code cũ của user trừ khi chắc chắn nó không còn dùng hoặc được yêu cầu.

### 3. Git & Commits
- Viết commit message theo chuẩn Conventional Commits (VD: \`feat:\`, \`fix:\`, \`docs:\`).
- Luôn kiểm tra \`git status\` trước khi thực hiện thay đổi lớn.

### 4. Xử Lý File (File Operations)
- Chỉ sửa những dòng cần thiết, tránh viết lại toàn bộ file nếu không cần.
- Luôn đảm bảo file không bị lỗi cú pháp sau khi sửa.
`;
      try {
        const projectWinterMd = path.join(this.projectPath, 'winter.md');
        await fsPromises.writeFile(projectWinterMd, template, 'utf8');
        console.log(`\n${colors.green}✓ Đã tự động tạo file winter.md mẫu cho dự án mới!${colors.reset}`);
        console.log(`${colors.dim}Bạn có thể chỉnh sửa file này để dạy AI các quy tắc riêng của dự án.${colors.reset}\n`);
        
        // Nạp luôn vào memory
        await this.session.replaceMemory(`[Quy tắc dự án từ winter.md]`, template);
      } catch (err) {
        // Bỏ qua nếu không ghi được file
      }
    }

    // ── Tự động tạo design.md, skill.md, rule.md nếu chưa có ──────────────
    const autoCreateDocs = [
      {
        filename: 'design.md',
        generate: async () => {
          const designDir = this.getResourcePaths().designs;
          let brands = [];
          try {
            const entries = await fsPromises.readdir(designDir, { withFileTypes: true });
            brands = entries.filter(e => e.isDirectory()).map(e => e.name).sort();
          } catch {}
          return `# Design Resources

Danh sách các design system có sẵn trong local resources:

## Available Brands (${brands.length})

${brands.length > 0 ? brands.map(b => `- ${b}`).join('\n') : '- Không tìm thấy design system nào.'}

---
*File này được tự động tạo bởi Winter CLI.*`;
        },
      },
      {
        filename: 'skill.md',
        generate: async () => {
          const catalog = await this.contextLoader.getStartupSkillCatalog();
          const skills = [...catalog].sort();
          return `# Available Skills

Danh sách các skill có sẵn trong hệ thống:

## Core Skills
- **coding**: Code analysis, generation, review
- **design**: Design system integration
- **debug**: Debugging assistance
- **refactor**: Code refactoring
- **test**: Test generation
- **security**: Security review
- **performance**: Performance optimization

## All Available Skills (${skills.length})

${skills.map(s => `- ${s}`).join('\n')}

---
*File này được tự động tạo bởi Winter CLI.*`;
        },
      },
      {
        filename: 'rule.md',
        generate: async () => {
          const parts = ['# Project Rules', '', '## Quy tắc dự án', ''];
          // Load từ các instruction files đã có
          const files = await this.readProjectInstructionFiles();
          for (const file of files) {
            if (file.relativePath === 'rule.md') continue; // skip self
            parts.push(`- [${file.relativePath}](./${file.relativePath})`);
          }
          // Liệt kê các thư mục rules
          const rulesDirs = [
            this.getResourcePaths().codex.rules,
            this.getUserResourcePaths()?.codexRules,
          ].filter(Boolean);
          for (const dir of rulesDirs) {
            try {
              const entries = await fsPromises.readdir(dir, { withFileTypes: true });
              const ruleFiles = entries.filter(e => e.isFile() && e.name.endsWith('.md')).map(e => e.name);
              if (ruleFiles.length > 0) {
                parts.push('', `## Rules from ${path.basename(path.dirname(dir))}/${path.basename(dir)}`, '');
                for (const f of ruleFiles) {
                  parts.push(`- ${f}`);
                }
              }
            } catch {}
          }
          // Liệt kê local resource rules
          parts.push('', '## Local Resource Guidelines', '');
          parts.push('- Karpathy tools guidelines available in local resources');
          parts.push('- Agents.md project guidelines available in local resources');
          parts.push('', '---', '*File này được tự động tạo bởi Winter CLI.*');
          return parts.join('\n');
        },
      },
    ];

    for (const doc of autoCreateDocs) {
      const filePath = path.join(this.projectPath, doc.filename);
      try {
        await fsPromises.stat(filePath);
        // File đã tồn tại, bỏ qua
      } catch {
        // File chưa tồn tại, tự động tạo
        try {
          const content = await doc.generate();
          await fsPromises.writeFile(filePath, content, 'utf8');
          console.log(`${colors.green}✓ Đã tự động tạo file ${doc.filename} từ local resources!${colors.reset}`);
          const memoryKey = `[Quy tắc dự án từ ${doc.filename}]`;
          await this.session.replaceMemory(memoryKey, content);
        } catch (err) {
          // Bỏ qua nếu không tạo được
        }
      }
    }

    await this.bootstrapProjectCapabilities();

    const activeProvider = this.ai.getActiveProvider();
    const info = {
      project: this.projectPath,
      provider: activeProvider,
      model: this.ai.providers[activeProvider]?.model,
      session: this.session.getSessionId().substring(0, 8)
    };

    // Show banner only if not already shown
    if (!process.env.WINTER_BANNER_SHOWN) {
      console.log(welcomeBanner(this.version, info));
      this.showCommandMenu();
      process.env.WINTER_BANNER_SHOWN = '1';
    } else {
      this.showStatus();
    }

    // Hiển thị lịch sử chat nếu đang load lại session cũ
    const sessionHistory = this.session.getHistory(10); // Lấy tối đa 10 câu gần nhất cho đỡ rác màn hình
    if (sessionHistory.length > 0) {
      const columns = process.stdout.columns || 80;
      const W = Math.max(60, Math.min(Math.floor(columns * 0.95), 100));
      const titleStr = ' Lịch sử phiên làm việc ';
      const sideLine = '─'.repeat(Math.max(0, Math.floor((W - titleStr.length) / 2)));
      const bottomLine = '─'.repeat(W);

      console.log(`\n${colors.dim}${sideLine}${titleStr}${sideLine}${colors.reset}`);
      for (const msg of sessionHistory) {
        if (msg.role === 'user') {
          console.log(`\n${colors.cyan}Bạn:${colors.reset} ${msg.content}`);
        } else if (msg.role === 'assistant') {
          const formatted = formatMarkdown(msg.content);
          console.log(`\n${colors.bright}${colors.magenta}Winter:${colors.reset}${formatted}`);
        }
      }
      console.log(`\n${colors.dim}${bottomLine}${colors.reset}\n`);
    }

    // Setup readline
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: `${colors.bright}${colors.cyan}winter❄️:  ${colors.reset}`,
      completer: this.completer.bind(this),
    });
    this.installSlashSuggestions();

    // Bắt sự kiện Ctrl+C để in ra lệnh tiếp tục session
    this.rl.on('SIGINT', () => {
      console.log(`\n\n${colors.cyan}❄ Cảm ơn bạn đã sử dụng Winter!${colors.reset}`);
      console.log(`${colors.yellow}Để tiếp tục phiên làm việc này sau này, hãy chạy:${colors.reset}`);
      console.log(`${colors.bright}${colors.green}winter --session ${this.session.getSessionId()}${colors.reset}\n`);
      process.exit(0);
    });

    // Hiển thị prompt lần đầu tiên ngay khi khởi động xong
    this.showInputPrompt();

    this.rl.on('line', (line) => {
      this.inputQueue = this.inputQueue
        .then(async () => {
          this.closeInputBox();
          const input = line.trim();
          if (input) {
            await this.handleInput(input);
          } else {
            if (this.running && !this.readlineClosed) this.showInputPrompt();
          }
        })
        .catch((error) => {
          this.closeInputBox();
          console.log(`\n${colors.red}✖ Error: ${error.message}${colors.reset}\n`);
          if (this.running && !this.readlineClosed) this.showInputPrompt();
        });
    });

    this.rl.on('close', async () => {
      this.readlineClosed = true;
      await this.inputQueue.catch(() => { });
      console.log(`\n${colors.dim}Goodbye.${colors.reset}\n`);
      process.exit(0);
    });
  }

  showInputPrompt() {
    if (!this.running || this.readlineClosed) return;
    const w = Math.max(20, terminalWidth() - 2);
    process.stdout.write(`
${colors.magenta}╭${'─'.repeat(w)}╮${colors.reset}
`);
    process.stdout.write(`${colors.magenta}│${colors.reset} `);
    this.rl.setPrompt(`${colors.bright}${colors.cyan}winter❄️: ${colors.reset}`);
    this.rl.prompt();
  }

  closeInputBox() {
    const w = Math.max(20, terminalWidth() - 2);
    readline.moveCursor(process.stdout, 0, -1);
    readline.cursorTo(process.stdout, terminalWidth() - 1);
    process.stdout.write(`${colors.magenta}│${colors.reset}`);
    process.stdout.write(`
`);
    process.stdout.write(`${colors.magenta}╰${'─'.repeat(w)}╯${colors.reset}
`);
  }

  showStatus() {
    console.log(`${colors.dim}Project: ${this.projectPath}${colors.reset}`);
    console.log(`${colors.dim}Provider: ${this.ai.getActiveProvider()}${colors.reset}`);
    console.log(`${colors.dim}Session: ${this.session.getSessionId().substring(0, 8)}${colors.reset}`);
    console.log(`${colors.dim}Type ${colors.cyan}/help${colors.dim} for commands or ${colors.cyan}/${colors.dim} for menu${colors.reset}`);
    console.log('');
  }

  getResourcePaths() {
    return this.contextLoader.getResourcePaths();
  }

  getUserResourcePaths() {
    return this.contextLoader.getUserResourcePaths();
  }

  async showResourceManifest() {
    try {
      const raw = await fs.readFile(this.getResourcePaths().manifest, 'utf8');
      const manifest = JSON.parse(raw.replace(/^\uFEFF/, ''));
      console.log(`${colors.cyan}Local resources:${colors.reset} ${manifest.root || this.getResourcePaths().localRoot}`);
      for (const item of manifest.localResources || []) {
        const sizeMb = item.bytes ? `${(item.bytes / 1024 / 1024).toFixed(2)} MB` : 'n/a';
        console.log(`  ${item.name}: ${item.files} file(s), ${sizeMb}`);
      }
      if (manifest.excludedForSafety?.length) {
        console.log(`${colors.dim}Excluded: secrets, sessions, logs, runtime cache, and very large plugin/project caches.${colors.reset}`);
      }
      if (manifest.redacted?.length) {
        console.log(`${colors.dim}Redacted: ${manifest.redacted.join('; ')}${colors.reset}`);
      }
    } catch (error) {
      console.log(`${colors.red}Cannot read local resource manifest: ${error.message}${colors.reset}`);
    }
  }

  async showResourceGroup(group, section) {
    const paths = this.getResourcePaths()[group];
    if (!paths) return;

    const target = section && paths[section] ? paths[section] : paths.root;
    await this.printPathPreview(target, `${group}${section ? `/${section}` : ''}`);
  }

  async showKarpathyResources() {
    await this.printPathPreview(this.getResourcePaths().karpathy, 'karpathy-tools');
  }

  async showAgentsFile() {
    await this.printPathPreview(this.getResourcePaths().agents, 'agents.md');
  }

  async showDesignSystems(query = '') {
    const entries = await this.listPathEntries(this.getResourcePaths().designs, 200);
    const filtered = query
      ? entries.filter(entry => entry.name.toLowerCase().includes(query.toLowerCase()))
      : entries;

    console.log(`${colors.cyan}Design systems (${filtered.length}):${colors.reset}`);
    filtered.slice(0, 80).forEach(entry => console.log(`  ${entry.name}`));
  }

  async showAllLocalSkills() {
    const paths = this.getResourcePaths();
    const groups = [
      ['winter', path.join(homedir(), '.winter', 'skills')],
      ['codex', paths.codex.skills],
      ['claude', paths.claude.skills],
    ];

    for (const [name, target] of groups) {
      const entries = await this.listPathEntries(target, 80);
      console.log(`${colors.cyan}${name} skills (${entries.length}):${colors.reset}`);
      entries.slice(0, 40).forEach(entry => console.log(`  ${entry.name}`));
    }
  }

  async showModels() {
    const cfg = await this.config.load();
    console.log(`${colors.cyan}Configured models:${colors.reset}`);
    for (const [name, value] of Object.entries(cfg)) {
      if (value && typeof value === 'object' && value.model) {
        const active = name === cfg.defaultProvider ? '*' : ' ';
        console.log(` ${active} ${name}: ${value.model}`);
      }
    }

    try {
      const raw = await fs.readFile(this.getResourcePaths().codex.models, 'utf8');
      const unique = this.extractModelIdsFromCache(raw).slice(0, 30);
      if (unique.length) {
        console.log(`${colors.cyan}Codex cached models:${colors.reset}`);
        unique.forEach(model => console.log(`   ${model}`));
      }
    } catch { }
  }

  extractModelIdsFromCache(raw) {
    try {
      const data = JSON.parse(String(raw || '').replace(/^\uFEFF/, ''));
      const models = Array.isArray(data.models) ? data.models : [];
      return [...new Set(models
        .map(model => model.slug || model.id || model.name)
        .filter(value => typeof value === 'string' && value.trim())
      )];
    } catch {
      return [];
    }
  }

  async printPathPreview(target, label) {
    try {
      const stat = await fs.stat(target);
      console.log(`${colors.cyan}${label}:${colors.reset} ${target}`);
      if (stat.isDirectory()) {
        const entries = await this.listPathEntries(target, 80);
        entries.slice(0, 40).forEach(entry => {
          console.log(`  ${entry.isDirectory ? '[dir] ' : '[file]'} ${entry.name}`);
        });
        return;
      }

      const content = await fs.readFile(target, 'utf8');
      console.log(content.split(/\r?\n/).slice(0, 80).join('\n'));
    } catch (error) {
      console.log(`${colors.red}Cannot read ${label}: ${error.message}${colors.reset}`);
    }
  }

  async listPathEntries(target, limit = 100) {
    return this.contextLoader.listPathEntries(target, limit);
  }

  async handleInput(input) {
    if (this.isProcessing) {
      const pos = this.taskQueue.length + 1;
      console.log(`${colors.magenta}◎${colors.reset} ${colors.dim}Đã xếp hàng chờ (vị trí #${pos})${colors.reset}`);
      this.taskQueue.push(input);
      return;
    }
    await this.processInputTask(input);
  }

  async processInputTask(input) {
    this.isProcessing = true;
    this.isCancelled = false;
    try {
      this.history.push(input);
      if (this.history.length > this.maxHistory) {
        this.history = this.history.slice(-this.maxHistory);
      }

      if (input.startsWith('/')) {
        await this.handleSlashCommand(input);
        return;
      }

      const imageMatch = input.match(/(\S+\.(?:png|jpg|jpeg|gif|webp|bmp|svg))/i);
      let handled = false;
      if (imageMatch) {
        const imgPath = path.resolve(this.projectPath, imageMatch[1]);
        try {
          const img = await this.loadImageAsBase64(imgPath);
          if (img) {
            await this.chat(input, [img]);
            handled = true;
          }
        } catch { }
      }

      if (!handled) {
        await this.chat(input);
      }
    } catch (error) {
      if (error.message === 'AbortError') {
        console.log(colors.red + '\nĐã hủy công việc hiện tại.' + colors.reset);
      } else {
        console.log(colors.red + '\nLỗi: ' + error.message + colors.reset);
      }
    } finally {
      this.isProcessing = false;
      this.isCancelled = false;
      if (this.spinner) this.spinner.stop();

      if (this.taskQueue.length > 0) {
        const nextTask = this.taskQueue.shift();
        setTimeout(() => this.processInputTask(nextTask), 0);
      } else {
        if (!this.readlineClosed) this.showInputPrompt();
      }
    }
  }

  async loadImageAsBase64(filePath) {
    try {
      const fs = await import('fs/promises');
      const ext = path.extname(filePath).toLowerCase().substring(1);
      const mime = {
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        gif: 'image/gif',
        webp: 'image/webp',
        svg: 'image/svg+xml'
      }[ext] || 'image/jpeg';

      const buffer = await fs.readFile(filePath);
      return { mime, base64: buffer.toString('base64') };
    } catch {
      return null;
    }
  }

  async showInteractiveChecklist(title, items) {
    if (!items || items.length === 0) return [];

    return new Promise((resolve) => {
      let cursor = 0;
      const selected = new Set(items.map((_, i) => i)); // default select all

      let printedLines = 0;
      const render = () => {
        // Xóa những dòng đã in trước đó
        if (printedLines > 0) {
          process.stdout.write('\x1b[' + printedLines + 'A\x1b[J');
        }

        let out = `\n[36m${title}[0m\n`;
        out += `[2mDùng mũi tên (↑/↓) để di chuyển, [Space] để chọn/bỏ chọn, [Enter] để xác nhận[0m\n\n`;

        for (let i = 0; i < items.length; i++) {
          const isHover = i === cursor;
          const isSelected = selected.has(i);
          const prefix = isHover ? `[36m>[0m` : ' ';
          const box = isSelected ? `[32m[x][0m` : '[ ]';
          out += `  ${prefix} ${box} ${items[i]}\n`;
        }
        process.stdout.write(out);
        printedLines = items.length + 4; // count lines outputted
      };

      const onKeyPress = (str, key) => {
        if (key.name === 'up' && cursor > 0) cursor--;
        else if (key.name === 'down' && cursor < items.length - 1) cursor++;
        else if (key.name === 'space') {
          if (selected.has(cursor)) selected.delete(cursor);
          else selected.add(cursor);
        } else if (key.name === 'return') {
          cleanup();
          const result = items.filter((_, i) => selected.has(i));
          resolve(result);
          return;
        } else if (key.ctrl && key.name === 'c') {
          cleanup();
          resolve([]);
          return;
        }
        render();
      };

      const cleanup = () => {
        process.stdin.removeListener('keypress', onKeyPress);
        if (process.stdin.isTTY) process.stdin.setRawMode(false);
        this.rl.resume();
        process.stdout.write('\n');
      };

      this.rl.pause();
      if (process.stdin.isTTY) process.stdin.setRawMode(true);

      readline.emitKeypressEvents(process.stdin);
      process.stdin.on('keypress', onKeyPress);

      render();
    });
  }

  async generateInteractivePlan(task) {
    this.spinner = new Spinner('Đang phân tích và chia nhỏ yêu cầu...');
    this.spinner.start();

    const messages = [
      { role: 'system', content: 'Bạn là chuyên gia lập kế hoạch. Hãy chia nhỏ yêu cầu của người dùng thành các bước cụ thể, hành động được, rất ngắn gọn (dưới 15 chữ mỗi bước). CHỈ TRẢ VỀ MỘT MẢNG JSON CÁC CHUỖI, KHÔNG GIẢI THÍCH GÌ THÊM. Ví dụ: ["Tạo file index.html", "Thêm CSS styling", "Viết script.js"]' },
      { role: 'user', content: task }
    ];

    try {
      const response = await this.ai.sendRequest(messages, {
        model: this.ai.providers[this.ai.getActiveProvider()]?.model
      });
      if (this.spinner) this.spinner.stop();

      const text = response.choices?.[0]?.message?.content || '[]';
      let items = [];
      try {
        const jsonMatch = text.match(/\[([\s\S]*?)\]/);
        if (jsonMatch) {
          items = JSON.parse(jsonMatch[0]);
        }
      } catch (e) {
        // Fallback fallback fallback
        items = text.split('\n').filter(l => l.trim().length > 0).map(l => l.replace(/^- \[.*?\]|- |\d+\./, '').trim());
      }

      if (!Array.isArray(items) || items.length === 0) {
        console.log(`\x1b[33mKhông thể parse kế hoạch. AI phản hồi: ${text}\x1b[0m`);
        return;
      }

      const selectedSteps = await this.showInteractiveChecklist('KẾ HOẠCH THỰC HIỆN:', items);

      if (selectedSteps.length > 0) {
        for (const step of selectedSteps) {
          await this.session.createPlan(step, task);
        }
        console.log(`\x1b[32m✓ Đã thêm ${selectedSteps.length} công việc vào Memory (gõ /plans để xem).\x1b[0m`);

        this.rl.question(`\n\x1b[36mBạn có muốn AI bắt tay làm công việc ĐẦU TIÊN ngay bây giờ không? [y/N]: \x1b[0m`, async (answer) => {
          if (answer.toLowerCase() === 'y') {
            await this.chat(`Hãy bắt đầu thực hiện bước đầu tiên: ${selectedSteps[0]}`);
          }
        });
      } else {
        console.log(`\n\x1b[2mĐã huỷ kế hoạch.\x1b[0m`);
      }
    } catch (e) {
      if (this.spinner) this.spinner.stop();
      console.log(`\x1b[31mLỗi: ${e.message}\x1b[0m`);
    }
  }


  async runAutoHealing(task) {
    console.log(`\n\x1b[35m[ TDD AUTO-HEALING MODE ]\x1b[0m Kích hoạt vòng lặp chữa lành lỗi tự động.`);

    // Tăng giới hạn loop lên 15 để cho phép AI tự sửa lỗi nhiều lần
    const originalRequestAssistantTurn = this.requestAssistantTurn;

    // Chèn prompt đặc biệt ép AI phải verify
    const autoPrompt = `TASK: ${task}
    
    CRITICAL TDD RULES:
    1. Write code to solve the task.
    2. IMMEDIATELY use the Bash tool to run the code (e.g., 'node file.js', 'npm run build', or 'tsc').
    3. If the Bash tool returns ANY errors, read the error, Edit the code to fix it, and RUN IT AGAIN.
    4. DO NOT STOP AND DO NOT ASK FOR PERMISSION. KEEP FIXING AND RUNNING UNTIL THERE ARE NO ERRORS.
    5. Only return your final answer when the bash execution shows SUCCESS.`;

    await this.chat(autoPrompt);
  }

  async runAutoCommit(context = '') {
    console.log(`\n${colors.cyan}❄ Tạo commit message tự động...${colors.reset}`);
    const diffResult = await this.tools.execute('Bash', { command: 'git diff --cached' }, { cwd: this.projectPath });

    let diff = diffResult.stdout;
    let isStaged = true;
    if (!diff || diff.trim() === '') {
      const allDiff = await this.tools.execute('Bash', { command: 'git diff' }, { cwd: this.projectPath });
      diff = allDiff.stdout;
      isStaged = false;
    }

    if (!diff || diff.trim() === '') {
      console.log(`${colors.yellow}⚠ Không có thay đổi nào để commit.${colors.reset}`);
      if (this.running && !this.readlineClosed) this.rl.prompt();
      return;
    }

    const prompt = `Bạn là chuyên gia Git. Hãy viết MỘT commit message duy nhất (không giải thích thêm) cho những thay đổi sau đây. Dùng format chuẩn Conventional Commits (feat/fix/chore/refactor: ...). ${context ? `\nNgữ cảnh: ${context}` : ''}\n\nDiff:\n${diff.slice(0, 6000)}`;

    this.spinner = new Spinner('Đang sinh commit message...');
    this.spinner.start();
    try {
      const response = await this.ai.sendRequest([{ role: 'user', content: prompt }], {
        model: this.ai.providers[this.ai.getActiveProvider()]?.model
      });
      if (this.spinner) this.spinner.stop();

      const message = response.choices?.[0]?.message?.content?.trim().replace(/^["']|["']$/g, '') || 'Cập nhật mã nguồn';

      console.log(`\n${colors.green}Đề xuất commit message:${colors.reset}`);
      console.log(`${colors.bright}${message}${colors.reset}\n`);

      this.rl.question(`${colors.yellow}Bạn có muốn commit với message này không? [y/N/e (tự sửa)]: ${colors.reset}`, async (ans) => {
        const choice = ans.trim().toLowerCase();
        if (choice === 'y') {
          if (!isStaged) await this.tools.execute('Bash', { command: 'git add .' }, { cwd: this.projectPath });
          const res = await this.tools.execute('Bash', { command: `git commit -m "${message.replace(/"/g, '\\"')}"` }, { cwd: this.projectPath });
          console.log(res.stdout);
        } else if (choice === 'e') {
          this.rl.question(`${colors.cyan}Nhập commit message: ${colors.reset}`, async (customMsg) => {
            if (customMsg.trim()) {
              if (!isStaged) await this.tools.execute('Bash', { command: 'git add .' }, { cwd: this.projectPath });
              const res = await this.tools.execute('Bash', { command: `git commit -m "${customMsg.replace(/"/g, '\\"')}"` }, { cwd: this.projectPath });
              console.log(res.stdout);
            }
            if (this.running && !this.readlineClosed) this.rl.prompt();
          });
          return;
        } else {
          console.log(`${colors.dim}Đã huỷ commit.${colors.reset}`);
        }
        if (this.running && !this.readlineClosed) this.rl.prompt();
      });
    } catch (e) {
      if (this.spinner) this.spinner.stop();
      console.log(`${colors.red}Lỗi: ${e.message}${colors.reset}`);
      if (this.running && !this.readlineClosed) this.rl.prompt();
    }
  }

  async runCodeReview(context = '') {
    console.log(`\n${colors.cyan}❄ AI đang soi code của bạn...${colors.reset}`);
    const diffResult = await this.tools.execute('Bash', { command: 'git diff HEAD' }, { cwd: this.projectPath });
    const diff = diffResult.stdout;

    if (!diff || diff.trim() === '') {
      console.log(`${colors.yellow}⚠ Không có thay đổi nào để review.${colors.reset}`);
      return;
    }

    const prompt = `Hãy đóng vai một Senior Developer khó tính. Review nhanh các thay đổi sau đây. Chỉ ra bug (nếu có), vấn đề bảo mật, hoặc những chỗ cần clean code. Không cần khen ngợi, hãy nói thẳng vào vấn đề. Trình bày dạng Markdown đẹp mắt. \n\n${context ? `Ngữ cảnh: ${context}\n` : ''}Diff:\n${diff.slice(0, 8000)}`;

    await this.chat(prompt);
  }

  async handleSlashCommand(input) {
    return handleSlashCommand(this, input);
  }

  showCommandMenu() {
    const c = colors;
    const width = terminalWidth(72, 112, 92);
    const innerWidth = width - 4;
    const split = Math.floor(innerWidth * 0.54);
    const rightWidth = innerWidth - split - 1;
    const row = (left, right = '') => {
      if (!right) return left;
      return `${padVisible(left, split)} ${padVisible(right, rightWidth)}`;
    };

    const body = [
      `${c.bright}${c.cyan}❄ WINTER COMMANDS${c.reset}`,
      '',
      `${c.bright}Dự án & Phiên làm việc${c.reset}`,
      row(`${c.yellow}/pwd${c.reset}     Thư mục hiện tại`, `${c.yellow}/session${c.reset}  Phiên làm việc`),
      row(`${c.yellow}/cd${c.reset}      Đổi thư mục`, `${c.yellow}/clear${c.reset}    Xóa màn hình`),
      row(`${c.yellow}/config${c.reset}  Xem cấu hình`, `${c.yellow}/exit${c.reset}     Thoát`),
      '',
      `${c.bright}AI & Công cụ${c.reset}`,
      row(`${c.yellow}/auto${c.reset}    TDD tự sửa lỗi`, `${c.yellow}/agent${c.reset}   Chạy sub-agent`),
      row(`${c.yellow}/read${c.reset}    Đọc file`, `${c.yellow}/write${c.reset}   Ghi file`),
      row(`${c.yellow}/bash${c.reset}    Chạy lệnh terminal`, `${c.yellow}/grep${c.reset}    Tìm trong file`),
      row(`${c.yellow}/glob${c.reset}    Tìm file theo pattern`, `${c.yellow}/image${c.reset}   Phân tích UI`),
      row(`${c.yellow}/paste${c.reset}   Dán từ clipboard`, `${c.yellow}/plan${c.reset}    Lập kế hoạch`),
      '',
      `${c.bright}Git Auto-Pilot${c.reset}`,
      row(`${c.yellow}/commit${c.reset}  AI tự viết commit`, `${c.yellow}/review${c.reset}  AI review code thay đổi`),
      '',
      `${c.bright}Cấu hình Model${c.reset}`,
      row(`${c.yellow}/provider${c.reset} Đổi provider AI`, `${c.yellow}/model${c.reset}    Đổi model`),
      row(`${c.yellow}/providers${c.reset} Danh sách provider`, `${c.yellow}/models${c.reset}   Danh sách model`),
      row(`${c.yellow}/mcp${c.reset}      MCP server mgmt`, `${c.yellow}/permissions${c.reset} Quyền/allowlist`),
      '',
      `${c.bright}Bộ nhớ & Kỹ năng${c.reset}`,
      row(`${c.yellow}/remember${c.reset} Lưu vào bộ nhớ`, `${c.yellow}/memories${c.reset} Xem bộ nhớ`),
      row(`${c.yellow}/skills${c.reset}  Danh sách kỹ năng`, `${c.yellow}/designs${c.reset}  Hệ thống thiết kế`),
    ];

    console.log(`
${renderBox({
      title: `${c.bright}${c.cyan}WINTER COMMANDS${c.reset}`,
      width,
      borderColor: c.magenta,
      titleColor: c.cyan,
      body,
    })}
${c.dim}Gõ tin nhắn trực tiếp để chat · ESC để hủy · Prompt tự xếp hàng chờ${c.reset}
`);
  }

  showHelp() {
    console.log(`
${colors.cyan}❄ WINTER COMMANDS${colors.reset}
${colors.dim}${''.padEnd(50, '─')}${colors.reset}

${colors.white}Project:${colors.reset}
  /project, /pwd    Show current project
  /cd <path>        Change directory

${colors.white}Session:${colors.reset}
  /session          Current session info
  /sessions         List all sessions
  /clear            Clear screen

${colors.white}Memory:${colors.reset}
  /remember <text>  Store in memory
  /memories         Show memories
  /forget           Clear memories

${colors.white}Plans & Tasks:${colors.reset}
  /plan, /plans     View plans
  /task <desc>      Create task
  /tasks            List tasks
  /agent [role] <task>  Run a subagent

${colors.white}Tools:${colors.reset}
  /read <file>      Read file
  /write <file>     Write file
  /glob <pattern>   Find files
  /grep <pattern>  Search content
  /bash <cmd>       Run command

${colors.white}AI & Config:${colors.reset}
  /provider [name]  Show/switch provider and save default
  /providers        List providers
  /models           List configured/cached models
  /mcp              MCP server management
  /permissions      Permission allowlist
  /config          Show config
  /model [model]    Show/set active provider model

${colors.white}Design & Skills:${colors.reset}
  /design          Design commands
  /designs [query]  List/search awesome-design-md systems
  /skill           Skills management
  /skills          List Winter/Codex/Claude skills
  /plugin          Plugin management

${colors.white}Local Sources:${colors.reset}
  /codex [section]  Browse ~/.codex resources
  /claude [section] Browse ~/.claude resources
  /karpathy        Browse ~/karpathy-tools
  /agents          Read ~/agents.md

${colors.white}Other:${colors.reset}
  /help, /?        Show this help
  /exit, /quit     Exit Winter

${colors.dim}${''.padEnd(50, '─')}${colors.reset}
Just type your message to chat with Winter!
${colors.reset}
`);
  }

  async showDesignSystems(query) {
    try {
      const designPath = this.getResourcePaths().designs;
      const entries = await this.listPathEntries(designPath, 100);
      const filtered = query
        ? entries.filter(e => e.name.toLowerCase().includes(query.toLowerCase()))
        : entries;
      if (filtered.length === 0) {
        console.log(`${colors.dim}No design systems found${query ? ` matching "${query}"` : ''}.${colors.reset}`);
        return;
      }
      console.log(`${colors.cyan}Design Systems:${colors.reset}`);
      filtered.forEach(e => {
        const icon = e.isDirectory ? '📁' : '📄';
        console.log(`  ${icon} ${e.name}`);
      });
    } catch (error) {
      console.log(`${colors.red}Cannot read design systems: ${error.message}${colors.reset}`);
    }
  }

  async showAllLocalSkills() {
    try {
      const paths = this.getResourcePaths();
      const sections = [
        { label: 'Codex Skills', path: paths.codex.skills },
        { label: 'Claude Skills', path: paths.claude.skills },
      ];
      for (const section of sections) {
        try {
          const entries = await this.listPathEntries(section.path, 50);
          if (entries.length > 0) {
            console.log(`${colors.cyan}${section.label}:${colors.reset}`);
            entries.forEach(e => console.log(`  ${e.isDirectory ? '📂' : '📄'} ${e.name}`));
          }
        } catch { }
      }
    } catch (error) {
      console.log(`${colors.dim}No local skills found.${colors.reset}`);
    }
  }

  async showModels() {
    try {
      const providers = this.ai.listProviders();
      console.log(`${colors.cyan}Configured Models:${colors.reset}`);
      providers.forEach(p => {
        const active = p.name === this.ai.getActiveProvider() ? ` ${colors.green}◀ active${colors.reset}` : '';
        const status = p.ready ? `${colors.green}●${colors.reset}` : `${colors.red}○${colors.reset}`;
        console.log(`  ${status} ${colors.bright}${p.name}${colors.reset}: ${p.model}${active}`);
      });

      // Try to read cached models
      const cachePath = this.getResourcePaths().codex.models;
      const cached = await this.readCachedModels(cachePath);
      if (cached.length > 0) {
        console.log(`\n${colors.cyan}Cached Models (${cached.length}):${colors.reset}`);
        cached.slice(0, 20).forEach(m => console.log(`  ${colors.dim}•${colors.reset} ${m}`));
        if (cached.length > 20) console.log(`  ${colors.dim}... and ${cached.length - 20} more${colors.reset}`);
      }
    } catch (error) {
      console.log(`${colors.red}Error listing models: ${error.message}${colors.reset}`);
    }
  }

  async readCachedModels(cachePath) {
    try {
      const raw = await fs.readFile(cachePath, 'utf8');
      return this.extractModelIdsFromCache(raw);
    } catch {
      return [];
    }
  }

  getAgentTools(role) {
    const base = this.tools.getToolDefinitions();
    const byName = (names) => base.filter(tool => names.includes(tool.name));

    switch (role) {
      case 'plan':
        return byName(['Read', 'Grep', 'Glob', 'TaskCreate', 'TaskUpdate', 'TaskList']);
      case 'review':
        return byName(['Read', 'Grep', 'Glob']);
      case 'debug':
        return byName(['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob']);
      case 'research':
        return byName(['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch']);
      default:
        return byName(['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep']);
    }
  }

  getActiveModelTier() {
    const providerName = this.ai?.getActiveProvider?.();
    const model = this.ai?.providers?.[providerName]?.model || '';
    return classifyModelTier(model, providerName);
  }

  shouldUseCompactPrompt() {
    return isSmallModel(this.getActiveModelTier());
  }

  selectExecutionProfile(messages = [], options = {}) {
    if (typeof this.ai?.selectExecutionProfile === 'function') {
      const profile = this.ai.selectExecutionProfile(messages, options);
      if (profile?.provider || profile?.model) return profile;
    }

    const text = Array.isArray(messages)
      ? messages.map(message => {
        if (!message) return '';
        if (typeof message.content === 'string') return message.content;
        if (Array.isArray(message.content)) {
          return message.content.map(part => part?.text || part?.image_url?.url || '').join('\n');
        }
        return '';
      }).join('\n').toLowerCase()
      : String(messages || '').toLowerCase();

    const providers = this.ai?.providers || {};
    const activeProvider = this.ai?.getActiveProvider?.() || Object.keys(providers)[0] || null;
    const hasProvider = name => !!providers[name]?.model || !!providers[name]?.ready;

    let provider = activeProvider;
    if (/\b(review|refactor|debug|fix|bug|error|stack trace|test|tool|patch|code)\b/.test(text) && hasProvider('claude')) {
      provider = 'claude';
    } else if (/\b(summary|summarize|commit message|changelog|docs|explain|rewrite)\b/.test(text) && hasProvider('openai')) {
      provider = 'openai';
    } else if (/\b(local|offline|privacy|private|on-device)\b/.test(text) && hasProvider('ollama')) {
      provider = 'ollama';
    } else if (/\b(quick|brief|short|fast)\b/.test(text) && hasProvider('groq')) {
      provider = 'groq';
    }

    return {
      provider,
      model: options.model || providers[provider]?.model || providers[activeProvider]?.model || null,
    };
  }


  async runConversation(messages, label = 'Thinking', tools = null) {
    this.spinner = new Spinner(label + '...');
    this.spinner.start();
    this.hydrateSessionToolPermissions();

    const startedAt = Date.now();
    const previousTools = this.ai.tools;
    if (tools) this.ai.setTools(tools);

    let finalContent = '';
    let reachedToolLimit = true;
    let usedTools = false;
    let verified = false;
    const toolSummaries = [];
    const totalUsage = {};
    const toolSignatureHistory = [];
    const executionProfile = this.selectExecutionProfile(messages, { enableTools: true });
    try {
      for (let i = 0; i < 8; i++) {
        if (this.isCancelled) throw new Error('AbortError');
        const turn = await this.requestAssistantTurn(messages, {
          provider: executionProfile.provider,
          model: executionProfile.model,
          enableTools: true,
        }, startedAt, totalUsage);

        const assistantMsg = turn.assistantMsg || {};
        const toolCalls = turn.toolCalls || [];

        if (turn.finalContent && toolCalls.length === 0) {
          finalContent = turn.finalContent;
        }

        if (toolCalls.length === 0) {
          if (turn.finishReason === 'length') {
            console.log(`\n${colors.yellow}ℹ Phản hồi bị cắt cụt do hết token. Đang tự động tiếp tục...${colors.reset}`);
            messages.push({
              role: 'assistant',
              content: turn.finalContent || '',
            });
            messages.push({
              role: 'user',
              content: 'Continue generating the rest of the response.',
            });
            continue;
          }
          reachedToolLimit = false;
          break;
        }

        usedTools = true;
        if (this.spinner) this.spinner.stop();

        const currentToolSignature = this.buildToolCallSignature(toolCalls);
        if (currentToolSignature) {
          toolSignatureHistory.push(currentToolSignature);
          if (toolSignatureHistory.length > 3) {
            toolSignatureHistory.shift();
          }
          // Only break if 3+ consecutive identical signatures — 2 repeats is normal iteration
          if (toolSignatureHistory.length === 3 &&
              toolSignatureHistory[0] === currentToolSignature &&
              toolSignatureHistory[1] === currentToolSignature) {
            console.log(`
${colors.yellow}ℹ AI tool loop detected (3 consecutive identical tool calls). Breaking out.${colors.reset}`);
            reachedToolLimit = false;
            break;
          }
        }

        const BOX_WIDTH = terminalWidth(76, 116, 92);
        messages.push({
          role: 'assistant',
          content: assistantMsg.content || '',
          tool_calls: this.formatToolCallsForMessage(toolCalls),
        });

        for (const tc of toolCalls) {
          const { toolName, toolArgs } = tc;
          const canonicalToolName = this.tools.normalizeToolName(toolName);
          const argParseError = toolArgs?.__toolArgParseError;
          const recoveredArgs = argParseError ? this.recoverToolArgs(canonicalToolName, toolArgs.__rawToolArgs) : null;
          const canUseRecoveredArgs = recoveredArgs && Object.keys(recoveredArgs).length > 0;
          const normalizedArgs = argParseError && !canUseRecoveredArgs
            ? {}
            : this.tools.normalizeToolInput?.(canonicalToolName, canUseRecoveredArgs ? recoveredArgs : toolArgs) ?? toolArgs;
          const enrichedArgs = argParseError && !canUseRecoveredArgs ? {} : this.enrichToolArgs(canonicalToolName, normalizedArgs, messages);

          const icon = canonicalToolName === 'Bash' ? '⚙' : canonicalToolName === 'Read' ? '📖' : canonicalToolName === 'Write' ? '✏️' : canonicalToolName === 'Edit' ? '🔧' : canonicalToolName === 'Grep' ? '🔍' : canonicalToolName === 'Glob' ? '📂' : '⚡';

          let proceed = true;
          if (await this.shouldPromptForToolPermission(canonicalToolName) && (!argParseError || canUseRecoveredArgs)) {
            const cmd = enrichedArgs.command || enrichedArgs.cmd || 'unknown';
            if (this.sessionPermissionGrants.has(canonicalToolName)) {
              proceed = true;
            } else {
              proceed = await this.promptToolPermission(cmd);
              if (proceed === 'session') {
                await this.rememberSessionToolPermission(canonicalToolName);
                proceed = true;
              }

              if (proceed === true) {
                await this.permissionManager.allowTool(canonicalToolName);
              }

              if (!proceed) {
                console.log(`${colors.magenta}│${colors.reset}   ${colors.dim}Đã hủy lệnh.${colors.reset}`);
              }
            }
          }

          let result;
          if (argParseError && !canUseRecoveredArgs) {
            result = {
              success: false,
              error: `Invalid ${canonicalToolName} tool arguments JSON: ${toolArgs.__toolArgParseError}`,
              rawArgs: toolArgs.__rawToolArgs,
              recovery: 'Use valid JSON object arguments, for example {"file_path":"README.md"} for Read or {"command":"npm test"} for Bash.',
            };
          } else if (!proceed) {
            result = { success: false, error: 'User denied permission to execute this command.' };
          } else {
            result = toolName
              ? await this.tools.execute(canonicalToolName, enrichedArgs, { cwd: this.projectPath })
              : { success: false, error: 'Tool call is missing a tool name' };
          }
          messages.push({
            role: 'tool',
            tool_call_id: tc.id || `tool-${Date.now()}`,
            content: JSON.stringify(result),
          });

          const summary = this.formatToolResultForConsole(canonicalToolName, result);
          if (summary) {
            toolSummaries.push(`${canonicalToolName}: ${summary}`);
            const statusIcon = result.success === false ? `${colors.red}✖${colors.reset}` : `${colors.green}✓${colors.reset}`;
            const toolLine = `${icon} ${colors.cyan}${colors.bright}${toolName}${colors.reset}`;
            const summaryLines = summary.split('\n').flatMap(line => wrapText(line, BOX_WIDTH - 8));
            console.log(renderBox({
              title: 'AGENT TOOLS EXECUTION',
              width: BOX_WIDTH,
              borderColor: colors.magenta,
              titleColor: colors.bright,
              body: [
                toolLine,
                ...summaryLines.map((line, index) => index === 0 ? `${statusIcon} ${colors.dim}${line}${colors.reset}` : `${colors.dim}${line}${colors.reset}`),
              ],
            }));
          }
        }
        console.log('');
      }

      if (usedTools && !finalContent) {
        finalContent = await this.requestFinalAnswer(messages, toolSummaries, startedAt, totalUsage);
      }
    } finally {
      if (tools) this.ai.setTools(previousTools);
      if (this.spinner) this.spinner.stop();
    }

    if ((reachedToolLimit || usedTools) && !finalContent) {
      if (this.spinner) this.spinner.stop();
      finalContent = this.buildToolFallbackAnswer(toolSummaries);
      console.log(`\n${colors.yellow}${finalContent}${colors.reset}\n`);
    }

    return { finalContent, usedTools };
  }

  async requestAssistantTurn(messages, options, startedAt, totalUsage) {
    if (typeof this.ai.streamRequest === 'function') {
      try {
        const streamed = await this.collectAssistantStream(messages, options, startedAt, totalUsage);
        if (streamed) return streamed;
      } catch (error) {
        console.log(`${colors.dim}Streaming failed, retrying normal response: ${error.message}${colors.reset}`);
      }
    }

    const response = await this.ai.sendRequest(messages, options);
    this.addUsage(totalUsage, response.usage);
    const assistantMsg = response.choices?.[0]?.message || {};
    const toolCalls = this.normalizeToolCalls(assistantMsg.tool_calls || []);
    const finishReason = response.choices?.[0]?.finish_reason;

    if (assistantMsg.content && toolCalls.length === 0) {
      this.printAssistantAnswer(assistantMsg.content, startedAt, totalUsage);
      return { assistantMsg, toolCalls, finalContent: assistantMsg.content, finishReason };
    }

    return { assistantMsg, toolCalls, finalContent: '', finishReason };
  }

  async collectAssistantStream(messages, options, startedAt, totalUsage) {
    let content = '';
    const toolCallParts = [];
    let finishReason = null;
    let printed = false;
    const bufferToolModeContent = options?.enableTools === true;

    for await (const chunk of this.ai.streamRequest(messages, options)) {
      if (chunk.usage) this.addUsage(totalUsage, chunk.usage);

      const choice = chunk.raw?.choices?.[0] || {};
      if (choice.finish_reason) {
        finishReason = choice.finish_reason;
      }
      for (const deltaToolCall of choice.delta?.tool_calls || []) {
        const index = deltaToolCall.index ?? toolCallParts.length;
        toolCallParts[index] = toolCallParts[index] || {
          id: '',
          type: 'function',
          function: { name: '', arguments: '' },
        };
        if (deltaToolCall.id) toolCallParts[index].id = deltaToolCall.id;
        if (deltaToolCall.type) toolCallParts[index].type = deltaToolCall.type;
        if (deltaToolCall.function?.name) {
          toolCallParts[index].function.name += deltaToolCall.function.name;
        }
        if (deltaToolCall.function?.arguments) {
          toolCallParts[index].function.arguments += deltaToolCall.function.arguments;
        }
      }

      if (chunk.content) {
        if (!printed) {
          if (this.spinner) this.spinner.stop();
          if (!bufferToolModeContent) {
            process.stdout.write(`\n${colors.white}`);
            printed = true;
          }
        }
        content += chunk.content;
        if (!bufferToolModeContent) {
          process.stdout.write(chunk.content);
        }
      }
    }

    if (this.spinner) this.spinner.stop();
    if (printed) process.stdout.write(colors.reset);

    const inlineToolExtraction = this.extractInlineToolCalls(content);
    const rawToolCalls = [
      ...toolCallParts.filter(Boolean).map((toolCall, index) => ({
        ...toolCall,
        id: toolCall.id || `call-${index}`,
      })),
      ...inlineToolExtraction.toolCalls,
    ];
    const toolCalls = this.normalizeToolCalls(rawToolCalls);
    const visibleContent = inlineToolExtraction.content || content;

    if (bufferToolModeContent && toolCalls.length === 0 && visibleContent) {
      this.printAssistantAnswer(visibleContent, startedAt, totalUsage);
      return {
        assistantMsg: { content: visibleContent },
        toolCalls,
        finalContent: visibleContent,
        finishReason,
      };
    }

    if (toolCalls.length === 0 && visibleContent) {
      console.log(`\n${colors.dim}${this.formatAnswerFooter(startedAt, totalUsage)}${colors.reset}\n`);
      return {
        assistantMsg: { content: visibleContent },
        toolCalls,
        finalContent: visibleContent,
        finishReason,
      };
    } else if (printed && visibleContent) {
      process.stdout.write('\n');
    }

    return {
      assistantMsg: {
        content: visibleContent,
        tool_calls: this.formatToolCallsForMessage(toolCalls),
      },
      toolCalls,
      finalContent: '',
    };
  }

  async simulateTyping(text, color = colors.white) {
    process.stdout.write(`\n${color}`);
    process.stdout.write(text);
    process.stdout.write(colors.reset);
  }

  installSlashSuggestions() {
    if (!process.stdin.isTTY) return;

    readline.emitKeypressEvents(process.stdin, this.rl);

    process.stdin.on('keypress', (str, key = {}) => {
      if (key.ctrl || key.meta) return;

      if (typeof str === 'string' && str.length > 1) {
        return;
      }

      if (this.slashMenu.open && this.handleSlashMenuKey(key)) {
        return;
      }

      if (key.name === 'escape' && this.isProcessing) {
        this.isCancelled = true;
        if (this.spinner) this.spinner.stop();
        console.log(`\n\x1b[31m[ Đã nhận lệnh HỦY... AI sẽ kết thúc ở thao tác tiếp theo ]\x1b[0m`);
        return;
      }

      queueMicrotask(() => {
        const line = this.rl?.line || '';
        if (!line.startsWith('/')) {
          this.closeSlashMenu();
          return;
        }

        this.openSlashMenu(line);
      });
    });
  }

  openSlashMenu(line) {
    const matches = this.getSlashSuggestions(line);
    if (matches.length === 0) {
      this.closeSlashMenu();
      return;
    }
    if (this.slashMenu.open && this.slashMenu.line === line) return;

    this.slashMenu = { open: true, line, items: matches, selected: 0, printedLines: this.slashMenu?.printedLines || 0 };
    this.renderSlashMenu();
  }

  closeSlashMenu() {
    if (this.slashMenu && this.slashMenu.printedLines) {
      readline.moveCursor(process.stdout, 0, -this.slashMenu.printedLines);
      readline.clearScreenDown(process.stdout);
    }
    this.slashMenu = { open: false, line: '', items: [], selected: 0, printedLines: 0 };
  }

  handleSlashMenuKey(key = {}) {
    if (key.name === 'up') {
      this.moveSlashSelection(-1);
      return true;
    }
    if (key.name === 'down') {
      this.moveSlashSelection(1);
      return true;
    }
    if (key.name === 'tab') {
      this.acceptSlashSelection();
      return true;
    }
    if (key.name === 'escape') {
      this.closeSlashMenu();
      this.rl.prompt(true);
      return true;
    }
    return false;
  }

  moveSlashSelection(delta) {
    if (!this.slashMenu.items.length) return;
    const count = this.slashMenu.items.length;
    this.slashMenu.selected = (this.slashMenu.selected + delta + count) % count;
    this.renderSlashMenu();
  }

  acceptSlashSelection() {
    const item = this.slashMenu.items[this.slashMenu.selected];
    if (!item) return;

    const currentLine = String(this.rl?.line ?? this.slashMenu.line ?? '');
    const slashPrefixMatch = currentLine.match(/^\s*(\/\S*)(.*)$/);
    const prefix = slashPrefixMatch ? slashPrefixMatch[1] : currentLine.trim();
    const suffixText = slashPrefixMatch ? slashPrefixMatch[2] : '';
    const needsSpace = item.usage && suffixText && !/^\s/.test(suffixText);
    const replacement = `${item.cmd}${needsSpace ? ' ' : ''}${suffixText}`.trimEnd();

    this.rl.write(null, { ctrl: true, name: 'u' });
    this.rl.write(replacement || prefix || item.cmd);
    this.closeSlashMenu();
    this.rl.prompt(true);
  }

  renderSlashMenu() {
    const matches = this.slashMenu.items;
    if (!matches.length) return;

    if (this.slashMenu.printedLines) {
      readline.moveCursor(process.stdout, 0, -this.slashMenu.printedLines);
    }

    process.stdout.write('\n');
    readline.clearLine(process.stdout, 1);
    process.stdout.write(`${colors.dim}Commands${colors.reset}\n`);
    
    const maxDisplay = 5;
    const displayedMatches = matches.slice(0, maxDisplay);

    displayedMatches.forEach((item, index) => {
      readline.clearLine(process.stdout, 1);
      const usage = item.usage ? ` ${colors.dim}${item.usage}${colors.reset}` : '';
      const pointer = index === this.slashMenu.selected ? `${colors.green}>${colors.reset}` : ' ';
      process.stdout.write(`${pointer} ${colors.cyan}${item.cmd}${colors.reset} ${colors.dim}${item.desc}${colors.reset}${usage}\n`);
    });

    if (matches.length > maxDisplay) {
      readline.clearLine(process.stdout, 1);
      process.stdout.write(`  ${colors.dim}... và ${matches.length - maxDisplay} lệnh khác (gõ tiếp để lọc)${colors.reset}\n`);
    }

    readline.clearLine(process.stdout, 1);
    process.stdout.write(`${colors.dim}↑/↓ chọn · Enter/Tab dùng · Esc đóng${colors.reset}\n`);

    // Xóa các dòng thừa nếu số lượng dòng mới ít hơn số lượng dòng cũ
    const currentLines = Math.min(matches.length, maxDisplay) + 3 + (matches.length > maxDisplay ? 1 : 0);
    if (this.slashMenu.printedLines > currentLines) {
      for (let i = 0; i < this.slashMenu.printedLines - currentLines; i++) {
        readline.clearLine(process.stdout, 1);
        process.stdout.write('\n');
      }
      readline.moveCursor(process.stdout, 0, -(this.slashMenu.printedLines - currentLines));
    }

    this.slashMenu.printedLines = currentLines;
    this.rl.prompt(true);
  }

  getSlashSuggestions(line) {
    const query = String(line || '').trim();
    if (!query.startsWith('/')) return [];
    if (query === '/') {
      const preferred = [
        '/help', '/exit', '/pwd', '/cd',
        '/provider', '/model', '/models', '/providers',
        '/read', '/write', '/glob', '/grep', '/bash',
        '/codex', '/claude', '/karpathy', '/agents',
        '/resources', '/designs', '/skills',
      ];
      return preferred
        .map(cmd => SLASH_COMMANDS.find(item => item.cmd === cmd))
        .filter(Boolean);
    }
    return SLASH_COMMANDS.filter(item => item.cmd.startsWith(query)).slice(0, 12);
  }

  enrichToolArgs(toolName, toolArgs = {}, messages = []) {
    const args = this.tools.normalizeToolInput?.(toolName, toolArgs) || (toolArgs && typeof toolArgs === 'object' ? { ...toolArgs } : {});
    const fallbackPath = this.extractPathFromMessages(messages);

    if (fallbackPath) {
      if (toolName === 'Glob' && !args.pattern && !args.glob && !args.path && !args.cwd) {
        args.path = fallbackPath;
      }
      if (toolName === 'Glob' && (args.pattern || args.glob) && !args.path && !args.cwd) {
        args.cwd = fallbackPath;
      }
      if (toolName === 'Bash' && !args.command && !args.cmd) {
        args.command = `ls -R "${fallbackPath}"`;
      }
      if (toolName === 'Bash' && typeof (args.command ?? args.cmd) === 'string') {
        const commandKey = args.command ? 'command' : 'cmd';
        if (/^\s*(ls|dir)(\s+-R)?\s*$/i.test(args[commandKey])) {
          args[commandKey] = `ls -R "${fallbackPath}"`;
        }
      }
      if (toolName === 'Read' && !args.file_path && !args.path && !args.file) {
        args.path = fallbackPath;
      }
      if (toolName === 'Grep' && !args.path) {
        args.path = fallbackPath;
      }
    }

    return args;
  }

  recoverToolArgs(toolName, rawArgs) {
    const raw = String(rawArgs || '').trim();
    if (!raw) return null;
    if (/^[{[]/.test(raw)) return null;

    const cleaned = raw
      .replace(/^```(?:json|tool|tool_call)?\s*/i, '')
      .replace(/```$/i, '')
      .trim()
      .replace(/^['"]|['"]$/g, '');
    if (!cleaned) return null;

    return this.tools.normalizeToolInput?.(toolName, cleaned) || null;
  }

  extractPathFromMessages(messages = []) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const content = messages[i]?.content;
      if (typeof content !== 'string') continue;

      const matches = [...content.matchAll(/[A-Za-z]:[\\/][^\r\n"'`<>|]+/g)];
      if (matches.length) {
        return matches[matches.length - 1][0]
          .trim()
          .replace(/[.,;:!?)]$/, '')
          .replace(/[\u2010-\u2015\u2212]/g, '-');
      }
    }
    return null;
  }

  async requestFinalAnswer(messages, toolSummaries, startedAt, totalUsage) {
    const executionProfile = this.selectExecutionProfile(messages, { enableTools: false });
    const finalMessages = [
      ...messages,
      {
        role: 'user',
        content: [
          'You have finished using tools.',
          'Now answer the user directly in the same language as the user.',
          'Do not call more tools. Do not ask the user to provide files you already read.',
          'Use the tool results above. If a tool failed, explain the concrete failure briefly and answer with the available evidence.',
          toolSummaries.length ? `Tool summary:\n${toolSummaries.join('\n')}` : '',
        ].filter(Boolean).join('\n'),
      },
    ];

    try {
      if (typeof this.ai.streamRequest === 'function') {
        return await this.streamFinalAnswer(finalMessages, startedAt, totalUsage, executionProfile);
      }

      const response = await this.ai.sendRequest(finalMessages, {
        provider: executionProfile.provider,
        model: executionProfile.model,
        enableTools: false,
      });
      this.addUsage(totalUsage, response.usage);
      const content = response.choices?.[0]?.message?.content || '';
      if (content) {
        this.printAssistantAnswer(content, startedAt, totalUsage);
      }
      return content;
    } catch (error) {
      const fallback = this.buildToolFallbackAnswer(toolSummaries, error.message);
      console.log(`\n${colors.yellow}${fallback}${colors.reset}\n`);
      return fallback;
    }
  }

  async streamFinalAnswer(messages, startedAt, totalUsage, executionProfile = null) {
    let content = '';
    const profile = executionProfile || this.selectExecutionProfile(messages, { enableTools: false });

    try {
      process.stdout.write(`\n${colors.white}`);
      let isFirst = true;
      for await (const chunk of this.ai.streamRequest(messages, {
        provider: profile.provider,
        model: profile.model,
        enableTools: false,
      })) {
        if (chunk.usage) this.addUsage(totalUsage, chunk.usage);
        if (chunk.content) {
          content += chunk.content;
          process.stdout.write(chunk.content);
        }
      }
      process.stdout.write(colors.reset);

      if (content) {
        console.log(`\n${colors.dim}${this.formatAnswerFooter(startedAt, totalUsage)}${colors.reset}\n`);
        return content;
      }
    } catch (error) {
      process.stdout.write(colors.reset);
      console.log(`${colors.dim}Streaming failed, retrying normal response: ${error.message}${colors.reset}`);
    }

    const response = await this.ai.sendRequest(messages, {
      provider: profile.provider,
      model: profile.model,
      enableTools: false,
    });
    this.addUsage(totalUsage, response.usage);
    content = response.choices?.[0]?.message?.content || '';
    if (content) {
      this.printAssistantAnswer(content, startedAt, totalUsage);
    }
    return content;
  }

  printAssistantAnswer(content, startedAt, usage = {}) {
    const formatted = formatMarkdown(content);
    console.log(`\n${colors.white}${formatted}${colors.reset}`);
    console.log(`${colors.dim}${'─'.repeat(50)}${colors.reset}`);
    console.log(`${colors.dim}${this.formatAnswerFooter(startedAt, usage)}${colors.reset}\n`);
  }

  formatAnswerFooter(startedAt, usage = {}) {
    return formatFooterText(startedAt, usage);
  }

  addUsage(totalUsage, usage = {}) {
    return mergeUsage(totalUsage, usage);
  }

  formatUsage(usage = {}) {
    return formatUsageText(usage);
  }

  buildToolFallbackAnswer(toolSummaries, errorMessage = '') {
    return buildFallbackAnswer(toolSummaries, errorMessage);
  }

  formatToolResultForConsole(toolName, result) {
    return formatToolResult(toolName, result);
  }

  normalizeToolCalls(toolCalls) {
    return normalizeCalls(toolCalls, rawArgs => this.parseToolArguments(rawArgs));
  }

  extractInlineToolCalls(content) {
    return extractInlineCalls(content);
  }

  decodeXmlEntities(value) {
    return decodeXmlValue(value);
  }

  parseToolArguments(rawArgs) {
    return parseArguments(rawArgs);
  }

  extractFirstJsonObject(text) {
    return extractJsonObject(text);
  }

  formatToolCallsForMessage(toolCalls) {
    return formatToolCalls(toolCalls);
  }

  async promptToolPermission(commandText) {
    process.stdout.write(`${colors.magenta}│${colors.reset}   ${colors.yellow}⚠  AI muốn chạy: ${colors.bright}${commandText}${colors.reset}\n`);
    process.stdout.write(`${colors.magenta}│${colors.reset}   ${colors.cyan}1.${colors.reset} Cho phép\n`);
    process.stdout.write(`${colors.magenta}│${colors.reset}   ${colors.cyan}2.${colors.reset} Cho phép trong phiên\n`);
    process.stdout.write(`${colors.magenta}│${colors.reset}   ${colors.cyan}3.${colors.reset} Không cho phép\n`);

    while (true) {
      const answer = await new Promise(resolve => {
        this.rl.question(`${colors.magenta}│${colors.reset}   ${colors.yellow}Chọn [1/2/3]: ${colors.reset}`, resolve);
      });

      const choice = String(answer || '').trim().toLowerCase();
      if (choice === '1' || choice === 'y' || choice === 'yes' || choice === 'allow') {
        return true;
      }
      if (choice === '2' || choice === 'a' || choice === 'session' || choice === 'allow session') {
        return 'session';
      }
      if (choice === '3' || choice === 'n' || choice === 'no' || choice === 'deny' || choice === '0') {
        return false;
      }

      process.stdout.write(`${colors.magenta}│${colors.reset}   ${colors.dim}Vui lòng chọn 1, 2 hoặc 3.${colors.reset}\n`);
    }
  }

  buildToolCallSignature(toolCalls) {
    return buildToolCallSignatureText(toolCalls, name => this.tools?.normalizeToolName?.(name) || name);
  }

  getCompressedPromptHistory(options = {}) {
    const raw = this.session.getHistory(options.limit || 40)
      .filter(entry => entry && typeof entry.content === 'string')
      .map(entry => ({ role: entry.role, content: entry.content }));
    const compressed = compressConversation(raw, {
      keepRecent: options.keepRecent || 14,
      maxChars: options.maxTotalChars || 12000,
      maxItems: 18,
    });

    return {
      summary: compressed.summary,
      entries: compressed.recent,
      compressed,
    };
  }

  async compressSessionContext(verbose = false) {
    const raw = this.session.getHistory(80)
      .filter(entry => entry && typeof entry.content === 'string')
      .map(entry => ({ role: entry.role, content: entry.content }));
    const compressed = compressConversation(raw, {
      keepRecent: 14,
      maxChars: 12000,
      maxItems: 24,
    });

    if (!compressed.compressed) {
      if (verbose) {
        console.log(`${colors.dim}Context is already compact (${compressed.totalChars} chars).${colors.reset}`);
      }
      return compressed;
    }

    await this.session.updateContext('conversationSummary', {
      summary: compressed.summary,
      omittedCount: compressed.omittedCount,
      totalChars: compressed.totalChars,
      updatedAt: new Date().toISOString(),
    });
    await this.session.replaceMemory('[Conversation Summary]', compressed.summary, 'summary');

    if (verbose) {
      console.log(`${colors.green}✓ Compressed ${compressed.omittedCount} old message(s) into session summary.${colors.reset}`);
    }
    return compressed;
  }

  showToolStats() {
    const summary = getToolUsageSummary();
    if (summary.length === 0) {
      console.log(`${colors.dim}No tool usage recorded in this process.${colors.reset}`);
      return;
    }

    console.log(`${colors.cyan}Tool Usage:${colors.reset}`);
    for (const item of summary) {
      console.log(`  ${item.tool}: ${item.calls} call(s), ${item.failures} failure(s), avg ${item.avgMs}ms`);
    }
  }

  showReplay(limit = 20) {
    const history = this.session.getHistory(Math.max(1, limit));
    const toolEvents = this.session.getToolEvents?.(Math.max(1, limit)) || [];

    console.log(`${colors.cyan}Session Replay:${colors.reset}`);
    if (history.length === 0 && toolEvents.length === 0) {
      console.log(`  ${colors.dim}No replay data yet.${colors.reset}`);
      return;
    }

    for (const entry of history) {
      const text = this.compactText(entry.content || '', 220, 'history').replace(/\s+/g, ' ');
      console.log(`  [${entry.timestamp || ''}] ${entry.role}: ${text}`);
    }

    if (toolEvents.length > 0) {
      console.log(`${colors.cyan}Tool Events:${colors.reset}`);
      for (const event of toolEvents) {
        const status = event.success === false ? 'failed' : 'ok';
        console.log(`  [${event.timestamp || ''}] ${event.tool} ${status} ${event.durationMs || 0}ms`);
      }
    }
  }

  async showDiff(args = []) {
    const cached = args.includes('--cached') || args.includes('--staged');
    const confirm = args.includes('--confirm');
    const command = cached ? 'git diff --cached' : 'git diff';
    const result = await this.tools.execute('Bash', { command, cwd: this.projectPath }, { cwd: this.projectPath });
    const diff = result.stdout || '';

    if (!result.success) {
      console.log(`${colors.red}Error: ${result.error}${colors.reset}`);
      return;
    }
    if (!diff.trim()) {
      console.log(`${colors.dim}No diff.${colors.reset}`);
      return;
    }

    console.log(diff);
    if (confirm) {
      const answer = await new Promise(resolve => {
        this.rl.question(`${colors.yellow}Apply is not automatic here. Continue? [y/N]: ${colors.reset}`, resolve);
      });
      console.log(/^y(es)?$/i.test(String(answer || '').trim())
        ? `${colors.green}✓ Confirmed${colors.reset}`
        : `${colors.dim}Cancelled${colors.reset}`);
    }
  }

  async handleWatchCommand(args = []) {
    const action = args[0];
    if (action === 'stop') {
      this.stopWatchers();
      console.log(`${colors.green}✓ Watcher stopped${colors.reset}`);
      return;
    }

    const command = args.join(' ').trim() || 'npm test';
    this.stopWatchers();

    let timer = null;
    const run = async (reason) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        console.log(`${colors.dim}Watcher: ${reason}; running ${command}${colors.reset}`);
        const result = await this.tools.execute('Bash', { command, cwd: this.projectPath, timeout: 120000 }, { cwd: this.projectPath });
        if (result.stdout) console.log(result.stdout);
        if (result.stderr) console.log(`${colors.yellow}${result.stderr}${colors.reset}`);
        if (!result.success) console.log(`${colors.red}Watcher command failed: ${result.error}${colors.reset}`);
      }, 250);
    };

    const watcher = fsWatch(this.projectPath, { recursive: true }, (_eventType, fileName) => {
      const name = String(fileName || '');
      if (!name || /(^|[\\/])(\.git|node_modules|\.winter)([\\/]|$)/.test(name)) return;
      run(name);
    });
    this.watchers.push(watcher);
    console.log(`${colors.green}✓ Watching ${this.projectPath}${colors.reset}`);
    console.log(`${colors.dim}Command: ${command}. Use /watch stop to stop.${colors.reset}`);
  }

  stopWatchers() {
    for (const watcher of this.watchers) {
      try { watcher.close(); } catch {}
    }
    this.watchers = [];
  }

  async chat(message, imageAttachments = []) {
    try {
      const needsTools = true;
      const context = await this.getProjectContext(message);
      const messages = [
        { role: 'system', content: this.getSystemPrompt(context) }
      ];

      await this.compressSessionContext(false);
      const promptHistory = this.getCompressedPromptHistory({
        limit: 20,
        keepRecent: 14,
        maxTotalChars: this.shouldUseCompactPrompt() ? 5000 : 12000,
      });
      if (promptHistory.summary) {
        messages.push({ role: 'system', content: `Compressed prior conversation:\n${promptHistory.summary}` });
      }
      for (const entry of promptHistory.entries) {
        messages.push({ role: entry.role, content: entry.content });
      }

      // Build user message with optional image attachments
      if (imageAttachments.length > 0) {
        const content = [];
        content.push({ type: 'text', text: message });
        for (const img of imageAttachments) {
          content.push({
            type: 'image_url',
            image_url: { url: `data:${img.mime};base64,${img.base64}` }
          });
        }
        messages.push({ role: 'user', content });
      } else {
        messages.push({ role: 'user', content: message });
      }

      const tools = this.getAgentTools('general');
      const { finalContent, usedTools } = await this.runConversation(messages, 'Thinking', tools);

      await this.session.addToHistory({ role: 'user', content: message });
      await this.session.addToHistory({ role: 'assistant', content: finalContent });

      // Tự động verify: nếu AI đã dùng tools (sửa code), chạy test/build
      if (usedTools && finalContent) {
        await this.verifyAndHeal(messages, tools, 5);
      }

    } catch (error) {
      console.log(`\n${colors.red}✖ Error: ${error.message}${colors.reset}\n`);
    }
  }

  /**
   * Chạy verification commands (test, build) và trả về kết quả
   */
  async runVerification(commands = ['npm test']) {
    const { execSync } = await import('child_process');
    const results = [];

    for (const cmd of commands) {
      try {
        const output = execSync(cmd, {
          timeout: 120000,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        results.push({ cmd, passed: true, output: output.trim() });
      } catch (error) {
        const stderr = error.stderr || '';
        const stdout = error.stdout || '';
        results.push({ cmd, passed: false, output: (stdout + '\n' + stderr).trim() });
      }
    }

    return {
      passed: results.every(r => r.passed),
      details: results,
    };
  }

  /**
   * Vòng lặp tự động verify + sửa lỗi:
   * - Chạy test/build
   * - Nếu fail, gửi lỗi cho AI fix
   * - Lặp đến khi pass hết hoặc hết số lần thử
   */
  async verifyAndHeal(messages, tools, maxAttempts = 5) {
    const verifCommands = ['npm test'];

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`\n${colors.cyan}=== Verification Attempt ${attempt}/${maxAttempts} ===${colors.reset}`);

      const result = await this.runVerification(verifCommands);

      if (result.passed) {
        console.log(`\n${colors.green}✅ All verifications passed!${colors.reset}\n`);
        return;
      }

      // Collect error details
      const errorDetails = result.details
        .filter(r => !r.passed)
        .map(r => `Command: ${r.cmd}\n${r.output}`)
        .join('\n\n---\n\n');

      console.log(`\n${colors.yellow}⚠ Verification failed. Sending errors back to AI for fix...${colors.reset}\n`);

      // Push error output as user message for AI to fix
      const fixPrompt = `VERIFICATION FAILED (attempt ${attempt}/${maxAttempts}):

The following commands produced errors:

${errorDetails}

The system will re-run verification automatically after you fix. Please FIX ALL ERRORS above.
Do NOT stop until all errors are resolved.`;

      messages.push({ role: 'user', content: fixPrompt });

      // Let the AI fix the issues
      const { usedTools: fixUsedTools } = await this.runConversation(messages, 'Fixing', tools);

      if (!fixUsedTools) {
        console.log(`\n${colors.red}⚠ AI did not attempt to fix the errors. Stopping.${colors.reset}\n`);
        break;
      }
    }

    console.log(`\n${colors.red}⚠ Max verification attempts (${maxAttempts}) reached. Some issues may remain.${colors.reset}\n`);
  }

  shouldUseTools(message = '', imageAttachments = []) {
    return true;
  }

  getPromptHistory({ limit = 20, maxEntryChars = 2000, maxTotalChars = 12000 } = {}) {
    const raw = this.session.getHistory(limit);
    const selected = [];
    let total = 0;

    for (let i = raw.length - 1; i >= 0; i--) {
      const entry = raw[i];
      if (!entry || typeof entry.content !== 'string') continue;

      const trimmed = entry.content.length > maxEntryChars
        ? `${entry.content.slice(0, maxEntryChars)}\n[history truncated]`
        : entry.content;
      if (total + trimmed.length > maxTotalChars && selected.length > 0) break;

      selected.unshift({ role: entry.role, content: trimmed });
      total += trimmed.length;
    }

    return selected;
  }

  async runAgent(role, task) {
    const context = await this.getProjectContext(task);
    const messages = [
      { role: 'system', content: this.getAgentSystemPrompt(role, context) }
    ];

    const promptHistory = this.getCompressedPromptHistory({
      limit: this.shouldUseCompactPrompt() ? 14 : 30,
      keepRecent: this.shouldUseCompactPrompt() ? 8 : 14,
      maxTotalChars: this.shouldUseCompactPrompt() ? 5000 : 12000,
    });
    if (promptHistory.summary) {
      messages.push({ role: 'system', content: `Compressed prior conversation:\n${promptHistory.summary}` });
    }
    for (const entry of promptHistory.entries) {
      messages.push({ role: entry.role, content: entry.content });
    }

    messages.push({ role: 'user', content: `Task: ${task}` });

    const agentTools = this.getAgentTools(role);
    const { finalContent, usedTools } = await this.runConversation(messages, `Subagent [${role}]`, agentTools);

    await this.session.addToHistory({ role: 'user', content: `[subagent:${role}] ${task}` });
    await this.session.addToHistory({ role: 'assistant', content: finalContent });

    if (usedTools && finalContent) {
      await this.verifyAndHeal(messages, agentTools, 3);
    }
  }

  async getProjectContext(task = '') {
    const context = [];
    const requiredLocalResources = await this.getRequiredLocalResourceSummary();
    if (requiredLocalResources) {
      context.push(requiredLocalResources);
    }

    const projectInstructionFiles = await this.readProjectInstructionFiles();

    for (const file of projectInstructionFiles) {
      try {
        const preview = this.compactText(file.content, this.shouldUseCompactPrompt() ? 450 : 900, 'project instruction');
        context.push(`[${file.relativePath}]\n${preview}`);
      } catch { }
    }

    try {
      const packageJsonPath = path.join(this.projectPath, 'package.json');
      const stat = await fs.stat(packageJsonPath);
      if (stat.isFile()) {
        const content = await fs.readFile(packageJsonPath, 'utf-8');
        context.push(`[package.json]\n${this.compactText(content, this.shouldUseCompactPrompt() ? 650 : 1200, 'package.json')}`);
      }
    } catch { }

    const shouldIncludeResources = /\b(resource|resources|skill|skills|plugin|plugins|claude|codex|agent|agents|design|ui|figma|brand|mcp)\b/i.test(String(task || ''));
    const localResources = shouldIncludeResources ? await this.getLocalResourceContext() : '';
    if (localResources) {
      context.push(localResources);
    }

    // Git Context
    try {
      const { execSync } = await import('child_process');
      const gitStatus = execSync('git status --short', { cwd: this.projectPath, encoding: 'utf8', stdio: 'pipe' }).trim();
      if (gitStatus) {
        context.push(`[Git Status]\n${gitStatus}`);

        const gitSummary = execSync('git diff --stat --summary', { cwd: this.projectPath, encoding: 'utf8', stdio: 'pipe', maxBuffer: 1024 * 50 }).trim();
        if (gitSummary) {
          context.push(`[Git Summary]\n${this.compactText(gitSummary, this.shouldUseCompactPrompt() ? 650 : 1200, 'git summary')}`);
        }

        // Get brief git diff for context
        const gitDiff = execSync('git diff', { cwd: this.projectPath, encoding: 'utf8', stdio: 'pipe', maxBuffer: 1024 * 50 }).trim().split('\n').slice(0, 30).join('\n');
        if (gitDiff) {
          context.push(`[Git Diff]\n${this.compactText(gitDiff, this.shouldUseCompactPrompt() ? 900 : 1800, 'git diff')}`);
        }
      }
    } catch (e) {
      // Not a git repo or git not installed
    }

    return this.compactText(context.join('\n\n') || 'No project context found.', this.shouldUseCompactPrompt() ? 4200 : 9000, 'project context');
  }

  async getLocalResourceContext() {
    return this.contextLoader.getLocalResourceContext();
  }

  async getRequiredLocalResourceSummary() {
    return this.contextLoader.getRequiredLocalResourceSummary();
  }

  async bootstrapProjectCapabilities() {
    const sessionContext = this.session.getContext() || {};

    if (!sessionContext.bootstrapPlan?.id && this.session.getPlans().length === 0) {
      const plan = await this.session.createPlan(
        'Bootstrap project context',
        'Inspect rules, resources, and likely skills before doing any task work.'
      );
      await this.session.addPlanStep(plan.id, {
        description: 'Read required local resources, project rules, and attached skill libraries.',
      });
      await this.session.addPlanStep(plan.id, {
        description: 'Ground every model in required resource rules before making changes.',
      });
      await this.session.updateContext('bootstrapPlan', {
        id: plan.id,
        title: plan.title,
        description: plan.description,
      });
    }

    const requiredLocalResources = await this.getRequiredLocalResourceSummary();
    if (requiredLocalResources) {
      await this.session.updateContext('requiredLocalResources', requiredLocalResources);
      await this.session.replaceMemory('[Required local resources]', requiredLocalResources, 'resource');
    }

    const skillSnapshot = await this.inferStartupSkills();
    await this.session.updateContext('availableSkillCatalog', skillSnapshot.availableSkills);
    await this.session.updateContext('activeSkills', skillSnapshot.activeSkills);

    const appliedText = skillSnapshot.activeSkills.length > 0
      ? `Auto-applied skills: ${skillSnapshot.activeSkills.join(', ')}`
      : 'Auto-applied skills: none';
    await this.session.replaceMemory('[Auto-applied skills]', appliedText, 'skill');
  }

  async inferStartupSkills() {
    const catalog = await this.getStartupSkillCatalog();
    const signals = await this.getProjectSignals();
    const normalizedSignals = new Set(signals.map(value => value.toLowerCase()));

    const hasAny = (...items) => items.some(item => normalizedSignals.has(item));
    const activeSkills = new Set([
      'coding',
      'debug',
      'refactor',
      'test',
    ]);

    if (hasAny('react', 'next', 'nextjs', 'tsx', 'jsx', 'vue', 'svelte', 'vite')) {
      ['vercel-react-best-practices', 'web-design-guidelines', 'frontend-design', 'design'].forEach(skill => activeSkills.add(skill));
    }

    if (hasAny('design', 'ui', 'ux', 'css', 'tailwind', 'styled-components', 'scss', 'style', 'component')) {
      ['web-design-guidelines', 'frontend-design', 'design'].forEach(skill => activeSkills.add(skill));
    }

    if (hasAny('claude', 'agent', 'mcp', 'plugin', 'skill', 'automation', 'workflow')) {
      ['skill-creator', 'claude-automation-recommender', 'claude-md-improver', 'agent-development', 'hook-development', 'command-development', 'plugin-dev'].forEach(skill => activeSkills.add(skill));
    }

    if (hasAny('docs', 'markdown', 'md', 'readme', 'documentation')) {
      ['claude-md-improver', 'docs', 'writing-rules'].forEach(skill => activeSkills.add(skill));
    }

    if (hasAny('figma', 'design-md', 'brand', 'brand-guidelines', 'style-guide')) {
      ['vibefigma', 'web-design-guidelines'].forEach(skill => activeSkills.add(skill));
    }

    const filtered = [...activeSkills].filter(skill => catalog.has(skill));
    return {
      availableSkills: [...catalog],
      activeSkills: filtered,
    };
  }

  async getStartupSkillCatalog() {
    return this.contextLoader.getStartupSkillCatalog();
  }

  async getProjectSignals() {
    return this.contextLoader.getProjectSignals();
  }
  getSystemPrompt(context = '') {
    this.hydrateSessionToolPermissions();
    this.promptBuilder.session = this.session;
    this.promptBuilder.ai = this.ai;
    this.promptBuilder.tools = this.tools;
    this.promptBuilder.sessionPermissionGrants = this.sessionPermissionGrants;
    return this.promptBuilder.buildSystemPrompt(context, {
      projectContextBudget: this.shouldUseCompactPrompt() ? 2200 : 3200,
    });
  }

  getFastSystemPrompt() {
    this.promptBuilder.session = this.session;
    return this.promptBuilder.buildFastSystemPrompt();
  }

  // Tab completion
  completer(line) {
    const hits = [];

    // Complete slash commands
    if (line.startsWith('/')) {
      SLASH_COMMANDS.forEach(cmd => {
        if (cmd.cmd.startsWith(line)) {
          hits.push(cmd.cmd + (cmd.sub ? ' ' : ''));
        }
      });
    }

    return [hits.length ? hits : [], line];
  }

  getAgentSystemPrompt(role, context = '') {
    this.promptBuilder.session = this.session;
    this.promptBuilder.ai = this.ai;
    this.promptBuilder.tools = this.tools;
    return this.promptBuilder.buildAgentSystemPrompt(role, context);
  }

  async handleMcpCommand(args) {
    const [action, ...rest] = args;
    const config = await this.config.load();
    config.mcp = config.mcp || { servers: [] };

    switch (action) {
      case undefined:
      case 'list':
        console.log(`${colors.cyan}MCP Servers:${colors.reset}`);
        if ((config.mcp.servers || []).length === 0) {
          console.log(`  ${colors.dim}No MCP servers configured.${colors.reset}`);
          break;
        }
        config.mcp.servers.forEach(server => {
          const enabled = server.enabled === false ? `${colors.red}disabled${colors.reset}` : `${colors.green}enabled${colors.reset}`;
          console.log(`  • ${server.name} (${enabled}) -> ${server.command}${server.args?.length ? ` ${server.args.join(' ')}` : ''}`);
        });
        break;
      case 'add': {
        const [name, command, ...commandArgs] = rest;
        if (!name || !command) {
          console.log(`${colors.yellow}Usage: /mcp add <name> <command> [args-json]${colors.reset}`);
          break;
        }
        let parsedArgs = [];
        const rawArgs = commandArgs.join(' ').trim();
        if (rawArgs) {
          try {
            const parsed = JSON.parse(rawArgs);
            parsedArgs = Array.isArray(parsed) ? parsed : [String(parsed)];
          } catch {
            parsedArgs = commandArgs;
          }
        }
        config.mcp.servers = (config.mcp.servers || []).filter(server => server.name !== name);
        config.mcp.servers.push({ name, command, args: parsedArgs, enabled: true });
        await this.config.save(config);
        console.log(`${colors.green}✓ Added MCP server: ${name}${colors.reset}`);
        break;
      }
      case 'remove': {
        const name = rest[0];
        if (!name) {
          console.log(`${colors.yellow}Usage: /mcp remove <name>${colors.reset}`);
          break;
        }
        config.mcp.servers = (config.mcp.servers || []).filter(server => server.name !== name);
        await this.config.save(config);
        console.log(`${colors.green}✓ Removed MCP server: ${name}${colors.reset}`);
        break;
      }
      case 'allow': {
        const name = rest[0];
        if (!name) {
          console.log(`${colors.yellow}Usage: /mcp allow <name>${colors.reset}`);
          break;
        }
        await this.config.setPermissionAllowlist({ mcpServers: [name] });
        console.log(`${colors.green}✓ MCP server allowed: ${name}${colors.reset}`);
        break;
      }
      default:
        console.log(`${colors.yellow}Usage: /mcp <list|add|remove|allow>${colors.reset}`);
    }
  }

  async handlePermissionsCommand(args) {
    const [action, ...rest] = args;
    const config = await this.config.load();
    config.permissions = config.permissions || { allowlist: { tools: [], commands: [], mcpServers: [] } };
    config.permissions.allowlist = config.permissions.allowlist || { tools: [], commands: [], mcpServers: [] };

    switch (action) {
      case undefined:
      case 'list':
        console.log(`${colors.cyan}Permission Allowlist:${colors.reset}`);
        console.log(`  Tools: ${(config.permissions.allowlist.tools || []).join(', ') || 'none'}`);
        console.log(`  Commands: ${(config.permissions.allowlist.commands || []).join(', ') || 'none'}`);
        console.log(`  MCP Servers: ${(config.permissions.allowlist.mcpServers || []).join(', ') || 'none'}`);
        console.log(`  Prompt by default: ${config.permissions.promptByDefault !== false}`);
        break;
      case 'allow': {
        const [kind, value] = rest;
        if (!kind || !value) {
          console.log(`${colors.yellow}Usage: /permissions allow <tool|command|mcp> <value>${colors.reset}`);
          break;
        }
        const field = kind === 'tool' ? 'tools' : kind === 'command' ? 'commands' : kind === 'mcp' ? 'mcpServers' : null;
        if (!field) {
          console.log(`${colors.yellow}Allowed kinds: tool, command, mcp${colors.reset}`);
          break;
        }
        await this.config.setPermissionAllowlist({ [field]: [value] });
        console.log(`${colors.green}✓ Allowed ${kind}: ${value}${colors.reset}`);
        break;
      }
      case 'prompt': {
        const value = String(rest[0] || '').toLowerCase();
        await this.config.setPermissionAllowlist({ promptByDefault: !(value === 'off' || value === 'false' || value === '0' || value === 'no') });
        console.log(`${colors.green}✓ Updated prompt policy${colors.reset}`);
        break;
      }
      default:
        console.log(`${colors.yellow}Usage: /permissions <list|allow|prompt>${colors.reset}`);
    }
  }

  compactText(text, maxChars = 1200, label = 'text') {
    return compactPromptText(text, maxChars, label);
  }

  summarizePromptList(items, options = {}) {
    return summarizePrompts(items, options);
  }

  async getClipboardContent() {
    try {
      const { execSync } = await import('child_process');
      if (process.platform === 'win32') {
        return execSync('powershell.exe -NoProfile -Command "Get-Clipboard -Raw"').toString().trim();
      } else if (process.platform === 'darwin') {
        return execSync('pbpaste').toString().trim();
      } else {
        return execSync('xclip -selection clipboard -o').toString().trim();
      }
    } catch (e) {
      return null;
    }
  }
}
