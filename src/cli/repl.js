/**
 * ?? WINTER REPL ??
 * Claude Code / Codex style interactive REPL
 */

import readline from 'readline';
import { promises as fs, watch as fsWatch } from 'fs';
import { homedir } from 'os';
import { welcomeBanner, colors, applyColorTheme } from './snowflake-logo.js';
import { renderBox, supportsUnicodeUi, terminalWidth, stripAnsi, wrapText, padVisible } from './terminal-ui.js';
import { WinterInputController } from './input-controller.js';
import { ToolExecutor } from '../tools/executor.js';
import { SessionManager } from '../session/manager.js';
import { AIProviderManager } from '../ai/providers.js';
import { ConfigLoader } from './config.js';
import { PermissionManager } from '../tools/permission.js';
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
    this.sessionId = options.sessionId || null; // Nh?n sessionId t? bin
    this.version = options.version || '1.0.0'; // Nh?n version t? bin
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
  }

  async initCodebaseSearch() {
    if (this.codebaseSearcher) return;
    this.codebaseSearcher = new CodebaseSearch({ projectPath: this.projectPath });
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
    console.log(`${colors.green}? Codebase indexed:${colors.reset}`);
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

  async ensureCodebaseIndex({ verbose = false } = {}) {
    await this.initCodebaseSearch();
    const before = this.codebaseSearcher.indexer.getStats();
    if (before.totalChunks > 0) return before;

    if (verbose) {
      console.log(`${colors.dim}? Indexing codebase for semantic search...${colors.reset}`);
    }
    const indexedStats = await this.codebaseSearcher.reindex();
    if (verbose) {
      console.log(`${colors.green}? Codebase indexed: ${indexedStats.totalFiles} files, ${indexedStats.totalChunks} chunks${colors.reset}`);
    }
    return this.codebaseSearcher.indexer.getStats();
  }

  async buildCodebaseContext(task = '') {
    try {
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

      return this.compactText(lines.join('\n'), this.shouldUseCompactPrompt() ? 1800 : 3200, 'codebase context');
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
          console.log(`${colors.green}? Restored ${latest.original} from backup${colors.reset}`);
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
      compactText: (text, maxChars, label) => this.compactText(text, maxChars, label),
      summarizeToolResult: value => this.tools?.summarizeToolResult?.(value) || { ...value },
    });
  }

  async buildPromptToolResultForModel(toolName, result) {
    return buildPromptToolResultWithTokenJuice({
      toolName,
      result,
      projectPath: this.projectPath,
      tokenJuice: this.tokenJuice,
      compact: this.shouldUseCompactPrompt(),
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

    // T? ??ng ??c v? ghi nh? m?t s? t?i nguy?n c?c b? (an to?n): ch? n?p file ho?c README trong th? m?c
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
          const memoryKey = `[T? ??ng ghi nh? file ${fileName}]`;
          await this.session.replaceMemory(memoryKey, content);
          console.log(`${colors.dim}? ?? t? ??ng n?p v? ghi nh? file ${fileName}${colors.reset}`);
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
                const memoryKey = `[T? ??ng ghi nh? file ${path.basename(targetPath)}/${c}]`;
                await this.session.replaceMemory(memoryKey, content);
                console.log(`${colors.dim}? ?? t? ??ng n?p v? ghi nh? ${path.basename(targetPath)}/${c}${colors.reset}`);
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

    // N?p c?c file quy t?c d? ?n theo th? t? ?u ti?n.
    const projectInstructionFiles = await this.readProjectInstructionFiles();
    try {
      if (projectInstructionFiles.length > 0) {
        for (const file of projectInstructionFiles) {
          const memoryKey = `[Quy t?c d? ?n t? ${file.relativePath}]`;
          await this.session.replaceMemory(memoryKey, file.content);
          console.log(`${colors.dim}? ?? n?p quy t?c d? ?n t? ${file.relativePath}${colors.reset}`);
        }
      }
    } catch (e) {
      // N?u kh?ng c?, t? ??ng t?o file m?u!
      const template = `# Winter Project Rules

## ?? Project Overview
- **Name**: [T?n d? ?n]
- **Description**: [M? t? ng?n v? d? ?n]

## ?? Tech Stack
- **Languages**: JavaScript / TypeScript
- **Runtime**: Node.js
- **Frameworks**: [T? ?i?n n?u c?, VD: Express, React...]

## ?? AI Behavior & Coding Guidelines

### 1. Nguy?n T?c Code (Coding Standards)
- Lu?n ?u ti?n vi?t code s?ch (Clean Code), d? ??c v? d? b?o tr?.
- S? d?ng ES Modules (\`import/export\`) thay v? CommonJS (\`require\`) tr? khi c? l? do ??c bi?t.
- Gi? nguy?n c?c comment v? JSDoc hi?n c? trong file tr? khi ???c y?u c?u s?a.

### 2. T??ng T?c V?i Ng??i D?ng (User Interaction)
- Lu?n gi?i th?ch NG?N G?N l? do th?c hi?n thay ??i tr??c khi s?a file.
- Khi g?p l?i, h?y ?? xu?t gi?i ph?p thay v? ch? b?o l?i.
- KH?NG t? ti?n x?a code c? c?a user tr? khi ch?c ch?n n? kh?ng c?n d?ng ho?c ???c y?u c?u.

### 3. Git & Commits
- Vi?t commit message theo chu?n Conventional Commits (VD: \`feat:\`, \`fix:\`, \`docs:\`).
- Lu?n ki?m tra \`git status\` tr??c khi th?c hi?n thay ??i l?n.

### 4. X? L? File (File Operations)
- Ch? s?a nh?ng d?ng c?n thi?t, tr?nh vi?t l?i to?n b? file n?u kh?ng c?n.
- Lu?n ??m b?o file kh?ng b? l?i c? ph?p sau khi s?a.
`;
      try {
        const projectWinterMd = path.join(this.projectPath, 'winter.md');
        await fsPromises.writeFile(projectWinterMd, template, 'utf8');
        console.log(`\n${colors.green}? ?? t? ??ng t?o file winter.md m?u cho d? ?n m?i!${colors.reset}`);
        console.log(`${colors.dim}B?n c? th? ch?nh s?a file n?y ?? d?y AI c?c quy t?c ri?ng c?a d? ?n.${colors.reset}\n`);
        
        // N?p lu?n v?o memory
        await this.session.replaceMemory(`[Quy t?c d? ?n t? winter.md]`, template);
      } catch (err) {
        // B? qua n?u kh?ng ghi ???c file
      }
    }

    // ?? T? ??ng t?o design.md, skill.md, rule.md n?u ch?a c? ??????????????
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
        console.log(`${colors.green}? ?? n?ng c?p file ${doc.filename} t? local resources.${colors.reset}`);
        const memoryKey = `[Quy t?c d? ?n t? ${doc.filename}]`;
        await this.session.replaceMemory(memoryKey, doc.content);
      } catch {
        try {
          await fsPromises.writeFile(filePath, doc.content, 'utf8');
          console.log(`${colors.green}? ?? t? ??ng t?o file ${doc.filename} t? local resources!${colors.reset}`);
          const memoryKey = `[Quy t?c d? ?n t? ${doc.filename}]`;
          await this.session.replaceMemory(memoryKey, doc.content);
        } catch (err) {
          // B? qua n?u kh?ng t?o ???c
        }
      }
    }

    await this.bootstrapProjectCapabilities();
    await this.compactStartupMemories({ projectInstructionFiles, autoCreateDocs });

    // Codebase Index: warm in background, then inject summaries into model context on demand.
    this.codebaseWarmup = this.ensureCodebaseIndex({ verbose: true })
      .then(() => this.startCodebaseWatcher())
      .catch((error) => {
        console.log(`${colors.yellow}Codebase index disabled: ${error.message}${colors.reset}`);
      });

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

    // Hi?n th? l?ch s? chat n?u ?ang load l?i session c?, nh?ng ch? replay b?n t?m t?t.
    const sessionHistory = this.session.getHistory(4);
    if (sessionHistory.length > 0) {
      const columns = process.stdout.columns || 80;
      const W = Math.max(60, Math.min(Math.floor(columns * 0.95), 100));
      const titleStr = ' L?ch s? phi?n l?m vi?c ';
      const ruleChar = this.useUnicodeUi ? '?' : '-';
      const sideLine = ruleChar.repeat(Math.max(0, Math.floor((W - titleStr.length) / 2)));
      const bottomLine = ruleChar.repeat(W);

      console.log(`\n${colors.dim}${sideLine}${titleStr}${sideLine}${colors.reset}`);
      for (const msg of sessionHistory) {
        const text = this.formatStartupHistoryEntry(msg.content);
        if (msg.role === 'user') {
          console.log(`\n${colors.cyan}B?n:${colors.reset} ${text}`);
        } else if (msg.role === 'assistant') {
          console.log(`\n${colors.bright}${colors.magenta}Winter:${colors.reset} ${text}`);
        }
      }
      console.log(`\n${colors.dim}${bottomLine}${colors.reset}\n`);
    }

    // Setup readline
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: `${colors.bright}${colors.cyan}${this.useUnicodeUi ? 'winter??:' : 'winter>'}  ${colors.reset}`,
      completer: this.completer.bind(this),
    });
    this.inputController.installSlashSuggestions();

    // B?t s? ki?n Ctrl+C ?? in ra l?nh ti?p t?c session
    this.rl.on('SIGINT', () => {
      console.log(`\n\n${colors.cyan}Cảm ơn đã sử dụng Winter!${colors.reset}`);
      console.log(`${colors.yellow}Tiếp tục phiên làm việc:${colors.reset}`);
      console.log(`${colors.bright}${colors.green}winter --session ${this.session.getSessionId()}${colors.reset}\n`);
      process.exit(0);
    });

    // Hi?n th? prompt l?n ??u ti?n ngay khi kh?i ??ng xong
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
          console.log(`\n${colors.red}? Error: ${error.message}${colors.reset}\n`);
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

  formatStartupHistoryEntry(content, maxChars = 420) {
    let text = stripAnsi(String(content ?? ''))
      .replace(/\r?\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!this.useUnicodeUi) {
      text = text
        .replace(/\p{Extended_Pictographic}/gu, '')
        .replace(/[????????]/g, '-')
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

  buildInputPanel() {
    return this.inputController.buildInputPanel();
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
      console.log(`${colors.magenta}?${colors.reset} ${colors.dim}?? x?p h?ng ch? (v? tr? #${pos})${colors.reset}`);
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

      // Parse @-symbols for non-command input
      if (!input.startsWith('/')) {
        await this.initCodebaseSearch();
        if (this.atContext && this.atContext.hasAtReferences(input)) {
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
        console.log(colors.red + '\n?? h?y c?ng vi?c hi?n t?i.' + colors.reset);
      } else {
        console.log(colors.red + '\nL?i: ' + error.message + colors.reset);
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
        // X?a nh?ng d?ng ?? in tr??c ??
        if (printedLines > 0) {
          process.stdout.write('\x1b[' + printedLines + 'A\x1b[J');
        }

        let out = `\n[36m${title}[0m\n`;
        out += `[2mD?ng m?i t?n (?/?) ?? di chuy?n, [Space] ?? ch?n/b? ch?n, [Enter] ?? x?c nh?n[0m\n\n`;

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
    this.spinner = new Spinner('?ang ph?n t?ch v? chia nh? y?u c?u...');
    this.spinner.start();

    const messages = [
      { role: 'system', content: 'B?n l? chuy?n gia l?p k? ho?ch. H?y chia nh? y?u c?u c?a ng??i d?ng th?nh c?c b??c c? th?, h?nh ??ng ???c, r?t ng?n g?n (d??i 15 ch? m?i b??c). CH? TR? V? M?T M?NG JSON C?C CHU?I, KH?NG GI?I TH?CH G? TH?M. V? d?: ["T?o file index.html", "Th?m CSS styling", "Vi?t script.js"]' },
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
        console.log(`\x1b[33mKh?ng th? parse k? ho?ch. AI ph?n h?i: ${text}\x1b[0m`);
        return;
      }

      const selectedSteps = await this.showInteractiveChecklist('K? HO?CH TH?C HI?N:', items);

      if (selectedSteps.length > 0) {
        for (const step of selectedSteps) {
          await this.session.createPlan(step, task);
        }
        console.log(`\x1b[32m? ?? th?m ${selectedSteps.length} c?ng vi?c v?o Memory (g? /plans ?? xem).\x1b[0m`);

        this.rl.question(`\n\x1b[36mB?n c? mu?n AI b?t tay l?m c?ng vi?c ??U TI?N ngay b?y gi? kh?ng? [y/N]: \x1b[0m`, async (answer) => {
          if (answer.toLowerCase() === 'y') {
            await this.chat(`H?y b?t ??u th?c hi?n b??c ??u ti?n: ${selectedSteps[0]}`);
          }
        });
      } else {
        console.log(`\n\x1b[2m?? hu? k? ho?ch.\x1b[0m`);
      }
    } catch (e) {
      if (this.spinner) this.spinner.stop();
      console.log(`\x1b[31mL?i: ${e.message}\x1b[0m`);
    }
  }


  async runAutoHealing(task) {
    console.log(`\n\x1b[35m[ TDD AUTO-HEALING MODE ]\x1b[0m K?ch ho?t v?ng l?p ch?a l?nh l?i t? ??ng.`);

    // T?ng gi?i h?n loop l?n 15 ?? cho ph?p AI t? s?a l?i nhi?u l?n
    const originalRequestAssistantTurn = this.requestAssistantTurn;

    // Ch?n prompt ??c bi?t ?p AI ph?i verify
    const verifyCommands = await this.inferVerificationCommands(task);
    const autoPrompt = `TASK: ${task}

CRITICAL DEBUG/AGENT RULES:
1. Inspect the project before changing anything. Read the failing file, related caller, config, and logs.
2. Reproduce or locate the first hard failure. For frontend/runtime UI issues, use BrowserDebug when a URL/dev server is available.
3. Patch the smallest root cause with Write/Edit.
4. Run the closest verification command(s): ${verifyCommands.join(' && ')}.
5. If verification fails, read the new error, patch again, and run verification again.
6. Do not claim success until a tool result proves it.`;

    await this.chat(autoPrompt);
  }

  async runAutoCommit(context = '') {
    console.log(`\n${colors.cyan}? T?o commit message t? ??ng...${colors.reset}`);
    const diffResult = await this.tools.execute('Bash', { command: 'git diff --cached' }, { cwd: this.projectPath });

    let diff = diffResult.stdout;
    let isStaged = true;
    if (!diff || diff.trim() === '') {
      const allDiff = await this.tools.execute('Bash', { command: 'git diff' }, { cwd: this.projectPath });
      diff = allDiff.stdout;
      isStaged = false;
    }

    if (!diff || diff.trim() === '') {
      console.log(`${colors.yellow}? Kh?ng c? thay ??i n?o ?? commit.${colors.reset}`);
      if (this.running && !this.readlineClosed) this.rl.prompt();
      return;
    }

    const prompt = `B?n l? chuy?n gia Git. H?y vi?t M?T commit message duy nh?t (kh?ng gi?i th?ch th?m) cho nh?ng thay ??i sau ??y. D?ng format chu?n Conventional Commits (feat/fix/chore/refactor: ...). ${context ? `\nNg? c?nh: ${context}` : ''}\n\nDiff:\n${diff.slice(0, 6000)}`;

    this.spinner = new Spinner('?ang sinh commit message...');
    this.spinner.start();
    try {
      const response = await this.ai.sendRequest([{ role: 'user', content: prompt }], {
        model: this.ai.providers[this.ai.getActiveProvider()]?.model
      });
      if (this.spinner) this.spinner.stop();

      const message = response.choices?.[0]?.message?.content?.trim().replace(/^["']|["']$/g, '') || 'C?p nh?t m? ngu?n';

      console.log(`\n${colors.green}?? xu?t commit message:${colors.reset}`);
      console.log(`${colors.bright}${message}${colors.reset}\n`);

      this.rl.question(`${colors.yellow}B?n c? mu?n commit v?i message n?y kh?ng? [y/N/e (t? s?a)]: ${colors.reset}`, async (ans) => {
        const choice = ans.trim().toLowerCase();
        if (choice === 'y') {
          if (!isStaged) await this.tools.execute('Bash', { command: 'git add .' }, { cwd: this.projectPath });
          const res = await this.tools.execute('Bash', { command: `git commit -m "${message.replace(/"/g, '\\"')}"` }, { cwd: this.projectPath });
          console.log(res.stdout);
        } else if (choice === 'e') {
          this.rl.question(`${colors.cyan}Nh?p commit message: ${colors.reset}`, async (customMsg) => {
            if (customMsg.trim()) {
              if (!isStaged) await this.tools.execute('Bash', { command: 'git add .' }, { cwd: this.projectPath });
              const res = await this.tools.execute('Bash', { command: `git commit -m "${customMsg.replace(/"/g, '\\"')}"` }, { cwd: this.projectPath });
              console.log(res.stdout);
            }
            if (this.running && !this.readlineClosed) this.rl.prompt();
          });
          return;
        } else {
          console.log(`${colors.dim}?? hu? commit.${colors.reset}`);
        }
        if (this.running && !this.readlineClosed) this.rl.prompt();
      });
    } catch (e) {
      if (this.spinner) this.spinner.stop();
      console.log(`${colors.red}L?i: ${e.message}${colors.reset}`);
      if (this.running && !this.readlineClosed) this.rl.prompt();
    }
  }

  async runCodeReview(context = '') {
    console.log(`\n${colors.cyan}? AI ?ang soi code c?a b?n...${colors.reset}`);
    const diffResult = await this.tools.execute('Bash', { command: 'git diff HEAD' }, { cwd: this.projectPath });
    const diff = diffResult.stdout;

    if (!diff || diff.trim() === '') {
      console.log(`${colors.yellow}? Kh?ng c? thay ??i n?o ?? review.${colors.reset}`);
      return;
    }

    const prompt = `H?y ??ng vai m?t Senior Developer kh? t?nh. Review nhanh c?c thay ??i sau ??y. Ch? ra bug (n?u c?), v?n ?? b?o m?t, ho?c nh?ng ch? c?n clean code. Kh?ng c?n khen ng?i, h?y n?i th?ng v?o v?n ??. Tr?nh b?y d?ng Markdown ??p m?t. \n\n${context ? `Ng? c?nh: ${context}\n` : ''}Diff:\n${diff.slice(0, 8000)}`;

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
      `${c.bright}${c.cyan}${this.useUnicodeUi ? '? ' : ''}WINTER COMMANDS${c.reset}`,
      `${c.dim}@file context | @Agent task | !cmd bash | /theme:toggle${c.reset}`,
      '',
      `${c.bright}D? ?n & Phi?n l?m vi?c${c.reset}`,
      row(`${c.yellow}/pwd${c.reset}     Th? m?c hi?n t?i`, `${c.yellow}/session${c.reset}  Phi?n l?m vi?c`),
      row(`${c.yellow}/cd${c.reset}      ??i th? m?c`, `${c.yellow}/clear${c.reset}    X?a m?n h?nh`),
      row(`${c.yellow}/config${c.reset}  Xem c?u h?nh`, `${c.yellow}/exit${c.reset}     Tho?t`),
      '',
      `${c.bright}AI & C?ng c?${c.reset}`,
      row(`${c.yellow}/auto${c.reset}    TDD t? s?a l?i`, `${c.yellow}/debug${c.reset}   Auto debug l?i`),
      row(`${c.yellow}/doctor${c.reset}  Ki?m tra tool-call`, `${c.yellow}/agent${c.reset}   Ch?y sub-agent`),
      row(`${c.yellow}/swe${c.reset}     SWE workflow`, `${c.yellow}/plan${c.reset}    L?p k? ho?ch`),
      row(`${c.yellow}/read${c.reset}    ??c file`, `${c.yellow}/write${c.reset}   Ghi file`),
      row(`${c.yellow}/bash${c.reset}    Ch?y l?nh terminal`, `${c.yellow}/grep${c.reset}    T?m trong file`),
      row(`${c.yellow}/glob${c.reset}    T?m file theo pattern`, `${c.yellow}/image${c.reset}   ?nh/file/clipboard`),
      row(`${c.yellow}/paste${c.reset}   D?n text/?nh clipboard`, `${c.yellow}/composer${c.reset}  Multi-file edit`),
      row(`${c.yellow}/complete${c.reset} G?i ? code`, `${c.yellow}/search${c.reset}   T?m ki?m code`),
      row(`${c.yellow}/browse${c.reset}   M? URL trong tr?nh duy?t`, `${c.yellow}/page-agent${c.reset} GUI Agent resources`),
      row(`${c.yellow}/ensemble${c.reset} Ch?y nhi?u AI`, `${c.yellow}/vote${c.reset}     B?nh ch?n hay nh?t`),
      row(`${c.yellow}/orchestrate${c.reset} Pipeline ?a model`, `${c.yellow}/undo${c.reset}     Undo backup`),
      row(`${c.yellow}/ecc${c.reset}      ECC resource browser`, `${c.yellow}/codex${c.reset}    Codex resources`),
      '',
      `${c.bright}Git Auto-Pilot${c.reset}`,
      row(`${c.yellow}/commit${c.reset}  AI t? vi?t commit`, `${c.yellow}/review${c.reset}  AI review code thay ??i`),
      '',
      `${c.bright}C?u h?nh Model${c.reset}`,
      row(`${c.yellow}/provider${c.reset} ??i provider AI`, `${c.yellow}/model${c.reset}    ??i model`),
      row(`${c.yellow}/providers${c.reset} Danh s?ch provider`, `${c.yellow}/models${c.reset}   Danh s?ch model`),
      row(`${c.yellow}/mcp${c.reset}      MCP server mgmt`, `${c.yellow}/permissions${c.reset} Quy?n/allowlist`),
      '',
      `${c.bright}B? nh? & K? n?ng${c.reset}`,
      row(`${c.yellow}/remember${c.reset} L?u v?o b? nh?`, `${c.yellow}/memories${c.reset} Xem b? nh?`),
      row(`${c.yellow}/skills${c.reset}  Danh s?ch k? n?ng`, `${c.yellow}/designs${c.reset}  H? th?ng thi?t k?`),
    ];

    console.log(`
${renderBox({
      title: `${c.bright}${c.cyan}WINTER COMMANDS${c.reset}`,
      width,
      borderColor: c.magenta,
      titleColor: c.cyan,
      body,
    })}
${c.dim}G? tin nh?n tr?c ti?p ?? chat ? ESC ?? h?y ? Prompt t? x?p h?ng ch?${c.reset}
`);
  }

  showHelp() {
    console.log(`
${colors.cyan}? WINTER COMMANDS${colors.reset}
${colors.dim}${''.padEnd(50, '?')}${colors.reset}

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
        const icon = e.isDirectory ? '??' : '??';
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
            entries.forEach(e => console.log(`  ${e.isDirectory ? '??' : '??'} ${e.name}`));
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
        const active = p.name === this.ai.getActiveProvider() ? ` ${colors.green}? active${colors.reset}` : '';
        const status = p.ready ? `${colors.green}?${colors.reset}` : `${colors.red}?${colors.reset}`;
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
        return byName(['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob', 'BrowserDebug', 'WebFetch', 'Parallel']);
      case 'research':
        return byName(['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch', 'Parallel']);
      case 'design':
      case 'ui':
        return byName(['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob', 'BrowserDebug', 'WebFetch']);
      default:
        return byName(['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'BrowserDebug', 'WebFetch', 'WebSearch', 'Parallel', 'Agent']);
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

  actionRequiresTools(messages = []) {
    const text = this.getLatestUserText(messages).toLowerCase();
    if (!text.trim()) return false;

    const actionPattern = /\b(fix|repair|bug|debug|implement|create|write|edit|modify|update|delete|remove|refactor|run|test|build|commit|push|publish|install|check|inspect|read|scan|grep|search|change|apply|patch|sua|lam|tao|ghi|doc|xoa|chay|kiem tra|cai|them|doi|review|tim)\b/i;
    const targetPattern = /\b(file|repo|project|code|src|test|build|git|npm|node|folder|directory|cli|tool|provider|model|config|readme|package\.json|du an|thu muc|tap tin|loi|chuc nang)\b|[A-Za-z]:[\\/]|\.js\b|\.ts\b|\.tsx\b|\.json\b|\.md\b/i;
    const pureQuestionPattern = /^(what|why|how|when|where|is|are|can|could|should|would|tai sao|vi sao|la gi|co nen|co phai)\b/i;

    if (pureQuestionPattern.test(text) && !actionPattern.test(text)) return false;
    return actionPattern.test(text) && targetPattern.test(text);
  }

  shouldAutoVerifyAfterTools(originalMessage = '', usedMutatingTools = false) {
    if (!usedMutatingTools) return false;
    const text = String(originalMessage || '').toLowerCase();
    if (!text.trim()) return false;
    if (/\b(skip tests?|no verify|don't verify|khong test|khong verify|bo qua test)\b/i.test(text)) {
      return false;
    }
    return /\b(fix|bug|error|test|build|lint|typecheck|compile|refactor|implement|edit|write|change|patch|debug|sua|loi|kiem tra|bien dich|trien khai|lam|doi|viet)\b/i.test(text);
  }

  responseNeedsToolEvidence(content = '') {
    const text = String(content || '').toLowerCase();
    if (!text.trim()) return false;

    const clarification = /(?:c?n th?m|cho m?nh|vui l?ng|please provide|which file|what file|need more|clarify|kh?ng r?|ch?a r?|file n?o|th? m?c n?o)/i;
    if (clarification.test(text)) return false;
    return true;
  }

  buildToolEvidenceCorrection(messages = []) {
    const request = this.getLatestUserText(messages);
    return [
      'Runtime correction: the user requested an action that requires tool evidence.',
      'Your previous response did not use any tool, so it was blocked to avoid falsely claiming completion.',
      'Now use the available tools to inspect/edit/run/check as needed. Do not say the task is done until a tool result proves it.',
      'If native tool calls are not supported by this model/provider, output exactly one fallback tool call and no prose, for example:',
      '<invoke name="Read"><parameter name="path">README.md</parameter></invoke>',
      '{"tool":"Read","arguments":{"path":"README.md"}}',
      'CALL_TOOL Read {"path":"README.md"}',
      `Original user request: ${request}`,
    ].join('\n');
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

    if (assistantMsg.content && toolCalls.length === 0) {
      if (options?.requireToolEvidence && this.responseNeedsToolEvidence(assistantMsg.content)) {
        return { assistantMsg, toolCalls, finalContent: '', finishReason: 'tool_evidence_required' };
      }
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
      if (options?.requireToolEvidence && this.responseNeedsToolEvidence(visibleContent)) {
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
      if (key.ctrl && key.name === 'v') {
        void this.handleDirectClipboardPaste();
        return;
      }
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
        console.log(`\n\x1b[31m[ ?? nh?n l?nh H?Y... AI s? k?t th?c ? thao t?c ti?p theo ]\x1b[0m`);
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

  async handleDirectClipboardPaste() {
    if (this._handlingDirectClipboardPaste || this.readlineClosed || !this.running) return false;
    this._handlingDirectClipboardPaste = true;
    try {
      const image = await this.getClipboardImage();
      if (!image) return false;

      const prompt = (this.rl?.line || '').trim() || 'Analyze this pasted clipboard image.';
      this.closeSlashMenu();
      if (this.rl?.write) {
        this.rl.write(null, { ctrl: true, name: 'u' });
      }

      this.inputQueue = this.inputQueue
        .then(async () => {
          this.closeInputBox();
          await this.processPastedImageTask(prompt, image);
        })
        .catch((error) => {
          this.closeInputBox();
          console.log(`\n${colors.red}? Paste image error: ${error.message}${colors.reset}\n`);
          if (this.running && !this.readlineClosed) this.showInputPrompt();
        });
      return true;
    } finally {
      this._handlingDirectClipboardPaste = false;
    }
  }

  async processPastedImageTask(prompt, image) {
    this.isProcessing = true;
    this.isCancelled = false;
    try {
      await this.chat(prompt, [image]);
    } finally {
      this.isProcessing = false;
      if (this.taskQueue.length > 0) {
        const nextTask = this.taskQueue.shift();
        setTimeout(() => this.processInputTask(nextTask), 0);
      } else if (!this.readlineClosed) {
        this.showInputPrompt();
      }
    }
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
      process.stdout.write(`  ${colors.dim}... v? ${matches.length - maxDisplay} l?nh kh?c (g? ti?p ?? l?c)${colors.reset}\n`);
    }

    readline.clearLine(process.stdout, 1);
    process.stdout.write(`${colors.dim}?/? ch?n ? Enter/Tab d?ng ? Esc ??ng${colors.reset}\n`);

    // X?a c?c d?ng th?a n?u s? l??ng d?ng m?i ?t h?n s? l??ng d?ng c?
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
    const enrich = item => this.enrichSlashSuggestion(item);
    if (query === '/') {
      const preferred = [
        '/help', '/new', '/history', '/exit', '/pwd', '/cd',
          '/provider', '/model', '/models', '/providers',
          '/theme:toggle',
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
    const footer = this.formatAnswerFooter(startedAt, usage);
    const body = String(formatted || '').split(/\r?\n/);
    console.log(`\n${renderBox({
      title: 'Assistant',
      width: terminalWidth(72, 120, 92),
      borderColor: colors.blue,
      titleColor: colors.cyan,
      body: [...body, '', `${colors.dim}${footer}${colors.reset}`],
    })}\n`);
    return;
    console.log(`${colors.dim}${'?'.repeat(50)}${colors.reset}`);
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
    const side = this.useUnicodeUi ? '?' : '|';
    const warn = this.useUnicodeUi ? '?' : '!';
    process.stdout.write(`${colors.magenta}${side}${colors.reset}   ${colors.yellow}${warn}  AI mu?n ch?y: ${colors.bright}${commandText}${colors.reset}\n`);
    process.stdout.write(`${colors.magenta}${side}${colors.reset}   ${colors.cyan}1.${colors.reset} Cho ph?p\n`);
    process.stdout.write(`${colors.magenta}${side}${colors.reset}   ${colors.cyan}2.${colors.reset} Cho ph?p trong phi?n\n`);
    process.stdout.write(`${colors.magenta}${side}${colors.reset}   ${colors.cyan}3.${colors.reset} Kh?ng cho ph?p\n`);

    while (true) {
      const answer = await new Promise(resolve => {
        this.rl.question(`${colors.magenta}${side}${colors.reset}   ${colors.yellow}Ch?n [1/2/3]: ${colors.reset}`, resolve);
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

      process.stdout.write(`${colors.magenta}${side}${colors.reset}   ${colors.dim}Vui l?ng ch?n 1, 2 ho?c 3.${colors.reset}\n`);
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
      console.log(`${colors.green}? Compressed ${compressed.omittedCount} old message(s) into session summary.${colors.reset}`);
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
        ? `${colors.green}? Confirmed${colors.reset}`
        : `${colors.dim}Cancelled${colors.reset}`);
    }
  }

  async handleWatchCommand(args = []) {
    const action = args[0];
    if (action === 'stop') {
      this.stopWatchers();
      console.log(`${colors.green}? Watcher stopped${colors.reset}`);
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
    console.log(`${colors.green}? Watching ${this.projectPath}${colors.reset}`);
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
      const context = await this.getProjectContext(message);
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
      const { finalContent, usedMutatingTools } = await this.runConversation(messages, 'Thinking', tools);

      await this.session.addToHistory({ role: 'user', content: message });
      await this.session.addToHistory({ role: 'assistant', content: finalContent });

      // T? ??ng verify: n?u AI ?? d?ng tools (s?a code), ch?y test/build
      if (finalContent && this.shouldAutoVerifyAfterTools(message, usedMutatingTools)) {
        const sessionContext = this.session?.getContext?.() || {};
        const profile = String(sessionContext.workflowProfile || 'general');
        const amplifier = sessionContext.smallModelAmplifier || {};
        const baseAttempts = /debug|backend|data|devops|ai/.test(profile) ? 4 : 3;
        const boostedAttempts = amplifier?.weak ? Math.max(baseAttempts, 5) : baseAttempts;
        await this.verifyAndHeal(messages, tools, boostedAttempts);
      }

    } catch (error) {
      console.log(`\n${colors.red}? Error: ${error.message}${colors.reset}\n`);
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
   * Ch?y verification commands (test, build) v? tr? v? k?t qu?
   */
  async inferVerificationCommands(task = '') {
    const fs = await import('fs/promises');
    const candidates = [];
    const packagePath = path.join(this.projectPath, 'package.json');
    try {
      const pkg = JSON.parse(await fs.readFile(packagePath, 'utf8'));
      const scripts = pkg.scripts || {};
      if (scripts.test) candidates.push('npm test');
      if (scripts.build && /\b(build|compile|type|typescript|tsc|frontend|ui|design|next|vite|react|debug|fix|bug|error|l?i)\b/i.test(task)) {
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
   * V?ng l?p t? ??ng verify + s?a l?i:
   * - Ch?y test/build
   * - N?u fail, g?i l?i cho AI fix
   * - L?p ??n khi pass h?t ho?c h?t s? l?n th?
   */
  async verifyAndHeal(messages, tools, maxAttempts = 5) {
    const verifCommands = await this.inferVerificationCommands(this.getLatestUserText(messages));

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`\n${colors.cyan}=== Verification Attempt ${attempt}/${maxAttempts} ===${colors.reset}`);

      const result = await this.runVerification(verifCommands);

      if (result.passed) {
        console.log(`\n${colors.green}? All verifications passed!${colors.reset}\n`);
        return;
      }

      // Collect error details
      const errorDetails = result.details
        .filter(r => !r.passed)
        .map(r => `Command: ${r.cmd}\n${r.output}`)
        .join('\n\n---\n\n');

      console.log(`\n${colors.yellow}? Verification failed. Sending errors back to AI for fix...${colors.reset}\n`);

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
        console.log(`\n${colors.red}? AI did not attempt to fix the errors. Stopping.${colors.reset}\n`);
        break;
      }
    }

    console.log(`\n${colors.red}? Max verification attempts (${maxAttempts}) reached. Some issues may remain.${colors.reset}\n`);
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
      console.log(`${colors.green}? Tool calling works for ${provider}/${model}.${colors.reset}`);
      if (readEvent) {
        console.log(`${colors.dim}  Last Read result: ${readEvent.result?.path || probePath}${colors.reset}`);
      }
      return { success: true, provider, model, usedTools: result.usedTools, beforeEvents };
    }

    console.log(`${colors.red}? Tool calling did not execute for ${provider}/${model}.${colors.reset}`);
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
      codebaseStats = await this.ensureCodebaseIndex({ verbose: false });
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

    const codebaseContext = await this.buildCodebaseContext(task);
    if (codebaseContext) {
      context.push(codebaseContext);
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
          console.log(`  ? ${server.name} (${enabled}) -> ${server.command}${server.args?.length ? ` ${server.args.join(' ')}` : ''}`);
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
        console.log(`${colors.green}? Added MCP server: ${name}${colors.reset}`);
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
        console.log(`${colors.green}? Removed MCP server: ${name}${colors.reset}`);
        break;
      }
      case 'allow': {
        const name = rest[0];
        if (!name) {
          console.log(`${colors.yellow}Usage: /mcp allow <name>${colors.reset}`);
          break;
        }
        await this.config.setPermissionAllowlist({ mcpServers: [name] });
        console.log(`${colors.green}? MCP server allowed: ${name}${colors.reset}`);
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
        console.log(`${colors.green}? Allowed ${kind}: ${value}${colors.reset}`);
        break;
      }
      case 'prompt': {
        const value = String(rest[0] || '').toLowerCase();
        await this.config.setPermissionAllowlist({ promptByDefault: !(value === 'off' || value === 'false' || value === '0' || value === 'no') });
        console.log(`${colors.green}? Updated prompt policy${colors.reset}`);
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
