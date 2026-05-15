/**
 * ❄️ WINTER REPL ❄️
 * Claude Code / Codex style interactive REPL
 */

import readline from 'readline';
import { promises as fs } from 'fs';
import { homedir } from 'os';
import { welcomeBanner, colors } from './snowflake-logo.js';
import { ToolExecutor } from '../tools/executor.js';
import { SessionManager } from '../session/manager.js';
import { AIProviderManager } from '../ai/providers.js';
import { ConfigLoader } from './config.js';
import path from 'path';
import { highlight } from 'cli-highlight';

// All slash commands (like Claude Code)
const SLASH_COMMANDS = [
  // Project
  { cmd: '/project', desc: 'Show/set current project' },
  { cmd: '/cd', desc: 'Change directory' },
  { cmd: '/pwd', desc: 'Show current directory' },
  // Session
  { cmd: '/session', desc: 'Session management' },
  { cmd: '/sessions', desc: 'List all sessions' },
  { cmd: '/clear', desc: 'Clear screen' },
  // Memory
  { cmd: '/remember', desc: 'Store in memory', usage: '/remember <text>' },
  { cmd: '/memories', desc: 'Show stored memories' },
  { cmd: '/forget', desc: 'Clear memories', usage: '/forget [pattern]' },
  // Plans
  { cmd: '/plan', desc: 'Create/view plans' },
  { cmd: '/plans', desc: 'List active plans' },
  // Tasks
  { cmd: '/tasks', desc: 'List tasks' },
  { cmd: '/task', desc: 'Create task', usage: '/task <description>' },
  { cmd: '/agent', desc: 'Launch subagent', usage: '/agent <task>' },
  // Tools
  { cmd: '/read', desc: 'Read file', usage: '/read <file>' },
  { cmd: '/write', desc: 'Write file', usage: '/write <file> <content>' },
  { cmd: '/glob', desc: 'Find files', usage: '/glob <pattern>' },
  { cmd: '/grep', desc: 'Search files', usage: '/grep <pattern>' },
  { cmd: '/bash', desc: 'Run command', usage: '/bash <command>' },
  { cmd: '/image', desc: 'Analyze image/screenshot', usage: '/image <file> [question]' },
  // Design
  { cmd: '/design', desc: 'Design commands', sub: ['search', 'add', 'list', 'preview'] },
  { cmd: '/designs', desc: 'List/search awesome-design-md systems', usage: '/designs [query]' },
  // Skills
  { cmd: '/skill', desc: 'Skills management', sub: ['list', 'enable', 'create'] },
  { cmd: '/skills', desc: 'List local Winter/Codex/Claude skills' },
  // Plugins
  { cmd: '/plugin', desc: 'Plugin management', sub: ['list', 'install', 'remove'] },
  // Local agent resources
  { cmd: '/codex', desc: 'Browse ~/.codex resources', usage: '/codex [skills|plugins|models|rules|memories]' },
  { cmd: '/claude', desc: 'Browse ~/.claude resources', usage: '/claude [skills|plugins|settings]' },
  { cmd: '/karpathy', desc: 'Browse karpathy-tools and guidelines' },
  { cmd: '/agents', desc: 'Read ~/agents.md' },
  { cmd: '/resources', desc: 'Show bundled local resource manifest' },
  // Provider
  { cmd: '/provider', desc: 'Show/switch AI provider', usage: '/provider <custom|claude|ollama|openai|groq>' },
  { cmd: '/providers', desc: 'List all providers' },
  { cmd: '/models', desc: 'List configured/cached models' },
  // Config
  { cmd: '/config', desc: 'Show configuration' },
  { cmd: '/model', desc: 'Show/set active provider model', usage: '/model <model-id>' },
  // Help & Exit
  { cmd: '/help', desc: 'Show this help' },
  { cmd: '/?', desc: 'Show help' },
  { cmd: '/exit', desc: 'Exit Winter' },
  { cmd: '/quit', desc: 'Exit Winter' },
];


function formatMarkdown(text) {
  if (!text) return '';
  let formatted = text;

  formatted = formatted.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
    const label = lang || 'code';
    let coloredCode = code.trimEnd();
    try {
      coloredCode = highlight(coloredCode, { language: lang || 'javascript', ignoreIllegals: true });
    } catch (e) {
      // Fallback
    }

    const columns = process.stdout.columns || 80;
    const W = Math.max(60, Math.min(Math.floor(columns * 0.95), 100));
    const headerLine = '─'.repeat(Math.max(0, W - label.length - 4));
    const bottomLine = '─'.repeat(W);

    return `\n${colors.dim}┌─ ${label} ${headerLine}${colors.reset}\n${coloredCode}\n${colors.dim}└${bottomLine}${colors.reset}\n${colors.white}`;
  });

  // Bold
  formatted = formatted.replace(/\*\*(.*?)\*\*/g, `${colors.bright}$1${colors.reset}${colors.white}`);

  // Italic
  formatted = formatted.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, `${colors.italic || colors.dim}$1${colors.reset}${colors.white}`);

  // Inline code
  formatted = formatted.replace(/`([^`\n]+)`/g, `${colors.cyan}$1${colors.reset}${colors.white}`);

  // Headings
  formatted = formatted.replace(/^### (.+)$/gm, `${colors.cyan}   $1${colors.reset}`);
  formatted = formatted.replace(/^## (.+)$/gm, `${colors.cyan}${colors.bright}  $1${colors.reset}`);
  formatted = formatted.replace(/^# (.+)$/gm, `\n${colors.bright}${colors.cyan}━ $1${colors.reset}\n`);

  // Horizontal rules
  formatted = formatted.replace(/^---+$/gm, `${colors.dim}${'─'.repeat(50)}${colors.reset}`);

  // Unordered list bullets
  formatted = formatted.replace(/^(\s*)[-*] /gm, `$1${colors.cyan}•${colors.reset} `);

  // Numbered list
  formatted = formatted.replace(/^(\s*)(\d+)\. /gm, `$1${colors.cyan}$2.${colors.reset} `);

  return formatted;
}

class Spinner {
  constructor(text = '') {
    this.text = text;
    this.frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    this.interval = null;
    this.frameIndex = 0;
  }
  start() {
    if (this.interval) return;
    this.interval = setInterval(() => {
      process.stdout.write(`\r\x1b[K${colors.cyan}${this.frames[this.frameIndex]}${colors.reset} ${colors.dim}${this.text}${colors.reset}`);
      this.frameIndex = (this.frameIndex + 1) % this.frames.length;
    }, 80);
  }
  stop(finalText) {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      process.stdout.write(`\r\x1b[K${finalText ? finalText + '\n' : ''}`);
    }
  }
  update(text) {
    this.text = text;
  }
}

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
  }

  async start() {
    await this.session.init({ project: this.projectPath, sessionId: this.sessionId });
    await this.ai.init();

    // Tự động đọc và ghi nhớ 3 file hệ thống theo yêu cầu của user
    const filesToAutoLoad = [
      'e:\\\\dev\\\\app\\\\winter\\\\resources\\\\local\\\\agents.md',
      'e:\\\\dev\\\\app\\\\winter\\\\resources\\\\local\\\\awesome-design-md',
      'e:\\\\dev\\\\app\\\\winter\\\\resources\\\\local\\\\karpathy-tools'
    ];

    const fsPromises = await import('fs/promises');
    const path = await import('path');

    for (const filePath of filesToAutoLoad) {
      try {
        const content = await fsPromises.readFile(filePath, 'utf8');
        const fileName = path.basename(filePath);
        const memoryKey = `[Tự động ghi nhớ file ${fileName}]`;

        // Xóa memory cũ về file này để cập nhật nội dung mới nhất (tránh trùng lặp)
        const currentMemories = this.session.getMemory() || [];
        const filteredMemories = currentMemories.filter(m => !m.startsWith(memoryKey));

        // Cập nhật lại mảng memory trong session
        this.session.memory = filteredMemories;

        // Thêm nội dung mới vào bộ nhớ
        this.session.addMemory(`${memoryKey}:\n${content}`);
        console.log(`${colors.dim}ℹ Đã tự động nạp và ghi nhớ file ${fileName}${colors.reset}`);
      } catch (e) {
        // Bỏ qua nếu không đọc được file
      }
    }

    // Kiểm tra và nạp file winter.md của dự án
    const projectWinterMd = path.join(this.projectPath, 'winter.md');
    try {
      await fsPromises.access(projectWinterMd);
      const content = await fsPromises.readFile(projectWinterMd, 'utf8');
      
      const memoryKey = `[Quy tắc dự án từ winter.md]`;
      this.session.memory = (this.session.getMemory() || []).filter(m => !m.startsWith(memoryKey));
      this.session.addMemory(`${memoryKey}:\n${content}`);
      console.log(`${colors.dim}ℹ Đã nạp quy tắc dự án từ winter.md${colors.reset}`);
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
        await fsPromises.writeFile(projectWinterMd, template, 'utf8');
        console.log(`\n${colors.green}✓ Đã tự động tạo file winter.md mẫu cho dự án mới!${colors.reset}`);
        console.log(`${colors.dim}Bạn có thể chỉnh sửa file này để dạy AI các quy tắc riêng của dự án.${colors.reset}\n`);
        
        // Nạp luôn vào memory
        this.session.addMemory(`[Quy tắc dự án từ winter.md]:\n${template}`);
      } catch (err) {
        // Bỏ qua nếu không ghi được file
      }
    }

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
      prompt: `${colors.bright}${colors.cyan}winter > ${colors.reset}`,
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
    this.rl.prompt();

    this.rl.on('line', (line) => {
      this.inputQueue = this.inputQueue
        .then(async () => {
          const input = line.trim();
          if (input) {
            await this.handleInput(input);
          } else {
            if (this.running && !this.readlineClosed) this.rl.prompt();
          }
        })
        .catch((error) => {
          console.log(`\n${colors.red}✖ Error: ${error.message}${colors.reset}\n`);
          if (this.running && !this.readlineClosed) this.rl.prompt();
        });
    });

    this.rl.on('close', async () => {
      this.readlineClosed = true;
      await this.inputQueue.catch(() => { });
      console.log(`\n${colors.dim}Goodbye.${colors.reset}\n`);
      process.exit(0);
    });
  }

  showStatus() {
    console.log(`${colors.dim}Project: ${this.projectPath}${colors.reset}`);
    console.log(`${colors.dim}Provider: ${this.ai.getActiveProvider()}${colors.reset}`);
    console.log(`${colors.dim}Session: ${this.session.getSessionId().substring(0, 8)}${colors.reset}`);
    console.log('');
  }

  getResourcePaths() {
    const home = homedir();
    const localRoot = path.join(this.projectPath, 'resources', 'local');
    return {
      codex: {
        root: path.join(localRoot, 'codex'),
        skills: path.join(localRoot, 'codex', 'skills'),
        plugins: path.join(localRoot, 'codex', 'plugins'),
        models: path.join(localRoot, 'codex', 'models_cache.json'),
        rules: path.join(localRoot, 'codex', 'rules'),
        memories: path.join(localRoot, 'codex', 'memories'),
      },
      claude: {
        root: path.join(localRoot, 'claude'),
        skills: path.join(localRoot, 'claude', 'skills'),
        plugins: path.join(localRoot, 'claude', 'plugins'),
        projects: path.join(localRoot, 'claude', 'projects'),
        settings: path.join(localRoot, 'claude', 'settings.json'),
      },
      karpathy: path.join(localRoot, 'karpathy-tools'),
      designs: path.join(localRoot, 'awesome-design-md', 'design-md'),
      agents: path.join(localRoot, 'agents.md'),
      manifest: path.join(localRoot, 'manifest.json'),
      localRoot,
    };
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
    try {
      const entries = await fs.readdir(target, { withFileTypes: true });
      return entries
        .map(entry => ({ name: entry.name, isDirectory: entry.isDirectory() }))
        .sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory) || a.name.localeCompare(b.name))
        .slice(0, limit);
    } catch {
      return [];
    }
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
        if (!this.readlineClosed) this.rl.prompt(true);
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
    const parts = input.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (cmd) {
      // Project commands
      case '/project':
      case '/pwd':
        console.log(`${colors.cyan}${this.projectPath}${colors.reset}`);
        break;
      case '/cd':
        if (args[0]) {
          this.projectPath = path.resolve(args[0]);
          console.log(`${colors.green}✓ Changed to: ${this.projectPath}${colors.reset}`);
        }
        break;

      // Session commands
      case '/session':
        console.log(`${colors.cyan}Session: ${this.session.getSessionId().substring(0, 8)}${colors.reset}`);
        break;
      case '/sessions':
        const sessions = await this.session.listSessions();
        console.log(`${colors.cyan}Sessions:${colors.reset}`);
        sessions.forEach(s => console.log(`  ${s.id.substring(0, 8)} - ${s.createdAt}`));
        break;
      case '/clear':
        console.clear();
        break;

      // Memory commands
      case '/remember':
        if (args.length > 0) {
          await this.session.addToMemory(args.join(' '));
          console.log(`${colors.green}✓ Remembered${colors.reset}`);
        }
        break;
      case '/memories':
        const memories = this.session.getMemory();
        if (memories.length === 0) {
          console.log(`${colors.dim}No memories${colors.reset}`);
        } else {
          console.log(`${colors.cyan}Memories:${colors.reset}`);
          memories.slice(-10).forEach(m => console.log(`  ${colors.dim}•${colors.reset} ${m.text}`));
        }
        break;
      case '/forget':
        console.log(`${colors.green}✓ Memories cleared${colors.reset}`);
        break;

      // Git Auto-Pilot
      case '/commit':
        await this.runAutoCommit(args.join(' '));
        return;
      case '/review':
        await this.runCodeReview(args.join(' '));
        return;

      // Plan commands
      case '/plan':
      case '/plans':
        if (args.length > 0) {
          await this.generateInteractivePlan(args.join(' '));
          break;
        }
        const plans = this.session.getPlans();
        if (plans.length === 0) {
          console.log(`${colors.dim}No active plans${colors.reset}`);
        } else {
          console.log(`${colors.cyan}Active Plans:${colors.reset}`);
          plans.forEach(p => console.log(`  ${colors.green}•${colors.reset} ${p.title} [${p.status}]`));
        }
        break;

      // Task commands
      case '/tasks':
        const tasks = this.session.getPlans();
        if (tasks.length === 0) {
          console.log(`${colors.dim}No tasks${colors.reset}`);
        } else {
          console.log(`${colors.cyan}Tasks:${colors.reset}`);
          tasks.forEach(t => console.log(`  ${colors.green}•${colors.reset} ${t.title} [${t.status}]`));
        }
        break;
      case '/task':
        if (args.length > 0) {
          await this.session.createPlan(args.join(' '), '');
          console.log(`${colors.green}✓ Task created${colors.reset}`);
        }
        break;
      case '/agent':
        if (args.length > 0) {
          let role = 'general';
          let task = args.join(' ');
          const first = args[0].toLowerCase();
          if (['plan', 'review', 'debug', 'research', 'browser'].includes(first)) {
            role = first;
            task = args.slice(1).join(' ');
          }
          if (!task) {
            console.log(`${colors.dim}Usage: /agent [plan|review|debug|research|browser] <task>${colors.reset}`);
            break;
          }
          console.log(`${colors.cyan}Subagent:${colors.reset} ${role}`);
          await this.runAgent(role, task);
        } else {
          console.log(`${colors.dim}Usage: /agent [plan|review|debug|research|browser] <task>${colors.reset}`);
        }
        break;

      // Tool commands
      case '/read':
        if (args[0]) {
          const result = await this.tools.execute('Read', { file_path: path.resolve(this.projectPath, args[0]) });
          if (result.success) {
            console.log(result.content);
          } else {
            console.log(`${colors.red}Error: ${result.error}${colors.reset}`);
          }
        }
        break;
      case '/write':
        if (args.length > 1) {
          const [file, ...content] = args;
          const result = await this.tools.execute('Write', { file_path: path.resolve(this.projectPath, file), content: content.join(' ') });
          if (result.success) {
            console.log(`${colors.green}✓ Wrote ${file}${colors.reset}`);
          } else {
            console.log(`${colors.red}Error: ${result.error}${colors.reset}`);
          }
        }
        break;
      case '/bash':
        if (args.length > 0) {
          const result = await this.tools.execute('Bash', { command: args.join(' '), cwd: this.projectPath });
          if (result.success) {
            if (result.stdout) console.log(result.stdout);
            if (result.stderr) console.log(`${colors.yellow}${result.stderr}${colors.reset}`);
          } else {
            console.log(`${colors.red}Error: ${result.error}${colors.reset}`);
          }
        }
        break;
      case '/glob':
        if (args[0]) {
          const result = await this.tools.execute('Glob', { pattern: args[0], cwd: this.projectPath });
          if (result.success) {
            result.files.forEach(f => console.log(`  ${f}`));
          }
        }
        break;
      case '/grep':
        if (args[0]) {
          const result = await this.tools.execute('Grep', { pattern: args[0], path: this.projectPath });
          if (result.success) {
            result.matches.forEach(m => console.log(`  ${m}`));
          }
        }
        break;
      case '/image':
        if (args.length > 0) {
          const imgPath = path.resolve(this.projectPath, args[0]);
          try {
            const img = await this.loadImageAsBase64(imgPath);
            if (img) {
              const question = args.slice(1).join(' ') || 'Vui lòng phân tích hình ảnh này.';
              await this.chat(question, [img]);
            } else {
              console.log(`[31mKhông thể load ảnh: ${args[0]}[0m`);
            }
          } catch {
            console.log(`[31mLỗi xử lý ảnh[0m`);
          }
        } else {
          console.log(`[2mSử dụng: /image <file> [câu hỏi][0m`);
        }
        break;

      case '/paste':
        const clipText = await this.getClipboardContent();
        if (clipText) {
          console.log(`\x1b[35m[CLIPBOARD]\x1b[0m Đã nhận ${clipText.length} ký tự từ bộ nhớ đệm.`);
          const userQuery = args.join(' ') || 'Hãy đọc và phân tích nội dung sau:';
          await this.chat(`${userQuery}\n\n\`\`\`\n${clipText}\n\`\`\``);
        } else {
          console.log('\x1b[33mKhông tìm thấy văn bản trong bộ nhớ đệm hoặc bị lỗi.\x1b[0m');
        }
        break;

      // Design commands
      case '/design':
        const { DesignCommands } = await import('../design/commands.js');
        const design = new DesignCommands(this.session, this.config);
        await design.execute(args[0], args.slice(1));
        break;
      case '/designs':
        await this.showDesignSystems(args[0]);
        break;

      // Skills commands
      case '/skill':
        const { SkillManager } = await import('../skills/manager.js');
        const skills = new SkillManager(this.session);
        const skillList = await skills.listSkills();
        if (args[0] === 'list' || !args[0]) {
          console.log(`${colors.cyan}Skills:${colors.reset}`);
          skillList.forEach(s => console.log(`  ${s.icon} ${s.name} - ${s.description}`));
        }
        break;
      case '/skills':
        await this.showAllLocalSkills();
        break;

      // Plugin commands
      case '/plugin':
        const { PluginManager } = await import('../plugins/manager.js');
        const plugins = new PluginManager(this.session);
        const pluginList = await plugins.listPlugins();
        if (args[0] === 'list' || !args[0]) {
          console.log(`${colors.cyan}Plugins:${colors.reset}`);
          pluginList.forEach(p => console.log(`  ${p.icon} ${p.name} v${p.version}`));
        }
        break;
      case '/codex':
        await this.showResourceGroup('codex', args[0]);
        break;
      case '/claude':
        await this.showResourceGroup('claude', args[0]);
        break;
      case '/karpathy':
        await this.showKarpathyResources();
        break;
      case '/agents':
        await this.showAgentsFile();
        break;
      case '/resources':
        await this.showResourceManifest();
        break;

      // Provider commands
      case '/provider':
        if (args[0]) {
          const providerName = args[0];
          if (this.ai.setProvider(providerName)) {
            await this.config.setDefaultProvider(providerName);
            console.log(`${colors.green}✓ Provider: ${providerName}${colors.reset}`);
          } else {
            console.log(`${colors.red}Unknown provider: ${providerName}${colors.reset}`);
          }
        } else {
          console.log(`${colors.cyan}Provider: ${this.ai.getActiveProvider()}${colors.reset}`);
        }
        break;
      case '/providers':
        const providers = this.ai.listProviders();
        console.log(`${colors.cyan}Providers:${colors.reset}`);
        providers.forEach(p => {
          const status = p.ready ? `${colors.green}●${colors.reset}` : `${colors.red}○${colors.reset}`;
          console.log(`  ${status} ${p.name} (${p.model})`);
        });
        break;
      case '/models':
        await this.showModels();
        break;

      // Config commands
      case '/config':
        const cfg = await this.config.load();
        console.log(JSON.stringify(cfg, null, 2));
        break;
      case '/model':
        if (args[0]) {
          const providerName = this.ai.getActiveProvider();
          const model = args.join(' ');
          await this.config.setProviderModel(providerName, model);
          this.ai.providers[providerName].model = model;
          console.log(`${colors.green}✓ Model for ${providerName}: ${model}${colors.reset}`);
        } else {
          console.log(`${colors.cyan}Model: ${this.ai.providers[this.ai.getActiveProvider()]?.model}${colors.reset}`);
        }
        break;

      // Help & Exit
      case '/':
        this.showCommandMenu();
        break;
      case '/auto':
      case '/tdd':
        if (args.length > 0) {
          await this.runAutoHealing(args.join(' '));
        } else {
          console.log(`\x1b[33mSử dụng: /auto <yêu cầu code>\x1b[0m`);
        }
        break;
      case '/help':
      case '/?':
        this.showCommandMenu();
        break;
      case '/exit':
      case '/quit':
        this.running = false;
        console.log(`${colors.dim}Exiting...${colors.reset}`);
        if (!this.readlineClosed) this.rl.close();
        break;

      default:
        // Try partial match
        const match = SLASH_COMMANDS.find(c => c.cmd.startsWith(cmd));
        if (match) {
          console.log(`${colors.cyan}${match.cmd}${colors.reset} - ${match.desc}`);
          if (match.usage) console.log(`${colors.dim}Usage: ${match.usage}${colors.reset}`);
        } else {
          console.log(`${colors.red}Unknown command: ${cmd}${colors.reset}`);
          console.log(`${colors.dim}Type /help for available commands${colors.reset}`);
        }
    }
  }

  showCommandMenu() {
    const c = colors;
    const W = 78;
    const line = '─'.repeat(W - 2);
    const dline = '═'.repeat(W - 2);
    const row = (l, r) => {
      const ll = l.replace(/\x1b\[[0-9;]*m/g, '');
      const rl = r.replace(/\x1b\[[0-9;]*m/g, '');
      const pad = W - 4 - ll.length - rl.length;
      return `${c.magenta}│${c.reset} ${l}${' '.repeat(Math.max(1, pad))}${r} ${c.magenta}│${c.reset}`;
    };
    const header = (text) => {
      const tl = text.replace(/\x1b\[[0-9;]*m/g, '').length;
      const pad = W - 4 - tl;
      return `${c.magenta}│${c.reset} ${text}${' '.repeat(Math.max(0, pad))} ${c.magenta}│${c.reset}`;
    };
    const sep = `${c.magenta}├${line}┤${c.reset}`;
    console.log(`
${c.magenta}╭${line}╮${c.reset}
${header(`${c.bright}${c.cyan}❄ WINTER COMMANDS${c.reset}`)}
${sep}
${header(`${c.bright}Dự án & Phiên làm việc${c.reset}`)}
${row(`${c.yellow}/pwd${c.reset}     Thư mục hiện tại`, `${c.yellow}/session${c.reset}  Phiên làm việc`)}
${row(`${c.yellow}/cd${c.reset}      Đổi thư mục`, `${c.yellow}/clear${c.reset}    Xóa màn hình`)}
${row(`${c.yellow}/config${c.reset}  Xem cấu hình`, `${c.yellow}/exit${c.reset}     Thoát`)}
${sep}
${header(`${c.bright}AI & Công cụ${c.reset}`)}
${row(`${c.yellow}/auto${c.reset}    TDD tự sửa lỗi`, `${c.yellow}/agent${c.reset}   Chạy sub-agent`)}
${row(`${c.yellow}/read${c.reset}    Đọc file`, `${c.yellow}/write${c.reset}   Ghi file`)}
${row(`${c.yellow}/bash${c.reset}    Chạy lệnh terminal`, `${c.yellow}/grep${c.reset}    Tìm trong file`)}
${row(`${c.yellow}/glob${c.reset}    Tìm file theo pattern`, `${c.yellow}/image${c.reset}   Phân tích UI`)}
${row(`${c.yellow}/paste${c.reset}   Dán từ clipboard`, `${c.yellow}/plan${c.reset}    Lập kế hoạch`)}
${sep}
${header(`${c.bright}Git Auto-Pilot${c.reset}`)}
${row(`${c.yellow}/commit${c.reset}  AI tự viết commit`, `${c.yellow}/review${c.reset}  AI review code thay đổi`)}
${sep}
${header(`${c.bright}Cấu hình Model${c.reset}`)}
${row(`${c.yellow}/provider${c.reset} Đổi provider AI`, `${c.yellow}/model${c.reset}    Đổi model`)}
${row(`${c.yellow}/providers${c.reset} Danh sách provider`, `${c.yellow}/models${c.reset}   Danh sách model`)}
${sep}
${header(`${c.bright}Bộ nhớ & Kỹ năng${c.reset}`)}
${row(`${c.yellow}/remember${c.reset} Lưu vào bộ nhớ`, `${c.yellow}/memories${c.reset} Xem bộ nhớ`)}
${row(`${c.yellow}/skills${c.reset}  Danh sách kỹ năng`, `${c.yellow}/designs${c.reset}  Hệ thống thiết kế`)}
${c.magenta}╰${line}╯${c.reset}
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
        return byName(['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'TaskCreate', 'TaskUpdate', 'TaskList']);
    }
  }


  async runConversation(messages, label = 'Thinking', tools = null) {
    this.spinner = new Spinner(label + '...');
    this.spinner.start();

    const startedAt = Date.now();
    const previousTools = this.ai.tools;
    if (tools) this.ai.setTools(tools);

    let finalContent = '';
    let reachedToolLimit = true;
    let usedTools = false;
    const toolSummaries = [];
    const totalUsage = {};
    try {
      for (let i = 0; i < 8; i++) {
        if (this.isCancelled) throw new Error('AbortError');
        const turn = await this.requestAssistantTurn(messages, {
          model: this.ai.providers[this.ai.getActiveProvider()]?.model,
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

        const BOX_WIDTH = 80;
        const topLabel = ' AGENT TOOLS EXECUTION ';
        const topLeft = '╭─';
        const topRight = '─╮';
        const topPadLen = BOX_WIDTH - topLeft.length - topRight.length - topLabel.length;
        const topLine = `${topLeft}${colors.bright}${topLabel}${colors.reset}${colors.magenta}${'─'.repeat(Math.max(0, topPadLen))}${topRight}`;
        console.log(`\n${colors.magenta}${topLine}${colors.reset}`);
        messages.push({
          role: 'assistant',
          content: assistantMsg.content || '',
          tool_calls: this.formatToolCallsForMessage(toolCalls),
        });

        for (const tc of toolCalls) {
          const { toolName, toolArgs } = tc;
          const canonicalToolName = this.tools.normalizeToolName(toolName);
          const argParseError = toolArgs?.__toolArgParseError;
          const enrichedArgs = argParseError ? {} : this.enrichToolArgs(canonicalToolName, toolArgs, messages);

          const icon = canonicalToolName === 'Bash' ? '⚙' : canonicalToolName === 'Read' ? '📖' : canonicalToolName === 'Write' ? '✏️' : canonicalToolName === 'Edit' ? '🔧' : canonicalToolName === 'Grep' ? '🔍' : canonicalToolName === 'Glob' ? '📂' : '⚡';
          console.log(`${colors.magenta}│${colors.reset} ${icon} ${colors.cyan}${colors.bright}${toolName}${colors.reset}`);

          let proceed = true;
          if (canonicalToolName === 'Bash' && !argParseError) {
            const cmd = enrichedArgs.command || enrichedArgs.cmd || 'unknown';
            process.stdout.write(`${colors.magenta}│${colors.reset}   ${colors.yellow}⚠  AI muốn chạy: ${colors.bright}${cmd}${colors.reset}\n`);
            proceed = await new Promise(resolve => {
              this.rl.question(`${colors.magenta}│${colors.reset}   ${colors.yellow}Cho phép? [y/N]: ${colors.reset}`, answer => {
                resolve(answer.trim().toLowerCase() === 'y');
              });
            });
            if (!proceed) {
              console.log(`${colors.magenta}│${colors.reset}   ${colors.dim}Đã hủy lệnh.${colors.reset}`);
            }
          }

          let result;
          if (argParseError) {
            result = {
              success: false,
              error: `Invalid ${canonicalToolName} tool arguments JSON: ${toolArgs.__toolArgParseError}`,
              rawArgs: toolArgs.__rawToolArgs,
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

            const maxLen = BOX_WIDTH - 8;
            const lines = summary.split('\n');
            for (const line of lines) {
              if (line.length <= maxLen) {
                console.log(`${colors.magenta}│${colors.reset}   ${statusIcon} ${colors.dim}${line}${colors.reset}`);
              } else {
                // Word wrap
                let remaining = line;
                let first = true;
                while (remaining.length > 0) {
                  const chunk = remaining.substring(0, maxLen);
                  remaining = remaining.substring(maxLen);
                  const prefix = first ? statusIcon : ' ';
                  console.log(`${colors.magenta}│${colors.reset}   ${prefix} ${colors.dim}${chunk}${colors.reset}`);
                  first = false;
                }
              }
            }
          }
        }
        console.log(`${colors.magenta}╰${'─'.repeat(BOX_WIDTH - 1)}╯${colors.reset}\n`);
      }

      if (usedTools && !finalContent) {
        finalContent = await this.requestFinalAnswer(messages, toolSummaries, startedAt, totalUsage);
      }
    } finally {
      if (tools) this.ai.setTools(previousTools);
    }

    if ((reachedToolLimit || usedTools) && !finalContent) {
      if (this.spinner) this.spinner.stop();
      finalContent = this.buildToolFallbackAnswer(toolSummaries);
      console.log(`\n${colors.yellow}${finalContent}${colors.reset}\n`);
    }

    return finalContent;
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

    process.stdin.on('keypress', (_str, key = {}) => {
      if (key.ctrl || key.meta) return;

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
    if (key.name === 'tab' || key.name === 'return') {
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

    const suffix = item.usage ? ' ' : '';
    this.rl.write(null, { ctrl: true, name: 'u' });
    this.rl.write(item.cmd + suffix);
    this.closeSlashMenu();
    this.rl.prompt(true);
  }

  renderSlashMenu() {
    const matches = this.slashMenu.items;
    if (!matches.length) return;

    if (this.slashMenu.printedLines) {
      readline.moveCursor(process.stdout, 0, -this.slashMenu.printedLines);
      readline.clearScreenDown(process.stdout);
    }

    process.stdout.write('\n');
    process.stdout.write(`${colors.dim}Commands${colors.reset}\n`);
    matches.forEach((item, index) => {
      const usage = item.usage ? ` ${colors.dim}${item.usage}${colors.reset}` : '';
      const pointer = index === this.slashMenu.selected ? `${colors.green}>${colors.reset}` : ' ';
      process.stdout.write(`${pointer} ${colors.cyan}${item.cmd}${colors.reset} ${colors.dim}${item.desc}${colors.reset}${usage}\n`);
    });
    process.stdout.write(`${colors.dim}↑/↓ chọn · Enter/Tab dùng · Esc đóng${colors.reset}\n`);

    this.slashMenu.printedLines = matches.length + 3;
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
    const args = toolArgs && typeof toolArgs === 'object' ? { ...toolArgs } : {};
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
        return await this.streamFinalAnswer(finalMessages, startedAt, totalUsage);
      }

      const response = await this.ai.sendRequest(finalMessages, {
        model: this.ai.providers[this.ai.getActiveProvider()]?.model,
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

  async streamFinalAnswer(messages, startedAt, totalUsage) {
    let content = '';

    try {
      process.stdout.write(`\n${colors.white}`);
      let isFirst = true;
      for await (const chunk of this.ai.streamRequest(messages, {
        model: this.ai.providers[this.ai.getActiveProvider()]?.model,
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
      model: this.ai.providers[this.ai.getActiveProvider()]?.model,
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
    const elapsedMs = Math.max(0, Date.now() - startedAt);
    const seconds = (elapsedMs / 1000).toFixed(elapsedMs < 10000 ? 1 : 0);
    const tokenText = this.formatUsage(usage);
    return tokenText ? `Time: ${seconds}s · Tokens: ${tokenText}` : `Time: ${seconds}s · Tokens: n/a`;
  }

  addUsage(totalUsage, usage = {}) {
    if (!usage || typeof usage !== 'object') return totalUsage;

    const prompt = usage.prompt_tokens ?? usage.input_tokens;
    const completion = usage.completion_tokens ?? usage.output_tokens;
    const total = usage.total_tokens ?? (
      typeof prompt === 'number' || typeof completion === 'number'
        ? (prompt || 0) + (completion || 0)
        : undefined
    );

    if (typeof prompt === 'number') {
      totalUsage.prompt_tokens = (totalUsage.prompt_tokens || 0) + prompt;
    }
    if (typeof completion === 'number') {
      totalUsage.completion_tokens = (totalUsage.completion_tokens || 0) + completion;
    }
    if (typeof total === 'number') {
      totalUsage.total_tokens = (totalUsage.total_tokens || 0) + total;
    }

    return totalUsage;
  }

  formatUsage(usage = {}) {
    const prompt = usage.prompt_tokens;
    const completion = usage.completion_tokens;
    const total = usage.total_tokens;

    if (typeof total === 'number' && typeof prompt === 'number' && typeof completion === 'number') {
      return `${total} total (${prompt} in, ${completion} out)`;
    }
    if (typeof total === 'number') return `${total} total`;
    if (typeof prompt === 'number' || typeof completion === 'number') {
      return `${prompt || 0} in, ${completion || 0} out`;
    }
    return '';
  }

  buildToolFallbackAnswer(toolSummaries, errorMessage = '') {
    const lines = ['I used the requested tools but could not get a final model response.'];
    if (errorMessage) lines.push(`Final answer request failed: ${errorMessage}`);
    if (toolSummaries.length) {
      lines.push('Tool results:');
      lines.push(...toolSummaries.map(summary => `- ${summary}`));
    }
    return lines.join('\n');
  }

  formatToolResultForConsole(toolName, result) {
    if (!result) return '';
    if (result.success === false) {
      return `Tool failed: ${result.error || 'unknown error'}`;
    }

    switch (toolName) {
      case 'Read':
        return `Read ${result.path} (${result.lines} lines, ${result.size} chars)`;
      case 'Write':
        return result.diff ? `Wrote ${result.path}\n${result.diff}` : `Wrote ${result.path} (${result.size} chars)`;
      case 'Edit':
        return result.diff ? `Edited ${result.path}\n${result.diff}` : `Edited ${result.path} (${result.replacements} replacements)`;
      case 'Glob':
        return `Found ${result.count} file(s)`;
      case 'Grep':
        return `Found ${result.count} match(es)`;
      case 'Bash': {
        const output = (result.stdout || result.stderr || '').trim();
        return output.length > 1200 ? `${output.slice(0, 1200)}\n... truncated` : output;
      }
      case 'WebFetch':
        return `Fetched ${result.url} (${result.length} chars)`;
      case 'WebSearch':
        return `Found ${result.count} result(s)`;
      default:
        return result.message || '';
    }
  }

  normalizeToolCalls(toolCalls) {
    if (!Array.isArray(toolCalls)) return [];

    return toolCalls.map((tc, index) => {
      const fn = tc.function || {};
      const rawArgs = fn.arguments ?? tc.arguments ?? tc.input ?? {};

      return {
        ...tc,
        id: tc.id || `call-${index}`,
        toolName: fn.name || tc.name || tc.tool_name || tc.type,
        toolArgs: this.parseToolArguments(rawArgs),
      };
    });
  }

  extractInlineToolCalls(content) {
    const text = String(content || '');
    const toolCalls = [];
    let cleaned = text;
    const callPattern = /<minimax:tool_call>\s*<invoke\s+name=["']([^"']+)["']>([\s\S]*?)<\/invoke>\s*<\/minimax:tool_call>/gi;

    cleaned = cleaned.replace(callPattern, (_match, name, body) => {
      const args = {};
      const paramPattern = /<parameter\s+name=["']([^"']+)["']>([\s\S]*?)<\/parameter>/gi;
      let param;
      while ((param = paramPattern.exec(body))) {
        args[param[1]] = this.decodeXmlEntities(param[2].trim());
      }
      toolCalls.push({
        id: `inline-${Date.now()}-${toolCalls.length}`,
        type: 'function',
        function: {
          name,
          arguments: JSON.stringify(args),
        },
      });
      return '';
    }).trim();

    return { content: cleaned, toolCalls };
  }

  decodeXmlEntities(value) {
    return String(value || '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&');
  }

  parseToolArguments(rawArgs) {
    if (!rawArgs) return {};
    if (typeof rawArgs === 'object') return rawArgs;
    if (typeof rawArgs !== 'string') return {};

    const text = rawArgs.trim();
    if (!text) return {};

    try {
      return JSON.parse(text);
    } catch (error) {
      const extracted = this.extractFirstJsonObject(text);
      if (extracted && extracted !== text) {
        try {
          return JSON.parse(extracted);
        } catch {}
      }

      return {
        __toolArgParseError: error.message,
        __rawToolArgs: text.length > 800 ? `${text.slice(0, 800)}...` : text,
      };
    }
  }

  extractFirstJsonObject(text) {
    const start = text.indexOf('{');
    if (start === -1) return null;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === '{') depth++;
      if (ch === '}') {
        depth--;
        if (depth === 0) return text.slice(start, i + 1);
      }
    }

    return null;
  }

  formatToolCallsForMessage(toolCalls) {
    return toolCalls.map((tc) => ({
      id: tc.id,
      type: 'function',
      function: {
        name: tc.toolName || tc.function?.name || 'unknown',
        arguments: JSON.stringify(tc.toolArgs || {}),
      },
    }));
  }

  async chat(message, imageAttachments = []) {
    try {
      const needsTools = this.shouldUseTools(message, imageAttachments);
      const context = needsTools ? await this.getProjectContext() : '';
      const messages = [
        { role: 'system', content: needsTools ? this.getSystemPrompt(context) : this.getFastSystemPrompt() }
      ];

      const history = this.getPromptHistory({
        limit: needsTools ? 20 : 4,
        maxEntryChars: needsTools ? 2000 : 350,
        maxTotalChars: needsTools ? 12000 : 900,
      });
      for (const entry of history) {
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

      const tools = needsTools ? this.getAgentTools('general') : [];
      const finalContent = await this.runConversation(messages, 'Thinking', tools);

      await this.session.addToHistory({ role: 'user', content: message });
      await this.session.addToHistory({ role: 'assistant', content: finalContent });

    } catch (error) {
      console.log(`\n${colors.red}✖ Error: ${error.message}${colors.reset}\n`);
    }
  }

  shouldUseTools(message = '', imageAttachments = []) {
    if (imageAttachments.length > 0) return false;
    const text = String(message || '').toLowerCase();
    if (/[a-z]:[\\/]|\.([cm]?[jt]sx?|json|md|css|html|py|java|go|rs|php|rb|toml|ya?ml)\b/i.test(text)) {
      return true;
    }
    return /\b(read|write|edit|file|folder|repo|project|code|bug|fix|debug|test|build|run|git|commit|push|pull|npm|node|install|create|delete|copy|move|refactor|grep|glob|bash|terminal|powershell|deploy)\b|sửa|lỗi|đọc|thư mục|dự án|mã|kiểm tra|chạy|tạo|xóa|giao diện|ảnh|màn hình|đẩy|cài|build|test/i.test(text);
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
    const context = await this.getProjectContext();
    const messages = [
      { role: 'system', content: this.getAgentSystemPrompt(role, context) }
    ];

    const history = this.session.getHistory(20);
    for (const entry of history) {
      messages.push({ role: entry.role, content: entry.content });
    }

    messages.push({ role: 'user', content: `Task: ${task}` });

    const finalContent = await this.runConversation(messages, `Subagent [${role}]`, this.getAgentTools(role));

    await this.session.addToHistory({ role: 'user', content: `[subagent:${role}] ${task}` });
    await this.session.addToHistory({ role: 'assistant', content: finalContent });
  }

  async getProjectContext() {
    const context = [];
    const projectFiles = ['CLAUDE.md', 'WINTER.md', '.claude/CLAUDE.md', 'package.json'];

    for (const file of projectFiles) {
      try {
        const filePath = path.join(this.projectPath, file);
        const stat = await fs.stat(filePath);
        if (stat.isFile()) {
          const content = await fs.readFile(filePath, 'utf-8');
          context.push(`[${file}]\n${content.substring(0, 300)}...`);
        }
      } catch { }
    }

    // Git Context
    try {
      const { execSync } = await import('child_process');
      const gitStatus = execSync('git status --short', { cwd: this.projectPath, encoding: 'utf8', stdio: 'pipe' }).trim();
      if (gitStatus) {
        context.push(`[Git Status]\n${gitStatus}`);

        // Get brief git diff for context
        const gitDiff = execSync('git diff', { cwd: this.projectPath, encoding: 'utf8', stdio: 'pipe', maxBuffer: 1024 * 50 }).trim().split('\n').slice(0, 50).join('\n');
        if (gitDiff) {
          context.push(`[Git Diff]\n${gitDiff}\n...`);
        }
      }
    } catch (e) {
      // Not a git repo or git not installed
    }

    return context.join('\n\n') || 'No project context found.';
  }

  getSystemPrompt(context = '') {
    const memories = this.session.getMemory();
    const plans = this.session.getPlans();

    let memoryStr = memories.length > 0 ? `\n## Memories (Important Context)\n${memories.map(m => `- ${m.text}`).join('\n')}` : '';
    let plansStr = plans.length > 0 ? `\n## Active Plans & Tasks\n${plans.map(p => `- [${p.status}] ${p.title}: ${p.description}`).join('\n')}` : '';

    return `You are Winter, an expert AI coding assistant.

## CRITICAL AI RULES (MUST FOLLOW STRICTLY):
1. [THINKING BEFORE CODING]: Always output your thought process briefly before generating code. Think about edge cases, design structure, and syntax correctness.
2. [DESIGN EXCELLENCE]: Use rich aesthetics. Default to modern UI frameworks if applicable. Never output plain, ugly HTML/CSS. Ensure responsive, premium feel with micro-animations.
3. [CODE QUALITY]: Write clean, modular, SOLID code. Check for syntax errors carefully. Do not generate incomplete code blocks.
4. [NO HALLUCINATION]: If you don't know, use tools (Grep/Read/Web) to find out. Do not guess file paths or APIs.
5. [TOOL EXECUTION FIRST]: NEVER output full code blocks to the chat and tell the user to copy-paste. ALWAYS use the 'Write' or 'Edit' tool to apply changes directly to their files! The user cannot copy-paste code. You MUST do the work using tools.

## CRITICAL LANGUAGE RULE
**You MUST always respond in Vietnamese (tiếng Việt).** Never respond in Chinese, Japanese, Korean or any other language unless the user explicitly asks you to. This is non-negotiable.

## Core Principles
1. **Think Before Coding** - State assumptions, ask when unclear
2. **Simplicity First** - Minimum code that solves the problem
3. **Surgical Changes** - Touch only what you must
4. **Goal-Driven Execution** - Define success criteria, verify results

## Tools Available
- Read, Write, Edit - File operations
- Write - Create/overwrite files directly. Use this instead of Bash echo/cat/heredoc for writing code.
- Edit - Replace exact text in existing files.
- Bash - Execute shell commands. Current OS is ${process.platform === 'win32' ? 'Windows; Bash auto-detects PowerShell and cmd.exe syntax. Use shell="powershell" or shell="cmd" when needed.' : process.platform}.
- Glob - Find files
- Grep - Search content
- TaskCreate, TaskUpdate, TaskList - Task management
- WebFetch, WebSearch - Research
- Vision - Analyze images/screenshots for debugging

## Guidelines
- Call tools when they help - be proactive
- You DO have file write tools. Never say "there is no write tool"; use Write or Edit.
- If a tool name fails, call the canonical tool name next: Write, Edit, Read, Bash, Glob, or Grep.
- On Windows, Bash accepts both PowerShell and cmd.exe commands. Prefer Write with full content for file writes.
- After using tools, always provide a direct final answer to the user.
- Never claim that you changed files unless a Write, Edit, Bash, or equivalent tool result shows the change succeeded in this turn.
- Never emit XML or provider-specific pseudo tool syntax like <minimax:tool_call>. Use the actual tool-calling API only.
- If a file path is unknown, search with Glob/Grep first instead of inventing names like Nav.tsx or Footer.tsx.
- Answer normal questions directly without unnecessary legal or policy disclaimers.
- If a request is illegal, unsafe, or harmful, refuse briefly and offer a safe alternative.
- Read files before modifying
- Make surgical changes
- Verify your work
- Follow project conventions (check CLAUDE.md)
- When user attaches an image, analyze it carefully for UI bugs, errors, layout issues

## Project
Working directory: ${this.projectPath}
Current session: ${this.session.getSessionId().substring(0, 8)}
${memoryStr}${plansStr}
${context ? `\n## Project Context\n${context}` : ''}

Be helpful, be precise, and get things done. Always respond in Vietnamese.`;
  }

  getFastSystemPrompt() {
    const memories = this.session.getMemory();
    const memoryStr = memories.length > 0
      ? `\nContext nhớ ngắn:\n${memories.slice(-8).map(m => `- ${m.text}`).join('\n')}`
      : '';

    return `Bạn là Winter, trợ lý AI trả lời ngắn gọn bằng tiếng Việt.
Trả lời trực tiếp, không gọi tool, không tự bịa thông tin.
Nếu người dùng yêu cầu sửa file/chạy lệnh/đọc dự án thì nói ngắn rằng cần dùng chế độ tool.${memoryStr}`;
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
    const memories = this.session.getMemory();
    const plans = this.session.getPlans();

    let memoryStr = memories.length > 0 ? `\n## Memories (Important Context)\n${memories.map(m => `- ${m.text}`).join('\n')}` : '';
    let plansStr = plans.length > 0 ? `\n## Active Plans & Tasks\n${plans.map(p => `- [${p.status}] ${p.title}: ${p.description}`).join('\n')}` : '';

    let rolePrompt = '';
    switch (role) {
      case 'plan':
        rolePrompt = `You are a Winter planning subagent. Break the request into a concise step-by-step plan, note dependencies, and keep the response short.`;
        break;
      case 'review':
        rolePrompt = `You are a Winter review subagent. Critique the request or implementation with specific issues, edge cases, and concrete improvements.`;
        break;
      case 'debug':
        rolePrompt = `You are a Winter debugging subagent. Focus on root cause, reproduction, and the smallest fix.`;
        break;
      case 'research':
        rolePrompt = `You are a Winter research subagent. Gather the important facts, compare options, and summarize only what matters.`;
        break;
      case 'browser':
        rolePrompt = `You are a Winter browser subagent. Bạn CÓ QUYỀN sử dụng tool 'BrowserDebug' để tương tác với trình duyệt. Hãy dùng nó để mở URL, chụp ảnh màn hình (nếu cần), hoặc chạy JS để kiểm tra trang web.`;
        break;
      default:
        rolePrompt = `You are a Winter coding subagent. Solve the task directly, use tools when needed, and return a concise result.`;
        break;
    }

    return `## CRITICAL AI RULES (MUST FOLLOW STRICTLY):
1. [THINKING BEFORE CODING]: Always output your thought process briefly before generating code. Think about edge cases, design structure, and syntax correctness.
2. [DESIGN EXCELLENCE]: Use rich aesthetics. Default to modern UI frameworks if applicable. Never output plain, ugly HTML/CSS. Ensure responsive, premium feel with micro-animations.
3. [CODE QUALITY]: Write clean, modular, SOLID code. Check for syntax errors carefully. Do not generate incomplete code blocks.
4. [NO HALLUCINATION]: If you don't know, use tools (Grep/Read/Web) to find out. Do not guess file paths or APIs.
5. [TOOL EXECUTION FIRST]: You DO have file tools. Use Write to create/overwrite files and Edit to patch files. Never say there is no write tool.

${rolePrompt}

## Tool Rules
- Canonical tools: Read, Write, Edit, Bash, Glob, Grep, TaskCreate, TaskUpdate, TaskList, BrowserDebug, WebFetch, WebSearch.
- Current OS is ${process.platform === 'win32' ? 'Windows; Bash auto-detects PowerShell and cmd.exe syntax. Use shell="powershell" or shell="cmd" when needed.' : process.platform}.
- Prefer Write/Edit for writing files. Bash accepts both PowerShell and cmd.exe on Windows, but do not use long echo chains for code files.
- If a tool call fails because of an unknown alias, call the canonical tool name next.

## Project
Working directory: ${this.projectPath}
Current session: ${this.session.getSessionId().substring(0, 8)}
${memoryStr}${plansStr}
${context ? `\n## Project Context\n${context}` : ''}`;
  }

  getAgentTools(role) {
    // Trả về tất cả công cụ hiện có trong executor
    return this.tools.getToolDefinitions();
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
