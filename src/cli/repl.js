/**
 * WINTER REPL
 * Claude Code / Codex style interactive REPL
 */

import readline from 'readline';
import { promises as fs, watch as fsWatch } from 'fs';
import { homedir } from 'os';
import { colors, applyColorTheme, welcomeBanner } from './snowflake-logo.js';
import { renderBox, supportsUnicodeUi, terminalWidth, stripAnsi, wrapText, padVisible } from './terminal-ui.js';
import {
  buildTuiSnapshot,
  renderAssistantPanel,
  renderConversationStartup,
  renderLandingTui,
  renderStartupTui,
  renderStatusPanel,
} from './tui.js';
import { WinterInputController } from './input-controller.js';
import { ToolExecutor } from '../tools/executor.js';
import { SessionManager } from '../session/manager.js';
import { AIProviderManager } from '../ai/providers.js';
import { ConfigLoader } from './config.js';
import { PermissionManager } from '../tools/permission.js';
import { MCPClient } from '../mcp/client.js';
import { getMcpPreset, upsertMcpServer } from '../mcp/presets.js';
import { compressConversation } from '../context/compress.js';
import { getToolUsageSummary } from '../tools/analytics.js';
import { SweAgent } from '../agent/swe-agent.js';
import { AgentDefinitionRegistry } from '../agent/agent-definitions.js';
import { AgentRuntime } from '../agent/runtime.js';
import { SLASH_COMMANDS } from './slash-commands.js';
import { formatMarkdown } from './markdown-format.js';
import { Spinner } from './spinner.js';
import { ContextLoader } from './context-loader.js';
import { PromptBuilder } from './prompt-builder.js';
import { buildProjectDocs, isWinterGeneratedProjectDoc } from './project-docs.js';
import {
  buildPromptToolResult as buildPromptToolResultForModel,
  buildPromptToolResultWithTokenJuice,
} from './tool-runtime.js';
import { TokenJuice } from '../context/token-juice.js';
import { classifyModelTier, getModelBudgetMultiplier } from '../ai/model-capabilities.js';
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
import { CodebaseSearch } from '../codebase-index/search.js';
import { CodebaseWatcher } from '../codebase-index/watcher.js';
import { AtContextResolver } from './at-context.js';
import { DiffView } from './diff-view.js';
import { Composer } from './composer.js';
import { InlineComplete } from '../mcp/inline-complete.js';
import { Orchestrator } from '../ai/orchestrator.js';
import { ECCManager } from './ecc.js';
import { handleSlashCommand } from './repl-commands.js';
import { selectWorkflow } from '../ai/workflow-selector.js';
import { buildSmallModelAmplification } from '../ai/small-model-amplifier.js';
import { getProfileBlueprint } from '../ai/profile-blueprints.js';
import {
  getCapabilityScorecard as getCapabilityScorecardReport,
  runFullDoctor as runFullDoctorDiagnostics,
  runToolDoctor as runToolDoctorDiagnostics,
  showCapabilityScorecard as showCapabilityScorecardDiagnostics,
  showContextDiagnostics as showContextDiagnosticsReport,
} from './diagnostics.js';
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
    this.currentAbortController = null;
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
    this.codebaseSearcher = null;
    this.codebaseWatcher = null;
    this.atContext = null;
    this.diffView = null;
    this.composer = null;
    this.inlineComplete = null;
    this.eccManager = null;
    this.orchestrator = null;
    this.tokenJuice = new TokenJuice({ projectPath: this.projectPath });
    this.agentRegistry = new AgentDefinitionRegistry({ projectPath: this.projectPath });
    this.agentRuntime = new AgentRuntime(this);
    this.useUnicodeUi = supportsUnicodeUi();
    this.inputController = new WinterInputController(this);
    this.watchers = [];
    this.startupNotices = [];
    this.projectContextSafety = null;
  }

  async initCodebaseSearch() {
    if (this.codebaseSearcher) return;
    this.codebaseSearcher = new CodebaseSearch({
      projectPath: this.projectPath,
      enableCodeGraph: process.env.WINTER_CODEGRAPH !== '0',
    });
    await this.codebaseSearcher.init();
    this.atContext = new AtContextResolver({
      projectPath: this.projectPath,
      codebaseSearch: this.codebaseSearcher,
      tools: this.tools,
    });
    this.diffView = new DiffView({ projectPath: this.projectPath });
    this.composer = new Composer({
      repl: this,
      projectPath: this.projectPath,
      diffView: this.diffView,
    });
    this.inlineComplete = new InlineComplete({
      repl: this,
      projectPath: this.projectPath,
    });
    this.orchestrator = new Orchestrator({
      ai: this.ai,
      tools: this.tools,
      projectPath: this.projectPath,
    });
    this.eccManager = new ECCManager({
      projectPath: this.projectPath,
      tools: this.tools,
      config: this.config,
    });
  }

  startupNotice(message) {
    const text = String(message || '').trim();
    if (!text) return;
    this.startupNotices.push(text);
    if (this.startupNotices.length > 6) {
      this.startupNotices = this.startupNotices.slice(-6);
    }
  }

  async shouldUseHeavyProjectContext() {
    if (this.projectContextSafety !== null) return this.projectContextSafety;
    this.projectContextSafety = await this.shouldAutoIndexCodebase();
    return this.projectContextSafety;
  }

  shouldUseCodebaseContextForTask(task = '') {
    const text = String(task || '').trim();
    if (!text) return false;

    // Keep casual chat fast and safe. Codebase indexing/search is pulled in only
    // when the task is likely about project files, code, debugging, tests, or
    // explicit @ references. This preserves strong project awareness for coding
    // work without making first-run greetings index an entire repository.
    if (/@[\w./\\-]+/.test(text)) return true;
    if (/\b\w+\.(js|jsx|ts|tsx|mjs|cjs|json|md|py|java|go|rs|php|rb|cs|cpp|c|h|css|scss|html|vue|svelte|sql|yaml|yml|toml)\b/i.test(text)) return true;
    if (/\b[a-z]+[A-Z][A-Za-z0-9_$]*\b/.test(text)) return true;

    return /\b(code|source|file|function|class|method|symbol|import|export|module|component|route|api|endpoint|bug|error|exception|stack|trace|crash|fail|failing|test|tests|build|compile|lint|typecheck|debug|fix|patch|edit|modify|refactor|implement|implementation|feature|find|locate|search|git|diff|commit|package|dependency|repl|cli|tool|provider|stream|index|grep|read|write|s?a|sua|l?i|loi|t?o|tao|th?m|them|x?a|xoa|ki?m tra|kiem tra|ch?y|chay|bi?n d?ch|bien dich|h?m|ham|d? ?n|du an)\b/i.test(text);
  }

  async shouldAutoIndexCodebase() {
    const root = path.resolve(this.projectPath || process.cwd());
    const home = path.resolve(homedir());
    const parent = path.dirname(root);

    // Do not auto-scan broad user/drive roots. On a fresh global install,
    // running `winter` from C:\Users\name can otherwise index the whole home
    // directory and exhaust the Node heap before the first AI response.
    if (root === home || root === parent) return false;

    const markers = [
      'package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'pom.xml',
      'build.gradle', 'composer.json', 'Gemfile', '.git', 'winter.md', 'CLAUDE.md',
    ];

    for (const marker of markers) {
      try {
        await fs.stat(path.join(root, marker));
        return true;
      } catch {}
    }

    return false;
  }

  async startCodebaseWatcher() {
    if (this.codebaseWatcher) return;
    await this.initCodebaseSearch();
    this.codebaseWatcher = new CodebaseWatcher({
      projectPath: this.projectPath,
      indexer: this.codebaseSearcher.indexer,
    });
    this.codebaseWatcher.onChange(({ filePath }) => {
      // Re-index on change (handled by watcher internally)
    });
    this.codebaseWatcher.start({ debounce: true });
  }

  async codebaseIndex(full = false) {
    await this.initCodebaseSearch();
    if (full) {
      await this.codebaseSearcher.clear();
    }
    const stats = await this.codebaseSearcher.reindex();
    console.log(`${colors.green}✓ Codebase indexed:${colors.reset}`);
    console.log(`  ${colors.dim}Files: ${stats.totalFiles}, Chunks: ${stats.totalChunks}, Indexed: ${stats.indexedFiles}, Skipped: ${stats.skipped}${colors.reset}`);
  }

  async codebaseSearch(query) {
    await this.initCodebaseSearch();
    this.spinner = new Spinner('Searching codebase...');
    this.spinner.start();
    try {
      const results = await this.codebaseSearcher.query(query, { limit: 15 });
      if (this.spinner) this.spinner.stop();

      if (results.totalResults === 0) {
        console.log(`${colors.yellow}No results found for "${query}"${colors.reset}`);
        return;
      }

      console.log(`${colors.cyan}Codebase Search: "${query}" ${colors.dim}(${results.totalResults} matches in ${results.totalFiles} files)${colors.reset}\n`);
      for (const file of results.byFile.slice(0, 10)) {
        console.log(`  ${colors.green}${file.filePath}${colors.reset} ${colors.dim}(score: ${file.score.toFixed(0)})${colors.reset}`);
        for (const chunk of file.chunks.slice(0, 3)) {
          const snippet = chunk.content.split('\n').slice(0, 3).join('\n  ');
          console.log(`    ${colors.dim}lines ${chunk.startLine}-${chunk.endLine}:${colors.reset}`);
          console.log(`    ${colors.dim}  ${snippet}${colors.reset}`);
        }
        if (file.chunks.length > 3) {
          console.log(`    ${colors.dim}... and ${file.chunks.length - 3} more chunks${colors.reset}`);
        }
        console.log('');
      }
      if (results.byFile.length > 10) {
        console.log(`${colors.dim}... and ${results.byFile.length - 10} more files${colors.reset}`);
      }
    } catch (e) {
      if (this.spinner) this.spinner.stop();
      console.log(`${colors.red}Search error: ${e.message}${colors.reset}`);
    }
  }

  async codebaseFindDef(name) {
    await this.initCodebaseSearch();
    const matches = await this.codebaseSearcher.findSymbol(name, { limit: 10 });

    if (matches.length === 0) {
      console.log(`${colors.yellow}No definition found for "${name}"${colors.reset}`);
      return;
    }

    console.log(`${colors.cyan}Definitions for "${name}"${colors.reset}\n`);
    for (const m of matches) {
      console.log(`  ${colors.green}${m.filePath}:${m.line}${colors.reset} ${colors.dim}${m.type}:${m.name}${colors.reset}`);
      if (m.content) {
        console.log(`    ${colors.dim}${m.content}${colors.reset}`);
      }
    }
  }

  async ensureCodebaseIndex({ verbose = false, force = false } = {}) {
    if (!force && !await this.shouldAutoIndexCodebase()) {
      return { totalChunks: 0, totalFiles: 0, skipped: true, reason: 'unsafe-project-root' };
    }
    await this.initCodebaseSearch();
    const before = this.codebaseSearcher.indexer.getStats();
    if (before.totalChunks > 0) return before;

    if (verbose) {
      console.log(`${colors.dim}Indexing codebase for semantic search...${colors.reset}`);
    }
    const indexedStats = await this.codebaseSearcher.reindex();
    if (verbose) {
      console.log(`${colors.green}✓ Codebase indexed: ${indexedStats.totalFiles} files, ${indexedStats.totalChunks} chunks${colors.reset}`);
    }
    return this.codebaseSearcher.indexer.getStats();
  }

  async buildCodebaseContext(task = '') {
    try {
      const modelTier = this.getActiveModelTier();
      const stats = await this.ensureCodebaseIndex({ verbose: false });
      if (!stats.totalChunks) return '';

      const summary = this.codebaseSearcher.getSummary();
      const lines = [
        '[Codebase Index]',
        `Project: ${this.projectPath}`,
        `Indexed files: ${summary.totalFiles}, chunks: ${summary.totalChunks}`,
      ];

      if (summary.languages?.length) {
        lines.push(`Languages: ${summary.languages.map(([lang, count]) => `${lang}:${count}`).join(', ')}`);
      }

      if (summary.topSymbols?.length) {
        lines.push('Top symbol files:');
        for (const file of summary.topSymbols.slice(0, 8)) {
          lines.push(`- ${file.filePath}: ${file.symbols.join(', ')}`);
        }
      }

      const query = String(task || '').trim();
      if (query.length >= 3) {
        const results = await this.codebaseSearcher.query(query, { limit: 8 });
        if (results.byFile.length > 0) {
          lines.push('');
          lines.push('[Relevant Codebase Matches]');
          for (const file of results.byFile.slice(0, 5)) {
            const snippets = file.chunks.slice(0, 2).map(chunk => {
              const snippet = chunk.content.split(/\r?\n/).slice(0, 4).join(' ').replace(/\s+/g, ' ');
              return `lines ${chunk.startLine}-${chunk.endLine}: ${this.compactText(snippet, 240, 'codebase match')}`;
            });
            lines.push(`- ${file.filePath} (score ${file.score.toFixed(0)})`);
            for (const snippet of snippets) lines.push(`  ${snippet}`);
          }
        }
      }

      return this.compactText(lines.join('\n'), this.getCodebaseContextBudget(modelTier), 'codebase context');
    } catch (error) {
      return `[Codebase Index]\nUnavailable: ${error.message}`;
    }
  }

  async undoLastChange(filePath = '') {
    await this.initCodebaseSearch();
    const backups = await this.diffView.getUndoHistory(filePath);

    if (backups.length === 0) {
      console.log(`${colors.yellow}No backups found${filePath ? ` for ${filePath}` : ''}${colors.reset}`);
      return;
    }

    console.log(`${colors.cyan}Recent backups:${colors.reset}\n`);
    for (const b of backups.slice(0, 10)) {
      const time = new Date(b.time).toLocaleString();
      console.log(`  ${colors.dim}${b.backup}${colors.reset}`);
      console.log(`    ${colors.dim}Original: ${b.original}, ${time}${colors.reset}`);
    }

    // Offer to undo the most recent one
    const latest = backups[0];
    console.log(`\n${colors.yellow}Restore ${latest.original} from backup? ${colors.reset}`);
    console.log(`  ${colors.dim}Backup: ${latest.backup}${colors.reset}`);

    const { default: rl } = await import('readline');
    const rli = rl.createInterface({ input: process.stdin, output: process.stdout });
    rli.question(`${colors.cyan}[y/N]: ${colors.reset}`, async (ans) => {
      rli.close();
      if (ans.trim().toLowerCase() === 'y') {
        const ok = await this.diffView.restoreFromBackup(latest.backup, latest.original);
        if (ok) {
          console.log(`${colors.green}✓ Restored ${latest.original} from backup${colors.reset}`);
        } else {
          console.log(`${colors.red}Failed to restore${colors.reset}`);
        }
      }
      if (!this.readlineClosed) this.showInputPrompt();
    });
  }

  buildPromptToolResult(toolName, result) {
    return buildPromptToolResultForModel({
      toolName,
      result,
      compact: this.shouldUseCompactPrompt(),
      modelTier: this.getActiveModelTier(),
      compactText: (text, maxChars, label) => this.compactText(text, maxChars, label),
      summarizeToolResult: value => this.tools?.summarizeToolResult?.(value) || { ...value },
    });
  }

  async buildPromptToolResultForModel(toolName, result) {
    const modelTier = this.getActiveModelTier();
    const tokenJuice = this.getTokenJuiceForModelTier(modelTier);
    return buildPromptToolResultWithTokenJuice({
      toolName,
      result,
      projectPath: this.projectPath,
      tokenJuice,
      compact: this.shouldUseCompactPrompt(),
      modelTier,
      compactText: (text, maxChars, label) => this.compactText(text, maxChars, label),
      summarizeToolResult: value => this.tools?.summarizeToolResult?.(value) || { ...value },
    });
  }

  async compactStartupMemories({ projectInstructionFiles = [], autoCreateDocs = [] } = {}) {
    const memory = Array.isArray(this.session?.memory) ? this.session.memory : [];
    const shouldDrop = (entry) => {
      const text = typeof entry === 'string' ? entry : entry?.text || '';
      return text.startsWith('[Required local resources]')
        || text.startsWith('[Auto-applied skills]')
        || text.startsWith('[Project rule file')
        || text.startsWith('[Startup local resource index]')
        || (text.startsWith('[T') && text.includes('ghi nh'))
        || text.startsWith('[Quy');
    };

    this.session.memory = memory.filter(entry => !shouldDrop(entry));

    const resourcePaths = this.getResourcePaths();
    const resourceIndex = [
      `agents.md: ${resourcePaths.agents}`,
      `awesome-design-md: ${resourcePaths.designs}`,
      `karpathy-tools: ${resourcePaths.karpathy}`,
      `page-agent: ${resourcePaths.pageAgent}`,
      `ecc: ${resourcePaths.ecc}`,
    ];
    await this.session.replaceMemory(
      '[Startup local resource index]',
      [
        'Resources are indexed by path only to save tokens.',
        ...resourceIndex.map(item => `- ${item}`),
        'Use Read/Grep/Glob to inspect exact resource files when a task needs detail.',
      ].join('\n'),
      'resource'
    );

    const docs = [
      ...projectInstructionFiles.map(file => ({
        filename: file.relativePath,
        filePath: file.filePath,
        content: file.content,
      })),
      ...autoCreateDocs.map(doc => ({
        filename: doc.filename,
        filePath: path.join(this.projectPath, doc.filename),
        content: doc.content,
      })),
    ];

    const seen = new Set();
    for (const doc of docs) {
      if (!doc?.filename || seen.has(doc.filename)) continue;
      seen.add(doc.filename);
      const summary = this.compactText(String(doc.content || '').replace(/\s+/g, ' ').trim(), 700, doc.filename);
      await this.session.replaceMemory(
        `[Project rule file ${doc.filename}]`,
        `Path: ${doc.filePath}\nSummary: ${summary}`,
        'rule'
      );
    }
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

  applyUiTheme(theme = 'dark') {
    return applyColorTheme(theme);
  }

  async start() {
    await this.session.init({ project: this.projectPath, sessionId: this.sessionId });
    const startupConfig = await this.config.load();
    this.applyUiTheme(startupConfig.ui?.theme || 'dark');
    await this.ai.init();

    await this.session.updateContext('projectAnchor', {
      path: this.projectPath,
      name: path.basename(this.projectPath),
      openedAt: new Date().toISOString(),
    });
    await this.session.replaceMemory('[Project Anchor]', `Current project is ${this.projectPath}. Treat this path as the canonical working directory for the session.`, 'info');

    // Tự động đọc và ghi nhớ một số tài nguyên cục bộ an toàn.
    const fsPromises = await import('fs/promises');
    const resourcePaths = this.getResourcePaths();
    const autoLoadTargets = [resourcePaths.agents, resourcePaths.designs, resourcePaths.karpathy, resourcePaths.pageAgent];

    for (const targetPath of autoLoadTargets) {
      try {
        const stat = await fsPromises.stat(targetPath).catch(() => null);
        if (!stat) continue;

        if (stat.isFile()) {
          const content = await fsPromises.readFile(targetPath, 'utf8');
          const fileName = path.basename(targetPath);
          const memoryKey = `[Tự động ghi nhớ file ${fileName}]`;
          await this.session.replaceMemory(memoryKey, content);
          this.startupNotice(`loaded ${fileName}`);
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
                this.startupNotice(`loaded ${path.basename(targetPath)}/${c}`);
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
          this.startupNotice(`rules ${file.relativePath}`);
        }
      }
    } catch (e) {
      // Nếu không có, tự động tạo file mẫu.
      const template = `# Winter Project Rules

## Project Overview
- **Name**: [Tên dự án]
- **Description**: [Mô tả ngắn về dự án]

## Tech Stack
- **Languages**: JavaScript / TypeScript
- **Runtime**: Node.js
- **Frameworks**: [Tự điền nếu có, VD: Express, React...]

## AI Behavior & Coding Guidelines

### 1. Nguyên tắc Code (Coding Standards)
- Luôn ưu tiên viết code sạch (Clean Code), dễ đọc và dễ bảo trì.
- Sử dụng ES Modules (\`import/export\`) thay vì CommonJS (\`require\`) trừ khi có lý do đặc biệt.
- Giữ nguyên các comment và JSDoc hiện có trong file trừ khi được yêu cầu sửa.

### 2. Tương tác với người dùng (User Interaction)
- Luôn giải thích ngắn gọn lý do thực hiện thay đổi trước khi sửa file.
- Khi gặp lỗi, hãy đề xuất giải pháp thay vì chỉ báo lỗi.
- Không tự tiện xóa code cũ của user trừ khi chắc chắn không còn dùng hoặc được yêu cầu.

### 3. Git & Commits
- Viết commit message theo chuẩn Conventional Commits (VD: \`feat:\`, \`fix:\`, \`docs:\`).
- Luôn kiểm tra \`git status\` trước khi thực hiện thay đổi lớn.

### 4. Xử lý File (File Operations)
- Chỉ sửa những dòng cần thiết, tránh viết lại toàn bộ file nếu không cần.
- Luôn đảm bảo file không bị lỗi cú pháp sau khi sửa.
`;
      try {
        const projectWinterMd = path.join(this.projectPath, 'winter.md');
        await fsPromises.writeFile(projectWinterMd, template, 'utf8');
        this.startupNotice('created winter.md');

        
        // Nạp luôn vào memory.
        await this.session.replaceMemory(`[Quy tắc dự án từ winter.md]`, template);
      } catch (err) {
        // Bỏ qua nếu không ghi được file.
      }
    }

    // Tự động tạo design.md, skill.md, rule.md nếu chưa có.
    const autoCreateDocs = await buildProjectDocs({
      projectPath: this.projectPath,
      resourcePaths: this.getResourcePaths(),
      userResourcePaths: this.getUserResourcePaths(),
      contextLoader: this.contextLoader,
      readProjectInstructionFiles: () => this.readProjectInstructionFiles(),
    });

    for (const doc of autoCreateDocs) {
      const filePath = path.join(this.projectPath, doc.filename);
      try {
        const existing = await fsPromises.readFile(filePath, 'utf8');
        if (!isWinterGeneratedProjectDoc(existing)) continue;

        await fsPromises.writeFile(filePath, doc.content, 'utf8');
        this.startupNotice(`updated ${doc.filename}`);
        const memoryKey = `[Quy tắc dự án từ ${doc.filename}]`;
        await this.session.replaceMemory(memoryKey, doc.content);
      } catch {
        try {
          await fsPromises.writeFile(filePath, doc.content, 'utf8');
          this.startupNotice(`created ${doc.filename}`);
          const memoryKey = `[Quy tắc dự án từ ${doc.filename}]`;
          await this.session.replaceMemory(memoryKey, doc.content);
        } catch (err) {
          // Bỏ qua nếu không tạo được.
        }
      }
    }

    await this.bootstrapProjectCapabilities();
    await this.compactStartupMemories({ projectInstructionFiles, autoCreateDocs });

    // Codebase Index is intentionally lazy/on-demand. Top-tier coding agents do
    // not make first-run chat pay for a repo-wide scan, and this also prevents
    // global installs launched from broad folders from exhausting Node's heap.
    // Codebase context is still available when a coding/debug task needs it via
    // getProjectContext() -> buildCodebaseContext() -> ensureCodebaseIndex().
    if (await this.shouldAutoIndexCodebase()) {
      this.startupNotice('codebase index ready on demand');
    } else {
      this.startupNotice('codebase auto-index skipped outside a project folder');
    }

    const sessionHistory = this.session.getHistory(4);
    if (sessionHistory.length > 0) {
      this.startupNotice(`${sessionHistory.length} recent messages`);
    }

    this.showStatus();

    // Setup readline
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: `${colors.bright}${colors.cyan}winter > ${colors.reset}`,
      completer: this.completer.bind(this),
    });
    this.inputController.installSlashSuggestions();

    // Bắt sự kiện Ctrl+C để in ra lệnh tiếp tục session.
    this.rl.on('SIGINT', () => {
      console.log(`\n\n${colors.cyan}Cảm ơn đã sử dụng Winter!${colors.reset}`);
      console.log(`${colors.yellow}Tiếp tục phiên làm việc:${colors.reset}`);
      console.log(`${colors.bright}${colors.green}winter --session ${this.session.getSessionId()}${colors.reset}\n`);
      process.exit(0);
    });

    // Hiển thị prompt lần đầu tiên ngay khi khởi động xong.
    this.showInputPrompt();

    // Paste buffer: gom nhiều dòng paste nhanh thành 1 tin nhắn
    this._multilineBuffer = [];
    this._pasteBuffer = [];
    this._pasteTimer = null;
    this._isPasteChunk = false;
    this._pasteChunkTimer = null;
    const PASTE_DELAY = 80;

    process.stdin.on('data', (chunk) => {
      const text = chunk.toString('utf8');
      const newlineCount = (text.match(/\r?\n/g) || []).length;

      // A normal submitted line can arrive as one chunk like "hello\n".
      // Treat only real multi-line chunks as paste, otherwise REPL input
      // gets stuck in multiline mode and never reaches the AI.
      if (newlineCount > 1) {
        this._isPasteChunk = true;
        if (this._pasteChunkTimer) clearTimeout(this._pasteChunkTimer);
        this._pasteChunkTimer = setTimeout(() => {
          this._isPasteChunk = false;
        }, 150);
      }
    });

    const flushPasteBuffer = () => {
      this._pasteTimer = null;
      if (this._pasteBuffer.length === 0) return;

      const isSingleLineInput = this._pasteBuffer.length === 1 && this._multilineBuffer.length === 0;
      const isJustEmptyEnter = this._pasteBuffer.length === 1 && this._pasteBuffer[0].trim() === '';

      // Normal single-line submit
      if (isSingleLineInput && this._multilineBuffer.length === 0) {
        const line = this._pasteBuffer[0].trim();
        this._pasteBuffer = [];
        if (!line) {
          if (this.running && !this.readlineClosed) {
            readline.moveCursor(process.stdout, 0, -1);
            readline.clearLine(process.stdout, 0);
            this.rl.prompt(true);
          }
          return;
        }
        
        // Command to enter multiline mode manually
        if (line === '/multi' || line === '/m') {
          this._multilineBuffer.push('');
          console.log(`${colors.cyan}│ ${colors.dim}[ Đã bật chế độ gõ nhiều dòng. Nhấn Enter 2 lần (dòng trống) để gửi. ]${colors.reset}`);
          if (this.running && !this.readlineClosed) this.rl.prompt(true);
          return;
        }

        this.submitInputQueue(line);
        return;
      }

      // We are in multiline/paste mode
      this._multilineBuffer.push(...this._pasteBuffer);
      this._pasteBuffer = [];

      // If they pressed Enter on an empty line, submit the multiline buffer!
      if (isJustEmptyEnter && this._multilineBuffer.length > 1) {
        // Remove the trailing empty line
        this._multilineBuffer.pop();
        const combined = this._multilineBuffer.join('\n').trim();
        this._multilineBuffer = [];
        this._isPasteChunk = false;
        
        if (!combined) {
          if (this.running && !this.readlineClosed) {
            this.closeInputBox();
            this.showInputPrompt();
          }
          return;
        }
        
        this.submitInputQueue(combined);
        return;
      }

      // Otherwise, we are still collecting! Wait for user to submit.
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);
      const linesCount = this._multilineBuffer.length;
      console.log(`${colors.cyan}│ ${colors.dim}[ Đang nhập nhiều dòng (${linesCount} dòng)... Nhấn Enter ở dòng trống để gửi ]${colors.reset}`);
      if (this.running && !this.readlineClosed) this.rl.prompt(true);
    };

    this.submitInputQueue = (combined) => {
      this.inputQueue = this.inputQueue
        .then(async () => {
          this.closeInputBox();
          await this.handleInput(combined);
        })
        .catch((error) => {
          this.closeInputBox();
          console.log(`\n${colors.red}? Error: ${error.message}${colors.reset}\n`);
          if (this.running && !this.readlineClosed) this.showInputPrompt();
        });
    };

    this.rl.on('line', (line) => {
      this._pasteBuffer.push(line);
      if (this._pasteTimer) clearTimeout(this._pasteTimer);
      this._pasteTimer = setTimeout(flushPasteBuffer, PASTE_DELAY);
    });

    this.rl.on('close', async () => {
      this.readlineClosed = true;
      await this.inputQueue.catch(() => { });
      console.log(`\n${colors.dim}Goodbye.${colors.reset}\n`);
      process.exit(0);
    });
  }

  formatStartupHistoryEntry(content, maxChars = 420) {
    let text = stripAnsi(String(content ?? ''))
      .replace(/\r?\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!this.useUnicodeUi) {
      text = text
        .replace(/\p{Extended_Pictographic}/gu, '')
        .replace(/[─━—–]/g, '-')
        .replace(/\s+/g, ' ')
        .trim();
    }
    if (text.length <= maxChars) return text;
    return `${text.slice(0, maxChars - 32).trimEnd()} ... (${text.length - maxChars + 32} chars hidden)`;
  }

  showInputPrompt() {
    return this.inputController.showInputPrompt();
  }

  closeInputBox() {
    return this.inputController.closeInputBox();
  }

  closeSlashMenu() {
    return this.inputController.closeSlashMenu();
  }

  handleSlashMenuKey(key = {}) {
    return this.inputController.handleSlashMenuKey(key);
  }

  handleDirectClipboardPaste() {
    return this.inputController.handleDirectClipboardPaste();
  }

  buildInputPanel() {
    return this.inputController.buildInputPanel();
  }

  showStatus() {
    const snapshot = buildTuiSnapshot(this);
    if (process.stdout.isTTY) {
      console.log(`\n${welcomeBanner(this.version, {
        project: snapshot.projectPath,
        session: snapshot.sessionShort,
        provider: snapshot.provider,
        model: snapshot.model,
      })}\n`);
      return;
    }
    console.log(`\n${renderConversationStartup(snapshot, { colors })}\n`);
  }

  showTuiDashboard() {
    const snapshot = buildTuiSnapshot(this);
    console.log(`\n${renderLandingTui(snapshot, { colors, title: 'Winter Dashboard' })}\n`);
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

  async showPageAgentResources(args = []) {
    const root = this.getResourcePaths().pageAgent;
    const [action = 'info', ...rest] = args;

    if (action === 'search') {
      const query = rest.join(' ');
      if (!query) {
        console.log(`${colors.yellow}Usage: /page-agent search <query>${colors.reset}`);
        return;
      }
      const matches = await this.searchResourceFiles(root, query, 30);
      console.log(`${colors.cyan}Page Agent search "${query}":${colors.reset}`);
      if (matches.length === 0) {
        console.log(`  ${colors.dim}No results${colors.reset}`);
        return;
      }
      matches.forEach(match => console.log(`  ${match.isDirectory ? '[dir] ' : '[file]'} ${match.relativePath}`));
      return;
    }

    if (action === 'read') {
      const requestedPath = rest.join(' ') || 'README.md';
      const target = path.resolve(root, requestedPath);
      if (!target.startsWith(path.resolve(root))) {
        console.log(`${colors.red}Path must stay inside page-agent resources.${colors.reset}`);
        return;
      }
      await this.printPathPreview(target, `page-agent/${requestedPath}`);
      return;
    }

    if (action === 'docs') {
      await this.printPathPreview(path.join(root, 'docs'), 'page-agent/docs');
      return;
    }

    await this.printPathPreview(root, 'page-agent');
    console.log(`${colors.dim}Commands: /page-agent search <query>, /page-agent read <path>, /page-agent docs${colors.reset}`);
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

  async searchResourceFiles(root, query, limit = 30) {
    const matches = [];
    const needle = String(query || '').toLowerCase();
    if (!needle) return matches;

    const walk = async (dir) => {
      if (matches.length >= limit) return;
      const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (matches.length >= limit) break;
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(root, fullPath).replace(/\\/g, '/');
        if (entry.isDirectory()) {
          if (['node_modules', '.git', 'dist', 'build', '.next'].includes(entry.name)) continue;
          if (entry.name.toLowerCase().includes(needle)) matches.push({ relativePath, isDirectory: true });
          await walk(fullPath);
        } else if (entry.isFile() && entry.name.toLowerCase().includes(needle)) {
          matches.push({ relativePath, isDirectory: false });
        }
      }
    };

    await walk(root);
    return matches;
  }

  async handleInput(input) {
    if (this.isProcessing) {
      const pos = this.taskQueue.length + 1;
      const preview = input.length > 40 ? input.slice(0, 37) + '...' : input;
      console.log(`${colors.yellow}⧗${colors.reset} ${colors.bright}Queued #${pos}${colors.reset} ${colors.dim}› ${preview}${colors.reset}`);
      this.taskQueue.push(input);
      if (!this.readlineClosed) this.showInputPrompt();
      return;
    }
    this.processInputTask(input).catch(err => {
      console.log(colors.red + '\nLỗi xử lý hàng đợi: ' + err.message + colors.reset);
    });
  }

  async processInputTask(input) {
    this.isProcessing = true;
    this.isCancelled = false;
    this.currentAbortController = new AbortController();
    try {
      this.closeSlashMenu();
      this.history.push(input);
      if (this.history.length > this.maxHistory) {
        this.history = this.history.slice(-this.maxHistory);
      }

      // Echo tin nhắn user để xác nhận đã nhận
      if (!input.startsWith('/') && !input.startsWith('!')) {
        const preview = input.length > 120 ? input.slice(0, 117) + '...' : input;
        console.log(`\n${colors.bright}${colors.green}You${colors.reset} ${colors.dim}›${colors.reset} ${colors.white}${preview}${colors.reset}`);
      }

      if (input.startsWith('!')) {
        const command = input.slice(1).trim();
        if (!command) {
          console.log(`${colors.yellow}Usage: !<command>${colors.reset}`);
          return;
        }
        await this.handleSlashCommand(`/bash ${command}`);
        return;
      }

      const agentMention = await this.parseAgentMention(input);
      if (agentMention) {
        const result = await this.runAgent(agentMention.agentId, agentMention.task);
        console.log(result);
        return;
      }

      if (!input.startsWith('/')) {
        const browserShortcut = this.resolveBrowserShortcut(input);
        if (browserShortcut) {
          await this.handleOpenBrowserIntent(input, browserShortcut);
          return;
        }
      }

      if (!input.startsWith('/') && this.isOpenBrowserIntent(input)) {
        await this.handleOpenBrowserIntent(input);
        return;
      }

      // Parse @-symbols for non-command input
      if (!input.startsWith('/')) {
        const canUseHeavyContext = await this.shouldUseHeavyProjectContext();
        if (canUseHeavyContext && this.atContext && this.atContext.hasAtReferences(input)) {
          await this.initCodebaseSearch();
          try {
            const parsed = await this.atContext.parse(input);
            if (parsed.hasAtReferences) {
              const atContextPrompt = this.atContext.formatContextPrompt(parsed.contexts);
              if (atContextPrompt) {
                this._pendingAtContext = atContextPrompt;
              }
              input = parsed.input; // Remove @-symbols from input
            }
          } catch {
            // Silently continue if @ parsing fails
          }
        }
      }

      if (input.startsWith('/')) {
        await this.handleSlashCommand(input);
        return;
      }

      const pastedDataImage = this.parseDataUrlImage(input);
      if (pastedDataImage) {
        await this.chat('Analyze this pasted image.', [pastedDataImage]);
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
        if (!this.isCancelled) {
          console.log(colors.red + '\nĐã hủy công việc hiện tại.' + colors.reset);
        }
      } else {
        console.log(colors.red + '\nLỗi: ' + error.message + colors.reset);
      }
    } finally {
      this.isProcessing = false;
      this.isCancelled = false;
      this.currentAbortController = null;
      if (this.spinner) this.spinner.stop();

      this.showSmartTip(input);

      if (this.taskQueue.length > 0) {
        this.closeInputBox();
        const nextTask = this.taskQueue.shift();
        setTimeout(() => this.processInputTask(nextTask), 0);
      } else {
        if (!this.readlineClosed) this.showInputPrompt();
      }
    }
  }

  isOpenBrowserIntent(input = '') {
    const raw = String(input || '').trim();
    if (!raw) return false;
    const text = `${raw.toLowerCase()}\n${this.normalizeIntentText(raw).toLowerCase()}`;
    return /\b(mo|open|launch|start)\b.*\b(chrome|browser|trinh duyet|google chrome)\b/i.test(text)
      || /\b(chrome|browser|trinh duyet|google chrome)\b.*\b(mo|open|launch|start)\b/i.test(text);
  }

  resolveBrowserShortcut(input = '') {
    const raw = String(input || '').trim();
    if (!raw) return null;
    const normalized = this.normalizeIntentText(raw).toLowerCase();
    const text = `${raw.toLowerCase()}\n${normalized}`;

    const url = this.extractUrlFromText(raw);
    if (url && /\b(mo|open|launch|start|browse)\b/i.test(normalized)) {
      return { url, label: url };
    }

    const knownSites = [
      { pattern: /\b(youtube music|yt music|music youtube)\b/i, url: 'https://music.youtube.com', label: 'YouTube Music' },
      { pattern: /\b(youtube|you tube)\b/i, url: 'https://www.youtube.com', label: 'YouTube' },
      { pattern: /\b(spotify)\b/i, url: 'https://open.spotify.com', label: 'Spotify' },
      { pattern: /\b(google)\b/i, url: 'https://www.google.com', label: 'Google' },
    ];

    if (/\b(mo|open|launch|start)\b/i.test(normalized)) {
      const site = knownSites.find(item => item.pattern.test(text));
      if (site) return site;
    }

    if (/\b(tim|search|kiem)\b/i.test(normalized) && /\b(chrome|google|browser|trinh duyet)\b/i.test(normalized)) {
      const query = this.extractBrowserSearchQuery(raw);
      if (query) {
        return {
          url: `https://www.google.com/search?${new URLSearchParams({ q: query }).toString()}`,
          label: `Google search: ${query}`,
        };
      }
    }

    return null;
  }

  extractBrowserSearchQuery(input = '') {
    let query = String(input || '').trim();
    query = query.replace(/^\s*(tìm|tim|search|kiếm|kiem)\s+/i, '');
    query = query.replace(/\s+(trên|tren|on)\s+(chrome|google|browser|trình duyệt|trinh duyet)\b.*$/i, '');
    query = query.replace(/\s+(đi|di)\s*$/i, '');
    query = query.trim();
    return query || null;
  }

  extractUrlFromText(input = '') {
    const match = String(input || '').match(/https?:\/\/[^\s]+/i);
    return match ? match[0].replace(/[),.;]+$/g, '') : null;
  }

  async handleOpenBrowserIntent(input = '', options = {}) {
    const url = options.url || this.extractUrlFromText(input) || 'about:blank';
    const result = await this.tools.execute('OpenBrowser', { browser: 'chrome', url }, { cwd: this.projectPath });
    await this.session?.addToHistory?.({ role: 'user', content: input });

    if (result?.success === false) {
      const message = `Không mở được Chrome: ${result.error || 'unknown error'}`;
      console.log(`${colors.red}${message}${colors.reset}`);
      if (result.recovery) console.log(`${colors.dim}${result.recovery}${colors.reset}`);
      await this.session?.addToHistory?.({ role: 'assistant', content: message });
      return result;
    }

    const label = options.label || url;
    const message = `Đã mở Chrome${url && url !== 'about:blank' ? `: ${label}` : '.'}`;
    console.log(`${colors.green}${message}${colors.reset}`);
    await this.session?.addToHistory?.({ role: 'assistant', content: message });
    return result;
  }

  showSmartTip(input = '') {
    const text = input.toLowerCase();
    let tip = null;

    if (text.match(/\b(lỗi|error|bug|fail|crash|không chạy)\b/) && Math.random() < 0.6) {
      tip = 'Gõ /debug để Winter tự động đọc lỗi, tìm nguyên nhân và fix bug giúp bạn.';
    } else if (text.match(/\b(test|kiểm tra)\b/) && Math.random() < 0.5) {
      tip = 'Gõ /tdd <task> để bật chế độ Auto Healing (Winter tự code, tự test đến khi pass).';
    } else if (text.match(/\b(tìm|search|kiếm|ở đâu)\b/) && Math.random() < 0.5) {
      tip = 'Gõ /search <từ khoá> để tìm kiếm thông minh (semantic search) trên toàn dự án.';
    } else if (text.match(/\b(dự án|app|project|tính năng lớn)\b/) && Math.random() < 0.4) {
      tip = 'Gõ /plan để tạo và quản lý kế hoạch từng bước trước khi code tính năng phức tạp.';
    } else if (Math.random() < 0.15) {
      const tips = [
        'Gõ /composer <task> để bật chế độ sửa đa file cực mạnh (giống Cursor Composer).',
        'Gõ /undo để hoàn tác (phục hồi) lại file nếu AI lỡ sửa sai.',
        'Gõ /history để xem lại lịch sử các tin nhắn và tool calls.',
        'Gõ /diff để kiểm tra các dòng code đã thay đổi (git diff).',
        'Gõ /watch <npm test> để Winter tự động chạy lại lệnh mỗi khi bạn lưu file.',
        'Dùng @swe <task> để khởi động luồng SWE-Agent tự động giải quyết issue.',
        'Bôi đen code và bấm phím tắt, hoặc gõ /complete để yêu cầu AI viết tiếp code.'
      ];
      tip = tips[Math.floor(Math.random() * tips.length)];
    }

    if (tip) {
      console.log(`\n${colors.dim}💡 Mẹo: ${tip}${colors.reset}`);
    }
  }

  async parseAgentMention(input = '') {
    const match = String(input || '').match(/^\s*@([A-Za-z][\w-]*)\s+([\s\S]+)$/);
    if (!match) return null;
    const agentId = match[1];
    const task = match[2].trim();
    if (!task) return null;
    const agents = await this.listAgentDefinitions();
    if (!agents.some(agent => agent.id.toLowerCase() === agentId.toLowerCase())) return null;
    return { agentId, task };
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

  parseDataUrlImage(value = '') {
    const match = String(value || '').match(/data:(image\/(?:png|jpeg|jpg|gif|webp|bmp|svg\+xml));base64,([a-z0-9+/=]+)/i);
    if (!match) return null;
    const mime = match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase();
    return { mime, base64: match[2] };
  }

  async showInteractiveChecklist(title, items) {
    if (!items || items.length === 0) return [];

    return new Promise((resolve) => {
      let cursor = 0;
      const selected = new Set(items.map((_, i) => i)); // default select all

      let printedLines = 0;
      const render = () => {
        // Xóa những dòng đã in trước đó.
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
      { role: 'system', content: 'Bạn là chuyên gia lập kế hoạch. Hãy chia nhỏ yêu cầu của người dùng thành các bước cụ thể, hành động được, rất ngắn gọn (dưới 15 chữ mỗi bước). Chỉ trả về một mảng JSON các chuỗi, không giải thích gì thêm. Ví dụ: ["Tạo file index.html", "Thêm CSS styling", "Viết script.js"]' },
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
    console.log(`\n\x1b[35m[ TDD AUTO-HEALING MODE ]\x1b[0m Kích hoạt vòng lặp tự sửa lỗi.`);

    // Tăng giới hạn loop lên 15 để cho phép AI tự sửa lỗi nhiều lần.
    const originalRequestAssistantTurn = this.requestAssistantTurn;

    // Chèn prompt đặc biệt ép AI phải verify.
    const verifyCommands = await this.inferVerificationCommands(task);
    const autoPrompt = `TASK: ${task}

CRITICAL DEBUG/AGENT RULES:
1. Inspect the project before changing anything. Read the failing file, related caller, config, and logs.
2. Reproduce or locate the first hard failure. For frontend/runtime UI issues, use chrome-devtools MCP in visible Chrome when a URL/dev server is available; use BrowserDebug only as a headless fallback.
3. Patch the smallest root cause with Write/Edit.
4. Run the closest verification command(s): ${verifyCommands.join(' && ')}.
5. If verification fails, read the new error, patch again, and run verification again.
6. Do not claim success until a tool result proves it.`;

    await this.chat(autoPrompt);
  }

  async runAutoCommit(context = '') {
    console.log(`\n${colors.cyan}✓ Tạo commit message tự động...${colors.reset}`);
    const diffResult = await this.tools.execute('Bash', { command: 'git diff --cached' }, { cwd: this.projectPath });

    let diff = diffResult.stdout;
    let isStaged = true;
    if (!diff || diff.trim() === '') {
      const allDiff = await this.tools.execute('Bash', { command: 'git diff' }, { cwd: this.projectPath });
      diff = allDiff.stdout;
      isStaged = false;
    }

    if (!diff || diff.trim() === '') {
      console.log(`${colors.yellow}Không có thay đổi nào để commit.${colors.reset}`);
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
    console.log(`\n${colors.cyan}AI đang soi code của bạn...${colors.reset}`);
    const diffResult = await this.tools.execute('Bash', { command: 'git diff HEAD' }, { cwd: this.projectPath });
    const diff = diffResult.stdout;

    if (!diff || diff.trim() === '') {
      console.log(`${colors.yellow}Không có thay đổi nào để review.${colors.reset}`);
      return;
    }

    const prompt = `Hãy đóng vai một Senior Developer khó tính. Review nhanh các thay đổi sau đây. Chỉ ra bug nếu có, vấn đề bảo mật, hoặc những chỗ cần clean code. Không cần khen ngợi, hãy nói thẳng vào vấn đề. Trình bày dạng Markdown đẹp mắt.\n\n${context ? `Ngữ cảnh: ${context}\n` : ''}Diff:\n${diff.slice(0, 8000)}`;

    await this.chat(prompt);
  }

  async handleSlashCommand(input) {
    return handleSlashCommand(this, input);
  }

  showCommandMenu() {
    const c = colors;
    const width = terminalWidth(72, 112, 92);
    const snapshot = buildTuiSnapshot(this);
    console.log(`\n${renderLandingTui(snapshot, {
      colors: c,
      title: 'Winter Agent Console',
      width,
    })}`);
    console.log(`${c.dim}Type ${c.cyan}/${c.dim} for palette, ${c.cyan}/help${c.dim} for the full command list.${c.reset}\n`);
  }

  showHelp() {
    console.log(`
${colors.cyan}${this.useUnicodeUi ? '❄ ' : ''}WINTER COMMANDS${colors.reset}
${colors.dim}${''.padEnd(50, this.useUnicodeUi ? '─' : '-')}${colors.reset}

${colors.white}Project:${colors.reset}
  /project, /pwd    Show current project
  /cd <path>        Change directory

${colors.white}Session:${colors.reset}
  /session          Current session info
  /sessions         List all sessions
  /clear            Clear screen
  /undo             Undo last change from backup
  /composer <task>  Multi-file editing mode (like Cursor Composer)
  /complete <file>  Trigger inline code completion

${colors.white}Memory:${colors.reset}
  /remember <text>  Store in memory
  /memories         Show memories
  /forget           Clear memories

${colors.white}Plans & Tasks:${colors.reset}
  /plan, /plans     View plans
  /task <desc>      Create task
  /tasks            List tasks
  /agent [role] <task>  Run a subagent
  /auto [task]      Auto-heal with test/build loop
  /debug [error]    Auto-debug and verify a failure
  /doctor tools     Test whether current provider/model can call tools

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
  /ecc [sub]       Browse ECC resources (info, browse, search, sync)
  /codex [section]  Browse ~/.codex resources
  /claude [section] Browse ~/.claude resources
  /karpathy        Browse ~/karpathy-tools
  /agents          Read ~/agents.md

${colors.white}Other:${colors.reset}
  /help, /?        Show this help
  /exit, /quit     Exit Winter

${colors.dim}${''.padEnd(50, '?')}${colors.reset}
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
        const icon = e.isDirectory ? '[dir]' : '[file]';
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
            entries.forEach(e => console.log(`  ${e.isDirectory ? '[dir]' : '[file]'} ${e.name}`));
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
        const active = p.name === this.ai.getActiveProvider() ? ` ${colors.green}< active${colors.reset}` : '';
        const status = p.ready ? `${colors.green}ok${colors.reset}` : `${colors.red}off${colors.reset}`;
        console.log(`  ${status} ${colors.bright}${p.name}${colors.reset}: ${p.model}${active}`);
      });

      // Try to read cached models
      const cachePath = this.getResourcePaths().codex.models;
      const cached = await this.readCachedModels(cachePath);
      if (cached.length > 0) {
        console.log(`\n${colors.cyan}Cached Models (${cached.length}):${colors.reset}`);
        cached.slice(0, 20).forEach(m => console.log(`  ${colors.dim}?${colors.reset} ${m}`));
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
        return byName(['Read', 'Grep', 'Glob', 'Bash', 'WebFetch']);
      case 'debug':
        return byName(['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob', 'OpenBrowser', 'BrowserDebug', 'WebFetch', 'MCP', 'Parallel']);
      case 'research':
        return byName(['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch', 'Parallel']);
      case 'design':
      case 'ui':
        return byName(['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob', 'OpenBrowser', 'BrowserDebug', 'WebFetch', 'MCP']);
      default:
        return byName(['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'OpenBrowser', 'BrowserDebug', 'WebFetch', 'WebSearch', 'MCP', 'Parallel', 'Agent']);
    }
  }

  getActiveModelTier() {
    if (typeof this.ai?._modelTier === 'string' && this.ai._modelTier) {
      return this.ai._modelTier;
    }
    const providerName = this.ai?.getActiveProvider?.();
    const model = this.ai?.providers?.[providerName]?.model || '';
    return classifyModelTier(model, providerName);
  }

  getBudgetScale(modelTier = this.getActiveModelTier()) {
    return getModelBudgetMultiplier(modelTier);
  }

  getProjectContextBudget(modelTier = this.getActiveModelTier()) {
    return Math.round(6000 * this.getBudgetScale(modelTier));
  }

  getCodebaseContextBudget(modelTier = this.getActiveModelTier()) {
    return Math.round(4200 * this.getBudgetScale(modelTier));
  }

  getTokenJuiceInlineBudget(modelTier = this.getActiveModelTier()) {
    return Math.max(800, Math.round(1400 * this.getBudgetScale(modelTier)));
  }

  getTokenJuiceForModelTier(modelTier = this.getActiveModelTier()) {
    const tokenJuice = new TokenJuice({
      projectPath: this.projectPath,
      inlineBudgetTokens: this.getTokenJuiceInlineBudget(modelTier),
    });
    this.tokenJuice = tokenJuice;
    return tokenJuice;
  }

  shouldUseCompactPrompt() {
    const tier = this.getActiveModelTier();
    return tier === 'tiny' || tier === 'small';
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

    const activeProviderIsValid = activeProvider && hasProvider(activeProvider);
    const allowAutoRoute = options.autoRouteProvider === true && !activeProviderIsValid;

    let provider = activeProviderIsValid ? activeProvider : Object.keys(providers).find(hasProvider) || activeProvider;
    if (allowAutoRoute && /\b(review|refactor|debug|fix|bug|error|stack trace|test|tool|patch|code)\b/.test(text) && hasProvider('claude')) {
      provider = 'claude';
    } else if (allowAutoRoute && /\b(summary|summarize|commit message|changelog|docs|explain|rewrite)\b/.test(text) && hasProvider('openai')) {
      provider = 'openai';
    } else if (allowAutoRoute && /\b(local|offline|privacy|private|on-device)\b/.test(text) && hasProvider('ollama')) {
      provider = 'ollama';
    } else if (allowAutoRoute && /\b(quick|brief|short|fast)\b/.test(text) && hasProvider('groq')) {
      provider = 'groq';
    }

    return {
      provider,
      model: options.model || providers[provider]?.model || providers[activeProvider]?.model || null,
    };
  }


  async runConversation(messages, label = 'Thinking', tools = null) {
    return this.agentRuntime.runConversation(messages, label, tools);
  }

  getLatestUserText(messages = []) {
    const list = Array.isArray(messages) ? messages : [{ role: 'user', content: String(messages || '') }];
    for (let i = list.length - 1; i >= 0; i--) {
      const message = list[i];
      if (message?.role && message.role !== 'user') continue;
      const content = message?.content;
      if (typeof content === 'string') return content;
      if (Array.isArray(content)) {
        return content.map(part => part?.text || '').filter(Boolean).join('\n');
      }
    }
    return '';
  }

  normalizeIntentText(text = '') {
    return String(text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase();
  }

  actionRequiresTools(messages = []) {
    const rawText = this.getLatestUserText(messages).toLowerCase();
    const text = `${rawText}\n${this.normalizeIntentText(rawText)}`;
    if (!text.trim()) return false;

    // Direct action verbs (EN + VN)
    const actionPattern = /\b(fix|repair|bug|debug|implement|create|write|edit|modify|update|delete|remove|refactor|run|test|build|commit|push|publish|install|check|inspect|read|scan|grep|search|change|apply|patch|add|move|rename|copy|migrate|deploy|setup|configure|generate|format|clean|reset|revert|undo|merge|split|extract|inject|insert|replace|append|prepend|convert|transform|compile|execute|verify|validate|optimize|improve|enhance|upgrade|downgrade|enable|disable|toggle|set|connect|send|fetch|download|upload|open|close|start|stop|restart|sua|lam|tao|ghi|doc|xoa|chay|kiem tra|cai|them|doi|review|tim|viet|trien khai|cap nhat|xay dung|cau hinh|chinh|bo sung|loai bo|sửa|làm|tạo|đọc|xóa|xoá|chạy|kiểm tra|cài|thêm|đổi|tìm|viết|triển khai|cập nhật|xây dựng|cấu hình|chỉnh|bổ sung|loại bỏ|di chuyển|đổi tên|nâng cấp|tối ưu|kết nối|gửi|tải|mở|đóng|khởi động|dừng)\b/i;
    // Target patterns (filenames, paths, project terms)
    const targetPattern = /\b(file|repo|project|code|src|test|build|git|npm|node|folder|directory|cli|tool|provider|model|config|readme|package\.json|component|module|class|function|api|endpoint|route|page|style|css|html|template|schema|database|server|client|app|service|hook|context|store|reducer|middleware|controller|handler|view|layout|du an|thu muc|tap tin|loi|chuc nang|dự án|thư mục|tập tin|lỗi|chức năng|giao diện|trang|dịch vụ|thành phần|mô hình)\b|[A-Za-z]:[\\/]|\.jsx?\b|\.tsx?\b|\.json\b|\.md\b|\.py\b|\.css\b|\.html\b|\.vue\b|\.svelte\b|\.rs\b|\.go\b|\.java\b|\.c(pp)?\b|\.rb\b/i;
    // Pure questions that don't need tool action
    const pureQuestionPattern = /^(what|why|how|when|where|is|are|can|could|should|would|explain|describe|tell me|compare|giải thích|mô tả|so sánh|tai sao|vi sao|la gi|co nen|co phai|tại sao|vì sao|là gì|có nên|có phải|nhu the nao|như thế nào|khi nào)\b/i;

    if (pureQuestionPattern.test(text) && !actionPattern.test(text)) return false;

    if (this.isBrowserInteractionRequest(rawText)) return true;
    
    // Even without explicit target, some verbs are strong enough on their own
    const strongActionAlone = /\b(fix|debug|deploy|build|test|commit|install|run|refactor|sửa|chạy|cài|triển khai|xây dựng)\b/i;
    if (strongActionAlone.test(text)) return true;
    
    return actionPattern.test(text) && targetPattern.test(text);
  }

  shouldAutoVerifyAfterTools(originalMessage = '', usedMutatingTools = false) {
    if (!usedMutatingTools) return false;
    const text = String(originalMessage || '').toLowerCase();
    if (!text.trim()) return false;
    if (/\b(skip tests?|no verify|don't verify|khong test|khong verify|bo qua test|không test|không verify|bỏ qua test)\b/i.test(text)) {
      return false;
    }
    return /\b(fix|bug|error|test|build|lint|typecheck|compile|refactor|implement|edit|write|change|patch|debug|sua|loi|kiem tra|bien dich|trien khai|lam|doi|viet|sửa|lỗi|kiểm tra|biên dịch|triển khai|làm|đổi|viết)\b/i.test(text);
  }

  responseNeedsToolEvidence(content = '') {
    const text = String(content || '').toLowerCase();
    if (!text.trim()) return false;

    // If model is asking for clarification, that's legitimate - no tool needed
    const clarification = /(?:cần thêm thông tin|cho mình biết|vui lòng cung cấp|please provide|which file|what file|need more info|clarify|không rõ|chưa rõ|file nào|thư mục nào|bạn muốn|you want me to|could you specify|can you tell)/i;
    if (clarification.test(text)) return false;

    return true;
  }

  isBrowserInteractionRequest(text = '') {
    const raw = String(text || '');
    const normalized = this.normalizeIntentText(raw);
    const combined = `${raw}\n${normalized}`;
    const action = /\b(click|fill|submit|press|select|navigate|bam|dien|chon|nhan|vao|bấm|điền|chọn|nhấn|vào)\b/i;
    const target = /\b(url|http|https|site|website|web|page|form|button|link|chrome|browser|trang|nut|nút|dang ky|dang nhap|khach hang|khách hàng|đăng ký|đăng nhập)\b/i;
    return action.test(combined) && target.test(combined);
  }

  detectFakeCompletion(content = '') {
    const text = String(content || '').toLowerCase();
    if (!text.trim()) return false;

    // Detect fake completion claims - model says it did something without using tools
    const fakeCompletionClaims = /(?:đã (?:sửa|tạo|viết|xóa|cập nhật|thêm|chỉnh|xong|hoàn thành|fix|update|edit|write|create|delete|remove|modify|change|apply|deploy|push)|i(?:'ve| have) (?:fixed|created|written|updated|added|modified|changed|edited|applied|deployed|deleted|removed|patched|implemented|refactored)|done!|xong rồi|hoàn thành|đã hoàn tất|hoàn tất|the (?:fix|change|update|edit|modification) (?:has been|is) (?:applied|done|completed|made)|here(?:'s| is) the (?:fix|update|change|solution|implementation|code)|file (?:has been|was) (?:updated|created|modified|written|changed)|changes? (?:have been|has been|were) (?:made|applied|saved)|successfully (?:updated|created|modified|fixed|applied|changed|written))/i;
    if (fakeCompletionClaims.test(text)) return true;

    const fakeBrowserClaims = /(?:đã|da|i(?:'ve| have))\s+(?:bấm|bam|click(?:ed)?|mở|mo|open(?:ed)?|điền|dien|fill(?:ed)?|chọn|chon|select(?:ed)?|submit(?:ted)?|vào|vao|navigate(?:d)?)/i;
    if (fakeBrowserClaims.test(text)) return true;

    // Detect code blocks that pretend to show "changes" without tool use
    const codeBlockWithFilePath = /```[\s\S]*?(?:[\/\\][\w.-]+\.(?:js|ts|py|css|html|json|md|jsx|tsx|vue|go|rs|java|c|cpp|rb|sh))[\s\S]*?```/i;
    const claimsFileChange = /(?:here(?:'s| is)|below|sau đây|dưới đây|như sau|updated|modified|changed|new|fixed)/i;
    if (codeBlockWithFilePath.test(text) && claimsFileChange.test(text)) return true;

    return false;
  }

  buildToolEvidenceCorrection(messages = []) {
    const request = this.getLatestUserText(messages);
    if (this.isBrowserInteractionRequest(request)) {
      return [
        'RUNTIME ENFORCEMENT: Your previous response was BLOCKED because you claimed a browser/web action without real browser tool evidence.',
        '',
        'For browser interaction tasks you MUST use tools, not prose:',
        '1. If chrome-devtools MCP is configured, call MCP {"server":"chrome-devtools","tool":"list"} first if needed.',
        '2. Use chrome-devtools MCP tools such as new_page/navigate_page, take_snapshot, click, fill/fill_form, evaluate_script, list_network_requests, and take_screenshot in visible Chrome.',
        '3. Use WebFetch only for static text extraction. WebFetch cannot click buttons, fill forms, or preserve page state. BrowserDebug is headless and should be fallback only.',
        '4. Do not say "đã bấm", "đã điền", "đã mở", or "đã kiểm tra" until a browser/MCP tool result proves it.',
        '',
        `Original user request: ${request}`,
      ].join('\n');
    }
    return [
      '⚠️ RUNTIME ENFORCEMENT: Your previous response was BLOCKED because you did not use any tool.',
      '',
      'The user requested an action that requires REAL tool execution. You MUST:',
      '1. Call Read/Grep/Glob to inspect the relevant files FIRST',
      '2. Call Write/Edit to make changes',
      '3. Call Bash to run/test/verify',
      '',
      'DO NOT write code in a code block and claim it is done. That is a hallucination.',
      'DO NOT say "I have updated/created/fixed" without a tool call proving it.',
      'DO NOT describe what you would do. Actually DO IT with tool calls.',
      '',
      'Available tools: Read, Write, Edit, Bash, Glob, Grep, OpenBrowser, BrowserDebug, WebFetch, WebSearch, MCP.',
      '',
      'If native tool calls are not supported, output exactly one fallback tool call:',
      '<invoke name="Read"><parameter name="path">README.md</parameter></invoke>',
      '{"tool":"Read","arguments":{"path":"README.md"}}',
      'CALL_TOOL Read {"path":"README.md"}',
      '',
      `Original user request: ${request}`,
    ].join('\n');
  }

  /**
   * Smart Tool Routing: phân tích câu lệnh user và gợi ý tool phù hợp.
   * Giúp model yếu/nhỏ chọn đúng tool thay vì dùng Bash cho mọi thứ.
   */
  buildToolRoutingHint(userMessage = '') {
    const rawText = String(userMessage || '').toLowerCase();
    const text = `${rawText}\n${this.normalizeIntentText(rawText)}`;
    if (!text.trim()) return null;

    const hints = [];

    if (/\b(click|fill|submit|press|select|navigate|bam|dien|chon|nhan|vao|bấm|điền|chọn|nhấn|vào)\b/i.test(text) && /\b(web|website|page|url|http|chrome|browser|form|button|link|trang|nut|nút|dang ky|dang nhap|khach hang|đăng ký|đăng nhập|khách hàng)\b/i.test(text)) {
      hints.push('TOOL HINT: This is a live browser interaction. Do NOT use WebFetch alone. Prefer visible Chrome via MCP {"server":"chrome-devtools","tool":"list"} then chrome-devtools tools new_page/navigate_page, take_snapshot, click, fill/fill_form, evaluate_script, list_network_requests, and take_screenshot. Only use BrowserDebug as headless fallback. Only claim click/fill/navigation after MCP or BrowserDebug evidence.');
    }

    // Detect file reading requests
    const hasPath = /[A-Za-z]:[\\/][\w.\\/\\-]+/i.test(text) || /(?:^|\s)[.~]?\/[\w.\/-]+/i.test(text);
    const readVerbs = /\b(đọc|doc|read|xem|view|mở|open|show|hiện|hiển thị|cat|type)\b/i;
    const readFilePatterns = /\b(đọc|doc|read|xem|view|mở|open|show|hiện|cat|type)\b.*\.(?:js|ts|py|json|md|css|html|txt|yaml|yml|toml|cfg|ini|env|sh|bat|ps1|xml|vue|svelte|go|rs|java|c|cpp|rb|php)\b/i;
    const readPatterns = readFilePatterns;
    const dirPatterns = /\b(đọc|doc|read|xem|liệt kê|list|ls|dir|show|hiện)\b.*\b(thư mục|folder|directory|dir)\b/i;

    if (readFilePatterns.test(text)) {
      hints.push('TOOL HINT: To read a file, call tool Read with {"file_path": "<path>"}. Do NOT use Bash with cat/type.');
    } else if (hasPath && readVerbs.test(text)) {
      // Path detected + read verb, could be file or directory
      hints.push('TOOL HINT: To read a file, call tool Read with {"file_path": "<path>"}. To list a directory, call Glob with {"pattern": "*", "cwd": "<path>"}. Do NOT use Bash with ls/dir/cat/type.');
    } else if (dirPatterns.test(text)) {
      hints.push('TOOL HINT: To list directory contents, call tool Glob with {"pattern": "*", "cwd": "<path>"}. Do NOT use Bash with ls/dir.');
    }

    // Detect file writing/creating requests
    if (/\b(tạo|tao|create|viết|viet|write|ghi)\b.*\b(file|tập tin|tap tin)\b/i.test(text)) {
      hints.push('TOOL HINT: To create/write a file, call tool Write with {"file_path": "<path>", "content": "<content>"}. Do NOT use Bash with echo/cat.');
    }

    // Detect file editing requests
    if (/\b(sửa|sua|edit|chỉnh|chinh|thay|replace|đổi|doi|modify|update|cập nhật)\b.*(?:file|\.(?:js|ts|py|json|md|css|html)\b)/i.test(text)) {
      hints.push('TOOL HINT: To edit a file, first Read it, then call Edit with {"file_path": "<path>", "old_string": "<exact text>", "new_string": "<replacement>"}.');
    }

    // Detect search/find requests
    if (/\b(tìm|tim|find|search|kiếm|kiem|grep|ở đâu|o dau|where)\b/i.test(text) && !(/\b(web|google|online|internet)\b/i.test(text))) {
      hints.push('TOOL HINT: To search in code, call tool Grep with {"pattern": "<search term>", "path": "<directory>"}. Do NOT use Bash with grep/findstr.');
    }

    // Detect test/run requests
    if (/\b(chạy|chay|run|test|execute|thực thi|thuc thi|build|compile|npm|node|python|pip)\b/i.test(text) && !readPatterns.test(text)) {
      hints.push('TOOL HINT: To run commands, call tool Bash with {"command": "<command>"}.');
    }

    // Detect URL/web requests  
    if (/\b(https?:\/\/[^\s]+|url|website|trang web|web page)\b/i.test(text)) {
      hints.push('TOOL HINT: To fetch static URL text, call WebFetch. For live visible browser debugging/control, prefer MCP server chrome-devtools with new_page/navigate_page, take_snapshot, click, fill/fill_form, evaluate_script, list_console_messages, list_network_requests, or performance trace tools; use BrowserDebug only as headless fallback.');
    }

    if (/\b(chrome|devtools|browser debug|debug browser|screenshot|console|network|lcp|performance|perf|web vitals|localhost|127\.0\.0\.1)\b/i.test(text)) {
      hints.push('TOOL HINT: For "open Chrome" / "mở chrome", call OpenBrowser {"browser":"chrome","url":"about:blank"}. Do NOT call Bash/Get-Command/Start-Process. If configured, use MCP {"server":"chrome-devtools","tool":"list"} for page state, console, network, screenshots, and performance.');
    }

    if (hints.length === 0) return null;

    return `[Tool Router] ${hints.join(' | ')}`;
  }

  withCurrentAbortSignal(options = {}) {
    const signal = options.signal || options.abortSignal || this.currentAbortController?.signal;
    return signal ? { ...options, signal } : options;
  }

  isAbortError(error) {
    return error?.name === 'AbortError' || error?.message === 'AbortError';
  }

  isRateLimitError(error) {
    const message = String(error?.message || error || '');
    return error?.status === 429 || /\b429\b|rate[_ -]?limit|tokens per minute|\bTPM\b/i.test(message);
  }

  isTimeoutError(error) {
    const message = String(error?.message || error || '');
    return error?.name === 'TimeoutError'
      || error?.code === 'ETIMEDOUT'
      || /timed out|timeout|request aborted/i.test(message);
  }

  cancelCurrentTask() {
    if (this.isCancelled) return;
    this.isCancelled = true;
    if (this.spinner) this.spinner.stop();
    if (this.currentAbortController && !this.currentAbortController.signal.aborted) {
      this.currentAbortController.abort(new DOMException('The operation was aborted.', 'AbortError'));
    }
    console.log(`\n\x1b[31m[ Đã hủy công việc hiện tại ]\x1b[0m`);
  }

  async requestAssistantTurn(messages, options, startedAt, totalUsage) {
    const requestOptions = this.withCurrentAbortSignal(options);
    if (typeof this.ai.streamRequest === 'function') {
      try {
        const streamed = await this.collectAssistantStream(messages, requestOptions, startedAt, totalUsage);
        if (streamed) return streamed;
      } catch (error) {
        if (this.isAbortError(error)) throw new Error('AbortError');
        if (this.isRateLimitError(error)) throw error;
        if (this.isTimeoutError(error)) throw error;
        console.log(`${colors.dim}Streaming failed, retrying normal response: ${error.message}${colors.reset}`);
      }
    }

    const response = await this.ai.sendRequest(messages, requestOptions);
    this.addUsage(totalUsage, response.usage);
    const assistantMsg = response.choices?.[0]?.message || {};
    const inlineToolExtraction = this.extractInlineToolCalls(assistantMsg.content || '');
    const legacyFunctionCall = assistantMsg.function_call
      ? [{ id: 'function-call-0', source: 'legacy-function-call', type: 'function', function: assistantMsg.function_call }]
      : [];
    const toolCalls = this.normalizeToolCalls([
      ...(assistantMsg.tool_calls || []).map(call => ({ source: 'native-tool-calls', ...call })),
      ...legacyFunctionCall,
      ...inlineToolExtraction.toolCalls,
    ]);
    if (inlineToolExtraction.toolCalls.length > 0) {
      assistantMsg.content = inlineToolExtraction.content;
      assistantMsg.tool_calls = this.formatToolCallsForMessage(toolCalls);
    }
    const finishReason = response.choices?.[0]?.finish_reason;

    if (this.spinner) this.spinner.stop();

    if (assistantMsg.content && toolCalls.length === 0) {
      const isFakeCompletion = !options?.usedMutatingTools && this.detectFakeCompletion(assistantMsg.content);
      if ((options?.requireToolEvidence && this.responseNeedsToolEvidence(assistantMsg.content)) || isFakeCompletion) {
        return { assistantMsg, toolCalls, finalContent: '', finishReason: 'tool_evidence_required' };
      }
      this.printAssistantAnswer(assistantMsg.content, startedAt, totalUsage);
      return { assistantMsg, toolCalls, finalContent: assistantMsg.content, finishReason };
    }

    return { assistantMsg, toolCalls, finalContent: '', finishReason };
  }

  async collectAssistantStream(messages, options, startedAt, totalUsage) {
    let content = '';
    let streamBuffer = '';
    let printedLines = 0;
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
          source: 'stream-native-tool-calls',
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
      if (choice.delta?.function_call || choice.message?.function_call) {
        const functionCall = choice.delta?.function_call || choice.message?.function_call;
        toolCallParts[0] = toolCallParts[0] || {
          id: 'function-call-0',
          source: 'stream-legacy-function-call',
          type: 'function',
          function: { name: '', arguments: '' },
        };
        if (functionCall.name) toolCallParts[0].function.name += functionCall.name;
        if (functionCall.arguments) toolCallParts[0].function.arguments += functionCall.arguments;
      }
      for (const messageToolCall of choice.message?.tool_calls || []) {
        const index = messageToolCall.index ?? toolCallParts.length;
        toolCallParts[index] = {
          id: messageToolCall.id || `message-call-${index}`,
          source: 'message-tool-calls',
          type: messageToolCall.type || 'function',
          function: {
            name: messageToolCall.function?.name || '',
            arguments: messageToolCall.function?.arguments || '',
          },
        };
      }

      if (chunk.content) {
        content += chunk.content;
        if (bufferToolModeContent && this.spinner && process.env.NODE_ENV !== 'test') {
          streamBuffer += chunk.content;
          let newlineIdx;
          const terminalCols = process.stdout.columns || 80;
          while ((newlineIdx = streamBuffer.indexOf('\n')) !== -1) {
            const line = streamBuffer.slice(0, newlineIdx).replace(/\r$/, '');
            streamBuffer = streamBuffer.slice(newlineIdx + 1);
            const visibleLength = line.replace(/\x1b\[[0-9;]*m/g, '').length + 2;
            printedLines += Math.max(1, Math.ceil(visibleLength / terminalCols));
            process.stdout.write(`\r\x1b[K${colors.dim}│ ${colors.reset}${colors.dim}${line}${colors.reset}\n`);
          }
        }
      }

      if (this.spinner && printed === false) {
        if (toolCallParts.length > 0) {
          const lastCall = toolCallParts[toolCallParts.length - 1];
          if (lastCall.function?.name) {
            const args = lastCall.function.arguments || '';
            let summary = args.replace(/\s+/g, ' ');
            if (summary.length > 60) summary = '...' + summary.slice(-60);
            this.spinner.update(`Calling ${lastCall.function.name}... (Chuẩn bị gọi tool) ${summary}`);
          }
        }
      }
    }

    if (streamBuffer.length > 0 && this.spinner) {
      const line = streamBuffer.replace(/\r$/, '');
      const terminalCols = process.stdout.columns || 80;
      const visibleLength = line.replace(/\x1b\[[0-9;]*m/g, '').length + 2;
      printedLines += Math.max(1, Math.ceil(visibleLength / terminalCols));
      process.stdout.write(`\r\x1b[K${colors.dim}│ ${colors.reset}${colors.dim}${line}${colors.reset}\n`);
    }

    if (this.spinner) this.spinner.stop();

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

    if (toolCalls.length === 0 && visibleContent) {
      if (printedLines > 0 && bufferToolModeContent) {
        const linesToErase = Math.min(printedLines, (process.stdout.rows || 24) - 2);
        if (linesToErase > 0) {
          process.stdout.write(`\r\x1b[K\x1b[${linesToErase}A\x1b[J`);
        }
      }

      const isFakeCompletion = !options?.usedMutatingTools && this.detectFakeCompletion(visibleContent);
      if ((options?.requireToolEvidence && this.responseNeedsToolEvidence(visibleContent)) || isFakeCompletion) {
        return {
          assistantMsg: { content: visibleContent },
          toolCalls,
          finalContent: '',
          finishReason: 'tool_evidence_required',
        };
      }
      this.printAssistantAnswer(visibleContent, startedAt, totalUsage);
      return {
        assistantMsg: { content: visibleContent },
        toolCalls,
        finalContent: visibleContent,
        finishReason,
      };
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


  getSlashSuggestions(line) {
    const query = String(line || '').trim();
    if (!query.startsWith('/')) return [];
    const enrich = item => this.enrichSlashSuggestion(item);
    if (query === '/') {
      const preferred = [
        '/help', '/new', '/history', '/exit', '/pwd', '/cd',
          '/provider', '/model', '/models', '/providers',
          '/theme:toggle', '/tui',
          '/auto', '/debug', '/doctor', '/context', '/scorecard', '/swe',
          '/read', '/write', '/glob', '/grep', '/bash',
        '/codex', '/claude', '/karpathy', '/agents',
        '/resources', '/designs', '/skills',
        '/ecc',
        '/composer', '/complete', '/ensemble', '/vote', '/orchestrate', '/search', '/undo',
      ];
      return preferred
        .map(cmd => SLASH_COMMANDS.find(item => item.cmd === cmd))
        .filter(Boolean)
        .map(enrich);
    }
    return SLASH_COMMANDS
      .filter(item => item.cmd.startsWith(query))
      .slice(0, 12)
      .map(enrich);
  }

  enrichSlashSuggestion(item) {
    if (!item) return item;
    if (item.cmd !== '/provider') return item;

    const providerNames = typeof this.ai?.listProviders === 'function'
      ? this.ai.listProviders().map(provider => provider.name).filter(Boolean)
      : Object.keys(this.ai?.providers || {});
    const uniqueProviders = [...new Set(providerNames)];
    if (uniqueProviders.length === 0) return item;

    return {
      ...item,
      usage: `/provider <${uniqueProviders.join('|')}>`,
    };
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
    const latestUserText = this.getLatestUserText(messages);
    const browserInteraction = this.isBrowserInteractionRequest(latestUserText);
    const hasBrowserEvidence = toolSummaries.some(summary => /^(MCP|BrowserDebug|OpenBrowser):/i.test(summary));
    const finalMessages = [
      ...messages,
      {
        role: 'user',
        content: [
          'You have finished using tools.',
          'Now answer the user directly in the same language as the user.',
          'Do not call more tools. Do not ask the user to provide files you already read.',
          'Use only the tool results above as evidence for claims about files, commands, tests, and changes.',
          'Start with the actual outcome, then mention only the most relevant files/commands. Avoid broad generic advice.',
          'If a tool failed, explain the concrete failure briefly and answer with the available evidence.',
          'Do not repeat the plan. Do not re-summarize unrelated project context. Do not claim memory/tool state that is not visible in the transcript.',
          browserInteraction && !hasBrowserEvidence ? 'Important: The user asked for browser interaction, but no MCP/BrowserDebug/OpenBrowser result is available. You must say the browser action was NOT performed; do not claim you clicked, filled, navigated, or inspected pages.' : '',
          toolSummaries.length ? `Tool summary:\n${toolSummaries.join('\n')}` : '',
        ].filter(Boolean).join('\n'),
      },
    ];

    try {
      if (this.spinner) {
        this.spinner.update('Thinking (final answer)... (Đang viết câu trả lời cuối)');
        this.spinner.start();
      }

      if (typeof this.ai.streamRequest === 'function') {
        return await this.streamFinalAnswer(finalMessages, startedAt, totalUsage, executionProfile, { browserInteraction, hasBrowserEvidence });
      }

      const response = await this.ai.sendRequest(finalMessages, {
        provider: executionProfile.provider,
        model: executionProfile.model,
        enableTools: false,
        signal: this.currentAbortController?.signal,
      });
      this.addUsage(totalUsage, response.usage);
      let content = response.choices?.[0]?.message?.content || '';
      if (browserInteraction && !hasBrowserEvidence && this.detectFakeCompletion(content)) {
        content = 'Chưa thực hiện được thao tác trên trình duyệt: lượt này không có bằng chứng từ MCP/BrowserDebug/OpenBrowser, nên Winter chặn câu trả lời để tránh báo sai. Hãy bật chrome-devtools MCP hoặc dùng lại yêu cầu để Winter gọi đúng browser tool.';
      }
      
      if (this.spinner) this.spinner.stop();
      
      if (content) {
        this.printAssistantAnswer(content, startedAt, totalUsage);
      }
      return content;
    } catch (error) {
      if (this.spinner) this.spinner.stop();
      if (this.isAbortError(error)) throw new Error('AbortError');
      const fallback = this.buildToolFallbackAnswer(toolSummaries, error.message);
      console.log(`\n${colors.yellow}${fallback}${colors.reset}\n`);
      return fallback;
    }
  }

  async streamFinalAnswer(messages, startedAt, totalUsage, executionProfile = null, validation = {}) {
    let content = '';
    const profile = executionProfile || this.selectExecutionProfile(messages, { enableTools: false });

    try {
      let isFirst = true;
      for await (const chunk of this.ai.streamRequest(messages, {
        provider: profile.provider,
        model: profile.model,
        enableTools: false,
        signal: this.currentAbortController?.signal,
      })) {
        if (isFirst) {
          isFirst = false;
        }
        if (chunk.usage) this.addUsage(totalUsage, chunk.usage);
        if (chunk.content) {
          content += chunk.content;
        }
        if (this.spinner && isFirst === false) {
          this.spinner.update('Generating...');
        }
      }

      if (this.spinner) this.spinner.stop();

      if (validation.browserInteraction && !validation.hasBrowserEvidence && this.detectFakeCompletion(content)) {
        content = 'Chưa thực hiện được thao tác trên trình duyệt: lượt này không có bằng chứng từ MCP/BrowserDebug/OpenBrowser, nên Winter chặn câu trả lời để tránh báo sai. Hãy bật chrome-devtools MCP hoặc dùng lại yêu cầu để Winter gọi đúng browser tool.';
      }

      if (content) {
        this.printAssistantAnswer(content, startedAt, totalUsage);
        return content;
      }
    } catch (error) {
      process.stdout.write(colors.reset);
      if (this.isAbortError(error)) throw new Error('AbortError');
      if (this.isRateLimitError(error)) throw error;
      if (this.isTimeoutError(error)) throw error;
      console.log(`${colors.dim}Streaming failed, retrying normal response: ${error.message}${colors.reset}`);
    }

    const response = await this.ai.sendRequest(messages, {
      provider: profile.provider,
      model: profile.model,
      enableTools: false,
      signal: this.currentAbortController?.signal,
    });
    this.addUsage(totalUsage, response.usage);
    content = response.choices?.[0]?.message?.content || '';
    if (validation.browserInteraction && !validation.hasBrowserEvidence && this.detectFakeCompletion(content)) {
      content = 'Chưa thực hiện được thao tác trên trình duyệt: lượt này không có bằng chứng từ MCP/BrowserDebug/OpenBrowser, nên Winter chặn câu trả lời để tránh báo sai. Hãy bật chrome-devtools MCP hoặc dùng lại yêu cầu để Winter gọi đúng browser tool.';
    }
    if (content) {
      this.printAssistantAnswer(content, startedAt, totalUsage);
    }
    return content;
  }

  printAssistantAnswer(content, startedAt, usage = {}) {
    const formatted = formatMarkdown(content);
    const footer = this.formatAnswerFooter(startedAt, usage);
    console.log(`\n${renderAssistantPanel({
      content: formatted,
      footer,
      colors,
      width: terminalWidth(72, 120, 92),
    })}\n`);
    return;
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

  buildToolPermissionDetails(request = {}) {
    const details = typeof request === 'string' ? { command: request } : { ...request };
    const toolName = details.toolName || 'Tool';
    const args = details.args && typeof details.args === 'object' ? details.args : {};
    const command = details.command || args.command || args.cmd;
    const target = details.target || args.file_path || args.path || args.cwd || args.url || args.server;
    const cwd = details.cwd || args.cwd;

    const riskByTool = {
      Bash: 'Runs a shell command from the workspace.',
      Write: 'Creates or overwrites a project file.',
      Edit: 'Modifies an existing project file.',
      MCP: 'Allows an external MCP server/tool action.',
    };

    return {
      toolName,
      risk: details.risk || riskByTool[toolName] || 'Runs a sensitive tool action.',
      command,
      target,
      cwd,
      workspace: details.workspace || this.projectPath,
    };
  }

  formatToolPermissionBody(request) {
    const c = colors;
    const details = this.buildToolPermissionDetails(request);
    const subject = details.command || details.target || 'requested action';
    const body = [
      `${c.yellow}${this.useUnicodeUi ? '⚠' : '!'}  AI requests tool permission${c.reset}`,
      `${c.dim}Tool:${c.reset} ${c.bright}${details.toolName}${c.reset}`,
      `${c.dim}Risk:${c.reset} ${details.risk}`,
    ];

    if (details.command) body.push(`${c.dim}Command:${c.reset} ${c.bright}${c.white}${details.command}${c.reset}`);
    if (!details.command && details.target) body.push(`${c.dim}Target:${c.reset} ${c.bright}${c.white}${details.target}${c.reset}`);
    if (details.cwd) body.push(`${c.dim}Working dir:${c.reset} ${details.cwd}`);
    if (details.workspace) body.push(`${c.dim}Workspace:${c.reset} ${details.workspace}`);
    if (!details.command && !details.target) body.push(`${c.dim}Action:${c.reset} ${subject}`);

    body.push(
      '',
      `${c.cyan}1.${c.reset} Allow once`,
      `${c.cyan}2.${c.reset} Allow for session (${details.toolName})`,
      `${c.cyan}3.${c.reset} Deny`
    );

    return body;
  }

  async promptToolPermission(request) {
    const c = colors;
    const width = terminalWidth(68, 100, 80);
    const body = this.formatToolPermissionBody(request);

    console.log(renderBox({
      title: 'Tool Permission',
      width,
      borderColor: c.magenta,
      titleColor: c.yellow,
      body,
      boxChars: { topLeft: '+', topRight: '+', bottomLeft: '+', bottomRight: '+', horizontal: '-', vertical: '|', teeLeft: '+', teeRight: '+' },
    }));

    while (true) {
      const answer = await new Promise(resolve => {
        this.rl.question(`${c.yellow}Choice [1/2/3]: ${c.reset}`, resolve);
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

      console.log(`${c.dim}Please choose 1, 2, or 3.${c.reset}`);
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

  async updateRecentWorkLedger({ userMessage = '', finalContent = '', toolCalls = [], usedTools = false, usedMutatingTools = false } = {}) {
    if (typeof this.session?.replaceMemory !== 'function') return;

    const toolLines = Array.isArray(toolCalls) && toolCalls.length > 0
      ? toolCalls.slice(-8).map(call => `- ${this.summarizeToolCallForLedger(call)}`).join('\n')
      : '- none';
    const status = usedMutatingTools ? 'changed project state' : (usedTools ? 'inspected project state' : 'answered without tools');
    const final = this.compactText(String(finalContent || '').replace(/\s+/g, ' ').trim(), 700, 'final answer');
    const request = this.compactText(String(userMessage || '').replace(/\s+/g, ' ').trim(), 400, 'user request');
    const content = [
      `Updated: ${new Date().toISOString()}`,
      `Status: ${status}`,
      `Last user request: ${request || '(empty)'}`,
      'Tool evidence from last turn:',
      toolLines,
      final ? `Last answer summary: ${final}` : 'Last answer summary: (empty)',
      '',
      'Instruction for next turn: treat this ledger as the source of truth for what Winter already did. Do not repeat completed inspection unless the user asks or new evidence is needed.',
    ].join('\n');

    await this.session.replaceMemory('[Recent Work Ledger]', content, 'summary');
  }

  summarizeToolCallForLedger(call = {}) {
    const fn = call.function || {};
    const name = this.tools?.normalizeToolName?.(fn.name || call.name || call.toolName || 'unknown') || fn.name || call.name || call.toolName || 'unknown';
    let args = {};
    try {
      args = typeof fn.arguments === 'string' ? JSON.parse(fn.arguments || '{}') : (call.toolArgs || fn.arguments || {});
    } catch {
      args = call.toolArgs || {};
    }
    const target = args.file_path || args.path || args.cwd || args.url || args.server || args.pattern || '';
    const command = args.command || args.cmd || '';
    const detail = command || target || '';
    return detail ? `${name}: ${this.compactText(String(detail), 180, `${name} args`)}` : name;
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
    const context = this.session?.getContext?.() || {};
    const adapterStats = context.toolCallAdapterStats?.value || context.toolCallAdapterStats;
    if (adapterStats?.total) {
      console.log(`${colors.cyan}Tool Call Adapter:${colors.reset}`);
      console.log(`  total parsed: ${adapterStats.total}`);
      const sources = Object.entries(adapterStats.bySource || {}).sort((a, b) => b[1] - a[1]);
      if (sources.length > 0) {
        console.log(`  sources: ${sources.map(([name, count]) => `${name}=${count}`).join(', ')}`);
      }
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
      await this.autoApplyWorkflowForTask(message);
      const needsTools = true;
      const canUseHeavyContext = await this.shouldUseHeavyProjectContext();
      const context = await this.getProjectContext(message, { includeHeavy: canUseHeavyContext });
      const systemPrompt = this.getSystemPrompt(context);

      // Inject @-context if any
      const atContextStr = this._pendingAtContext || '';
      this._pendingAtContext = '';
      const finalSystemPrompt = atContextStr
        ? systemPrompt + '\n\n' + atContextStr
        : systemPrompt;

      const messages = [
        { role: 'system', content: finalSystemPrompt }
      ];

      await this.compressSessionContext(false);
      const promptHistory = this.getCompressedPromptHistory({
        limit: 20,
        keepRecent: 14,
        maxTotalChars: 16000,
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

      // Smart tool routing: inject a hint for weak models
      const toolHint = this.buildToolRoutingHint(message);
      if (toolHint) {
        messages.push({ role: 'system', content: toolHint });
      }

      const { finalContent, usedMutatingTools } = await this.runConversation(messages, 'Thinking', tools);

      const allToolCalls = [];
      for (const msg of messages) {
        if (msg.role === 'assistant' && msg.tool_calls && Array.isArray(msg.tool_calls)) {
          allToolCalls.push(...msg.tool_calls);
        }
      }

      await this.session.addToHistory({ role: 'user', content: message });
      
      const historyEntry = { role: 'assistant', content: finalContent };
      if (allToolCalls.length > 0) {
        historyEntry.tool_calls = allToolCalls;
      }
      await this.session.addToHistory(historyEntry);
      await this.updateRecentWorkLedger({
        userMessage: message,
        finalContent,
        toolCalls: allToolCalls,
        usedTools: allToolCalls.length > 0,
        usedMutatingTools,
      });

      // Tự động verify: nếu AI đã dùng tools (sửa code), chạy test/build.
      if (finalContent && this.shouldAutoVerifyAfterTools(message, usedMutatingTools)) {
        const sessionContext = this.session?.getContext?.() || {};
        const profile = String(sessionContext.workflowProfile || 'general');
        const amplifier = sessionContext.smallModelAmplifier || {};
        const baseAttempts = /debug|backend|data|devops|ai/.test(profile) ? 4 : 3;
        const boostedAttempts = amplifier?.weak ? Math.max(baseAttempts, 5) : baseAttempts;
        await this.verifyAndHeal(messages, tools, boostedAttempts);
      }

    } catch (error) {
      if (this.isAbortError(error)) throw error;
      console.log(`\n${colors.red}✖ Error: ${error.message}${colors.reset}\n`);
    }
  }

  async autoApplyWorkflowForTask(taskText = '') {
    const text = String(taskText || '').trim();
    if (!text) return;

    const sessionContext = this.session?.getContext?.() || {};
    const cached = sessionContext.workflowLastTask || '';
    if (cached && cached === text) return;

    const [signals, catalog] = await Promise.all([
      this.getProjectSignals?.() || [],
      this.getStartupSkillCatalog?.() || new Set(),
    ]);
    const workflow = selectWorkflow({
      taskText: text,
      projectSignals: signals,
      skillCatalog: Array.isArray(catalog) ? catalog : [...catalog],
    });

    const existingSkills = Array.isArray(sessionContext.activeSkills?.value)
      ? sessionContext.activeSkills.value
      : (Array.isArray(sessionContext.activeSkills) ? sessionContext.activeSkills : []);
    const mergedSkills = [...new Set([...(existingSkills || []), ...(workflow.recommendedSkills || [])])];

    const hints = [
      `Task category/type: ${workflow.taskInfo?.category || 'unknown'} / ${workflow.taskInfo?.type || 'unknown'}`,
      `Workflow profile: ${workflow.profile} (depth=${workflow.depth})`,
      workflow.technologySuggestions?.length ? `Technology suggestions: ${workflow.technologySuggestions.join(' | ')}` : '',
      workflow.verificationStrategy?.length ? `Verification strategy: ${workflow.verificationStrategy.join(', ')}` : '',
      workflow.recommendedSkills?.length ? `Recommended skills: ${workflow.recommendedSkills.join(', ')}` : '',
      workflow.recommendedResources?.length ? `Recommended resources: ${workflow.recommendedResources.join(', ')}` : '',
      workflow.recommendedPlugins?.length ? `Recommended plugins: ${workflow.recommendedPlugins.join(', ')}` : '',
      workflow.recommendedRules?.length ? `Recommended rules: ${workflow.recommendedRules.join('; ')}` : '',
      'Execution: plan first (success criteria), then act with tools, then verify (test/build/lint). For UI/webapp: consult awesome-design-md before writing UI.',
    ].filter(Boolean).join('\n');

    const amplifier = buildSmallModelAmplification({
      modelTier: this.ai?._modelTier || 'medium',
      workflowProfile: workflow.profile,
      depth: workflow.depth,
    });
    const blueprint = getProfileBlueprint(workflow.profile);
    const finalHints = [
      hints,
      blueprint?.asText || '',
      amplifier.hint || '',
    ].filter(Boolean).join('\n\n');

    await this.session.updateContext('workflowLastTask', text);
    await this.session.updateContext('workflowProfile', workflow.profile);
    await this.session.updateContext('workflowDetectedTechnologies', workflow.detectedTechnologies || {});
    await this.session.updateContext('workflowVerificationStrategy', workflow.verificationStrategy || []);
    await this.session.updateContext('workflowBlueprint', blueprint?.asText || '');
    await this.session.updateContext('workflowHints', finalHints);
    await this.session.updateContext('smallModelAmplifier', amplifier);
    await this.session.updateContext('activeSkills', mergedSkills);
  }

  /**
   * Chạy verification commands (test, build) và trả về kết quả.
   */
  async inferVerificationCommands(task = '') {
    const fs = await import('fs/promises');
    const candidates = [];
    const packagePath = path.join(this.projectPath, 'package.json');
    try {
      const pkg = JSON.parse(await fs.readFile(packagePath, 'utf8'));
      const scripts = pkg.scripts || {};
      if (scripts.test) candidates.push('npm test');
      if (scripts.build && /\b(build|compile|type|typescript|tsc|frontend|ui|design|next|vite|react|debug|fix|bug|error|loi|lỗi)\b/i.test(task)) {
        candidates.push('npm run build');
      }
      if (scripts.lint && /\b(lint|style|eslint|quality|review)\b/i.test(task)) candidates.push('npm run lint');
      if (scripts.typecheck) candidates.push('npm run typecheck');
    } catch {
      // Not a Node project.
    }

    if (candidates.length === 0) return ['npm test'];
    return [...new Set(candidates)].slice(0, 3);
  }

  async runVerification(commands = null) {
    commands = Array.isArray(commands) && commands.length > 0
      ? commands
      : await this.inferVerificationCommands();
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
   * - Nếu fail, gửi lại cho AI fix
   * - Lặp đến khi pass hết hoặc hết số lần thử
   */
  async verifyAndHeal(messages, tools, maxAttempts = 5) {
    const verifCommands = await this.inferVerificationCommands(this.getLatestUserText(messages));

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`\n${colors.cyan}=== Verification Attempt ${attempt}/${maxAttempts} ===${colors.reset}`);

      const result = await this.runVerification(verifCommands);

      if (result.passed) {
        console.log(`\n${colors.green}✓ All verifications passed!${colors.reset}\n`);
        return;
      }

      // Collect error details
      const errorDetails = result.details
        .filter(r => !r.passed)
        .map(r => `Command: ${r.cmd}\n${r.output}`)
        .join('\n\n---\n\n');

      console.log(`\n${colors.yellow}Verification failed. Sending errors back to AI for fix...${colors.reset}\n`);

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
        console.log(`\n${colors.red}AI did not attempt to fix the errors. Stopping.${colors.reset}\n`);
        break;
      }
    }

    console.log(`\n${colors.red}Max verification attempts (${maxAttempts}) reached. Some issues may remain.${colors.reset}\n`);
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
    const agentDefinition = await this.agentRegistry.get(role || 'general');
    const context = await this.getProjectContext(task);
    const messages = [
      { role: 'system', content: this.getAgentDefinitionSystemPrompt(agentDefinition, context) }
    ];

    const promptHistory = this.getCompressedPromptHistory({
      limit: 40,
      keepRecent: 16,
      maxTotalChars: 16000,
    });
    if (promptHistory.summary) {
      messages.push({ role: 'system', content: `Compressed prior conversation:\n${promptHistory.summary}` });
    }
    for (const entry of promptHistory.entries) {
      messages.push({ role: entry.role, content: entry.content });
    }

    messages.push({ role: 'user', content: `Task: ${task}` });

    const agentTools = this.getAgentToolsForDefinition(agentDefinition);
    const { finalContent, usedMutatingTools } = await this.runConversation(messages, `Subagent [${agentDefinition.id}]`, agentTools);

    await this.session.addToHistory({ role: 'user', content: `[subagent:${agentDefinition.id}] ${task}` });
    await this.session.addToHistory({ role: 'assistant', content: finalContent });

    if (finalContent && this.shouldAutoVerifyAfterTools(task, usedMutatingTools)) {
      await this.verifyAndHeal(messages, agentTools, 2);
    }
  }

  async listAgentDefinitions() {
    return this.agentRegistry.list();
  }

  getAgentToolsForDefinition(agentDefinition = {}) {
    const base = this.tools.getToolDefinitions();
    const allowed = Array.isArray(agentDefinition.tools) ? agentDefinition.tools : [];
    if (allowed.length === 0) return this.getAgentTools(agentDefinition.id || 'general');
    return base.filter(tool => allowed.includes(tool.name));
  }

  getAgentDefinitionSystemPrompt(agentDefinition = {}, context = '') {
    const fallback = this.getAgentSystemPrompt(agentDefinition.id || 'general', context);
    const instructions = String(agentDefinition.instructionsPrompt || '').trim();
    const custom = instructions
      ? [
          `You are ${agentDefinition.displayName || agentDefinition.id}, a Winter custom agent.`,
          instructions,
          '',
          'AGENT CONTRACT:',
          '- Inspect real project state before editing.',
          '- Use only the provided tools and cite tool evidence in the final answer.',
          '- Patch the smallest root cause and verify when the task changes code.',
          '- Do not claim success without tool evidence.',
        ].join('\n')
      : fallback;

    const metadata = [
      `Agent id: ${agentDefinition.id || 'general'}`,
      `Agent source: ${agentDefinition.source || 'builtin'}`,
      Array.isArray(agentDefinition.tools) && agentDefinition.tools.length
        ? `Allowed tools: ${agentDefinition.tools.join(', ')}`
        : '',
    ].filter(Boolean).join('\n');

    return [custom, metadata ? `\nAGENT METADATA:\n${metadata}` : '', context ? `\nPROJECT CONTEXT:\n${context}` : ''].join('\n');
  }

  async runToolDoctor() {
    const provider = this.ai?.getActiveProvider?.() || 'unknown';
    const model = this.ai?.providers?.[provider]?.model || 'unknown';
    const tools = this.getAgentTools('plan').filter(tool => tool.name === 'Read');
    const probePath = 'README.md';
    const messages = [
      {
        role: 'system',
        content: [
          'You are Winter tool-call doctor.',
          'You must diagnose whether this provider/model can trigger a real tool execution.',
          'Call the Read tool for README.md now. Do not answer in prose before the tool call.',
          'If native tool calls are unavailable, output exactly one fallback call:',
          '<invoke name="Read"><parameter name="path">README.md</parameter></invoke>',
          '{"tool":"Read","arguments":{"path":"README.md"}}',
          'CALL_TOOL Read {"path":"README.md"}',
        ].join('\n'),
      },
      {
        role: 'user',
        content: `TOOL DOCTOR: call Read on ${probePath}.`,
      },
    ];

    console.log(`${colors.cyan}Tool doctor:${colors.reset} provider=${provider}, model=${model}`);
    const beforeEvents = this.session?.getToolEvents?.(1)?.length || 0;
    const result = await this.runConversation(messages, 'Tool doctor', tools);
    const recentEvents = this.session?.getToolEvents?.(5) || [];
    const readEvent = recentEvents.find(event => event.tool === 'Read' && event.success !== false);
    const passed = result.usedTools && Boolean(readEvent || /readme\.md/i.test(result.finalContent || ''));

    if (passed) {
      console.log(`${colors.green}✓ Tool calling works for ${provider}/${model}.${colors.reset}`);
      if (readEvent) {
        console.log(`${colors.dim}  Last Read result: ${readEvent.result?.path || probePath}${colors.reset}`);
      }
      return { success: true, provider, model, usedTools: result.usedTools, beforeEvents };
    }

    console.log(`${colors.red}✖ Tool calling did not execute for ${provider}/${model}.${colors.reset}`);
    console.log(`${colors.yellow}  Try a stronger model or use a provider that supports OpenAI-compatible tools/fallback text output.${colors.reset}`);
    return { success: false, provider, model, usedTools: result.usedTools, beforeEvents };
  }

  async getCapabilityScorecard() {
    return assessWinterCapabilities(this);
  }

  async showCapabilityScorecard() {
    const report = await this.getCapabilityScorecard();
    console.log(formatCapabilityScorecard(report, { colors }));
    return report;
  }

  async showContextDiagnostics(task = '') {
    const provider = this.ai?.getActiveProvider?.() || 'unknown';
    const model = this.ai?.providers?.[provider]?.model || 'unknown';
    const context = await this.getProjectContext(task);
    let codebaseStats = null;
    try {
      codebaseStats = this.codebaseSearcher?.indexer?.getStats?.() || null;
    } catch {
      codebaseStats = null;
    }

    const sectionNames = Array.from(context.matchAll(/^\[([^\]]+)\]/gm)).map(match => match[1]);
    const lines = [
      `${colors.cyan}${colors.bright}Winter context diagnostics${colors.reset}`,
      `Project: ${this.projectPath}`,
      `Provider/model: ${provider}/${model}`,
      `Context chars: ${context.length}`,
      `Sections: ${sectionNames.length ? sectionNames.join(', ') : 'none'}`,
    ];

    if (codebaseStats) {
      lines.push(`Codebase index: ${codebaseStats.totalFiles || 0} files, ${codebaseStats.totalChunks || 0} chunks`);
    } else {
      lines.push('Codebase index: unavailable');
    }

    lines.push('');
    lines.push(colors.dim + this.compactText(context, 3200, 'context diagnostics') + colors.reset);
    console.log(lines.join('\n'));
    return { provider, model, contextLength: context.length, sections: sectionNames, codebaseStats };
  }

  async runFullDoctor() {
    const report = await this.showCapabilityScorecard();
    console.log('');
    await this.showContextDiagnostics('doctor full codebase provider tool debug workflow');
    console.log('');
    const toolResult = await this.runToolDoctor();
    return {
      success: report.overall >= report.target && toolResult.success,
      scorecard: report,
      toolResult,
    };
  }

  async runToolDoctor() {
    return runToolDoctorDiagnostics(this);
  }

  async getCapabilityScorecard() {
    return getCapabilityScorecardReport(this);
  }

  async showCapabilityScorecard() {
    return showCapabilityScorecardDiagnostics(this);
  }

  async showContextDiagnostics(task = '') {
    return showContextDiagnosticsReport(this, task);
  }

  async runFullDoctor() {
    return runFullDoctorDiagnostics(this);
  }

  async getProjectContext(task = '', options = {}) {
    const includeHeavy = options.includeHeavy !== false;
    const useHeavyContext = includeHeavy && await this.shouldUseHeavyProjectContext();
    const modelTier = this.getActiveModelTier();
    const context = [];
    const projectPath = this.projectPath;

    const requiredLocalResources = await this.getRequiredLocalResourceSummary();
    if (requiredLocalResources) {
      context.push(requiredLocalResources);
    }

    const shouldIncludeResources = /\b(resource|resources|skill|skills|plugin|plugins|claude|codex|agent|agents|design|ui|figma|brand|mcp)\b/i.test(String(task || ''));
    const localResources = shouldIncludeResources ? await this.getLocalResourceContext() : '';
    if (localResources) {
      context.push(localResources);
    }

    const projectInstructionFiles = useHeavyContext ? await this.readProjectInstructionFiles() : [];
    for (const file of projectInstructionFiles) {
      try {
        const preview = this.compactText(file.content, 1200, 'project instruction');
        context.push(`[${file.relativePath}]\n${preview}`);
      } catch { }
    }

    if (useHeavyContext) {
      try {
        const packageJsonPath = path.join(projectPath, 'package.json');
        const stat = await fs.stat(packageJsonPath);
        if (stat.isFile()) {
          const content = await fs.readFile(packageJsonPath, 'utf-8');
          context.push(`[package.json]\n${this.compactText(content, 1600, 'package.json')}`);
        }
      } catch { }

      const shouldUseCodebaseContext = this.shouldUseCodebaseContextForTask(task);
      if (shouldUseCodebaseContext) {
        const codebaseContext = await this.buildCodebaseContext(task);
        if (codebaseContext) {
          context.push(codebaseContext);
        }

        const graphContext = await this.codebaseSearcher?.buildGraphContext?.(task, {
          maxNodes: 24,
          maxCodeBlocks: 8,
          maxCodeBlockSize: 1800,
        });
        if (graphContext) {
          context.push(`[CodeGraph Context]\n${this.compactText(graphContext, 5200, 'codegraph context')}`);
        }
      }

      // Git Context
      try {
        const { execSync } = await import('child_process');
        const gitStatus = execSync('git status --short', { cwd: projectPath, encoding: 'utf8', stdio: 'pipe' }).trim();
        if (gitStatus) {
          context.push(`[Git Status]\n${gitStatus}`);

          const gitSummary = execSync('git diff --stat --summary', { cwd: projectPath, encoding: 'utf8', stdio: 'pipe', maxBuffer: 1024 * 50 }).trim();
          if (gitSummary) {
            context.push(`[Git Summary]\n${this.compactText(gitSummary, 1200, 'git summary')}`);
          }

          // Get brief git diff for context
          const gitDiff = execSync('git diff', { cwd: projectPath, encoding: 'utf8', stdio: 'pipe', maxBuffer: 1024 * 50 }).trim().split('\n').slice(0, 30).join('\n');
          if (gitDiff) {
            context.push(`[Git Diff]\n${this.compactText(gitDiff, 2200, 'git diff')}`);
          }
        }
      } catch (e) {
        // Not a git repo or git not installed
      }
    } else {
      context.push(`[Project Context]
Light mode enabled for safety. Heavy codebase, graph, and git context are skipped outside a detected project root.`);
    }

    return this.compactText(context.join('\n\n') || 'No project context found.', this.getProjectContextBudget(modelTier), 'project context');
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
      modelTier: this.getActiveModelTier(),
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
    config.permissions = config.permissions || { allowlist: {} };
    config.permissions.allowlist = config.permissions.allowlist || { tools: [], commands: [], mcpServers: [] };

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
          console.log(`  - ${server.name} (${enabled}) -> ${server.command}${server.args?.length ? ` ${server.args.join(' ')}` : ''}`);
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
        config.permissions.allowlist.mcpServers = [...new Set([...(config.permissions.allowlist.mcpServers || []), name])];
        await this.config.save(config);
        console.log(`${colors.green}✓ Added MCP server: ${name}${colors.reset}`);
        break;
      }
      case 'preset':
      case 'install': {
        const [presetName, ...presetOptions] = rest;
        if (!presetName) {
          console.log(`${colors.yellow}Usage: /mcp preset <chrome-devtools> [--isolated] [--headless] [--browser-url <url>]${colors.reset}`);
          break;
        }
        try {
          const server = getMcpPreset(presetName, presetOptions);
          upsertMcpServer(config, server);
          await this.config.save(config);
          console.log(`${colors.green}OK Installed MCP preset: ${server.name}${colors.reset}`);
          console.log(`  ${colors.dim}${server.command} ${server.args.join(' ')}${colors.reset}`);
          if (!server.args.includes('--headless')) {
            console.log(`  ${colors.dim}Visible Chrome mode: enabled. Use --headless only for background browser runs.${colors.reset}`);
          }
          console.log(`  ${colors.dim}Inspect tools with: /mcp tools ${server.name}${colors.reset}`);
        } catch (error) {
          console.log(`${colors.red}${error.message}${colors.reset}`);
        }
        break;
      }
      case 'remove': {
        const name = rest[0];
        if (!name) {
          console.log(`${colors.yellow}Usage: /mcp remove <name>${colors.reset}`);
          break;
        }
        config.mcp.servers = (config.mcp.servers || []).filter(server => server.name !== name);
        config.permissions.allowlist.mcpServers = (config.permissions.allowlist.mcpServers || []).filter(server => server !== name);
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
      case 'tools': {
        const name = rest[0];
        if (!name) {
          console.log(`${colors.yellow}Usage: /mcp tools <name>${colors.reset}`);
          break;
        }
        const server = (config.mcp.servers || []).find(item => item.name === name && item.enabled !== false);
        if (!server) {
          console.log(`${colors.red}MCP server not configured or disabled: ${name}${colors.reset}`);
          break;
        }
        const client = new MCPClient(server);
        try {
          const tools = await client.listTools();
          console.log(`${colors.cyan}MCP Tools: ${name}${colors.reset}`);
          if (!tools.length) {
            console.log(`  ${colors.dim}No tools reported.${colors.reset}`);
          }
          tools.forEach(tool => {
            const description = tool.description ? ` - ${tool.description}` : '';
            console.log(`  ${colors.green}${tool.name}${colors.reset}${description}`);
          });
        } catch (error) {
          console.log(`${colors.red}Failed to list MCP tools: ${error.message}${colors.reset}`);
        } finally {
          await client.close();
        }
        break;
      }
      default:
        console.log(`${colors.yellow}Usage: /mcp <list|add|preset|install|remove|allow|tools>${colors.reset}`);
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

  async getClipboardImage() {
    if (process.platform !== 'win32') return null;
    try {
      const { execSync } = await import('child_process');
      const script = [
        'Add-Type -AssemblyName System.Windows.Forms',
        'Add-Type -AssemblyName System.Drawing',
        '$img = [System.Windows.Forms.Clipboard]::GetImage()',
        'if ($null -ne $img) {',
        '  $ms = New-Object System.IO.MemoryStream',
        '  $img.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)',
        '  [Convert]::ToBase64String($ms.ToArray())',
        '}',
      ].join('; ');
      const base64 = execSync('powershell.exe -NoProfile -NonInteractive -Command -', {
        input: script,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
        timeout: 10000,
      }).trim();
      return base64 ? { mime: 'image/png', base64 } : null;
    } catch {
      return null;
    }
  }

  async getClipboardPayload() {
    const image = await this.getClipboardImage();
    if (image) return { type: 'image', image };

    const text = await this.getClipboardContent();
    if (!text) return null;
    const dataImage = this.parseDataUrlImage(text);
    if (dataImage) return { type: 'image', image: dataImage };
    return { type: 'text', text };
  }
}
