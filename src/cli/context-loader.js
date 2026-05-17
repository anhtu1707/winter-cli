import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import path from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * ContextLoader — Loads project context, resource paths, and instruction files.
 * Extracted from WinterREPL to reduce repl.js size.
 */
export class ContextLoader {
  constructor({ projectPath, session, tools } = {}) {
    this.projectPath = projectPath;
    this.session = session;
    this.tools = tools;
  }

  getProjectInstructionFiles() {
    return ['winter.md', 'WINTER.md', 'CLAUDE.md', '.claude/CLAUDE.md', 'design.md', 'skill.md', 'rule.md'];
  }

  async readProjectInstructionFiles() {
    const files = [];
    const seen = new Set();

    for (const relativePath of this.getProjectInstructionFiles()) {
      const filePath = path.join(this.projectPath, relativePath);
      const normalizedPath = path.normalize(filePath).toLowerCase();

      if (seen.has(normalizedPath)) continue;
      seen.add(normalizedPath);

      try {
        const stat = await fs.stat(filePath).catch(() => null);
        if (!stat || !stat.isFile()) continue;

        const content = await fs.readFile(filePath, 'utf8');
        files.push({ relativePath, filePath, content });
      } catch {
        // Ignore unreadable instruction files.
      }
    }

    return files;
  }

  getResourceRoot() {
    const projectLocalRoot = path.join(this.projectPath, 'resources', 'local');
    const packageLocalRoot = path.join(PACKAGE_ROOT, 'resources', 'local');

    if (this.projectPath === PACKAGE_ROOT) return projectLocalRoot;
    if (existsSync(projectLocalRoot)) return projectLocalRoot;

    return packageLocalRoot;
  }

  getResourcePaths() {
    const localRoot = this.getResourceRoot();
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

  async readTextIfExists(filePath, maxChars = 2000) {
    try {
      const stat = await fs.stat(filePath).catch(() => null);
      if (!stat || !stat.isFile()) return '';
      const content = await fs.readFile(filePath, 'utf8');
      return this.compactText(content.replace(/^\uFEFF/, ''), maxChars, filePath);
    } catch {
      return '';
    }
  }

  getUserResourcePaths() {
    const home = homedir();
    return {
      codexRoot: path.join(home, '.codex'),
      codexSkills: path.join(home, '.codex', 'skills'),
      codexPlugins: path.join(home, '.codex', 'plugins'),
      codexRules: path.join(home, '.codex', 'rules'),
      codexMemories: path.join(home, '.codex', 'memories'),
      claudeRoot: path.join(home, '.claude'),
      claudeSkills: path.join(home, '.claude', 'skills'),
      claudePlugins: path.join(home, '.claude', 'plugins'),
      claudeRules: path.join(home, '.claude', 'rules'),
      claudeMemories: path.join(home, '.claude', 'memories'),
    };
  }

  async listPathEntries(target, limit = 100) {
    try {
      const entries = await fs.readdir(target, { withFileTypes: true });
      const items = entries
        .filter(entry => entry.isDirectory() || entry.isFile())
        .map(entry => ({
          name: entry.name,
          isDirectory: entry.isDirectory(),
        }))
        .sort((a, b) => {
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return a.name.localeCompare(b.name);
        });

      return items.slice(0, limit);
    } catch {
      return [];
    }
  }

  async getLocalResourceContext() {
    try {
      const manifestPath = this.getResourcePaths().manifest;
      const raw = await fs.readFile(manifestPath, 'utf8');
      const manifest = JSON.parse(raw.replace(/^\uFEFF/, ''));
      const paths = this.getResourcePaths();
      const userPaths = this.getUserResourcePaths();
      const [claudeSkills, codexSkills, claudePlugins, codexMemories] = await Promise.all([
        this.listPathEntries(paths.claude.skills, 20),
        this.listPathEntries(paths.codex.skills, 20),
        this.listPathEntries(paths.claude.plugins, 20),
        this.listPathEntries(paths.codex.memories, 20),
      ]);
      const [userCodexSkills, userCodexPlugins, userCodexRules, userCodexMemories, userClaudeSkills, userClaudePlugins] = await Promise.all([
        this.listPathEntries(userPaths.codexSkills, 20),
        this.listPathEntries(userPaths.codexPlugins, 20),
        this.listPathEntries(userPaths.codexRules, 20),
        this.listPathEntries(userPaths.codexMemories, 20),
        this.listPathEntries(userPaths.claudeSkills, 20),
        this.listPathEntries(userPaths.claudePlugins, 20),
      ]);

      const lines = [];
      lines.push('[Local Resources]');
      lines.push(`- Root: ${manifest.root || paths.localRoot}`);

      for (const resource of manifest.localResources || []) {
        lines.push(`- ${resource.name}: ${resource.files} files, ${(resource.bytes / 1024 / 1024).toFixed(2)} MB`);
      }

      if (manifest.redacted?.length) {
        lines.push(`- Redacted: ${manifest.redacted.join('; ')}`);
      }

      lines.push('- Use Read/Grep/Glob to inspect any local resource when it matters for the task.');
      lines.push('- Local resource families: agents.md, awesome-design-md, claude, codex, karpathy-tools.');
      lines.push(`- User resource roots: ${userPaths.codexRoot}, ${userPaths.claudeRoot}`);

      if (claudeSkills.length > 0) {
        lines.push(`- Claude skills: ${claudeSkills.slice(0, 10).map(item => item.name).join(', ')}${claudeSkills.length > 10 ? ', ...' : ''}`);
      }
      if (claudePlugins.length > 0) {
        lines.push(`- Claude plugin roots: ${claudePlugins.slice(0, 10).map(item => item.name).join(', ')}${claudePlugins.length > 10 ? ', ...' : ''}`);
      }
      if (codexSkills.length > 0) {
        lines.push(`- Codex skills: ${codexSkills.slice(0, 10).map(item => item.name).join(', ')}${codexSkills.length > 10 ? ', ...' : ''}`);
      }
      if (codexMemories.length > 0) {
        lines.push(`- Codex memories: ${codexMemories.slice(0, 10).map(item => item.name).join(', ')}${codexMemories.length > 10 ? ', ...' : ''}`);
      }
      if (userCodexSkills.length > 0) {
        lines.push(`- Home Codex skills: ${userCodexSkills.slice(0, 10).map(item => item.name).join(', ')}${userCodexSkills.length > 10 ? ', ...' : ''}`);
      }
      if (userCodexPlugins.length > 0) {
        lines.push(`- Home Codex plugins: ${userCodexPlugins.slice(0, 10).map(item => item.name).join(', ')}${userCodexPlugins.length > 10 ? ', ...' : ''}`);
      }
      if (userCodexRules.length > 0) {
        lines.push(`- Home Codex rules: ${userCodexRules.slice(0, 10).map(item => item.name).join(', ')}${userCodexRules.length > 10 ? ', ...' : ''}`);
      }
      if (userCodexMemories.length > 0) {
        lines.push(`- Home Codex memories: ${userCodexMemories.slice(0, 10).map(item => item.name).join(', ')}${userCodexMemories.length > 10 ? ', ...' : ''}`);
      }
      if (userClaudeSkills.length > 0) {
        lines.push(`- Home Claude skills: ${userClaudeSkills.slice(0, 10).map(item => item.name).join(', ')}${userClaudeSkills.length > 10 ? ', ...' : ''}`);
      }
      if (userClaudePlugins.length > 0) {
        lines.push(`- Home Claude plugins: ${userClaudePlugins.slice(0, 10).map(item => item.name).join(', ')}${userClaudePlugins.length > 10 ? ', ...' : ''}`);
      }

      return lines.join('\n');
    } catch {
      return '';
    }
  }

  async getRequiredLocalResourceSummary() {
    const paths = this.getResourcePaths();
    const karpathyPath = path.join(paths.karpathy, 'CLAUDE.md');
    const agentsPath = path.join(paths.agents, 'AGENTS.md');
    const designReadmePath = path.join(paths.localRoot, 'awesome-design-md', 'README.md');

    const [karpathy, agents, designReadme, designBrands] = await Promise.all([
      this.readTextIfExists(karpathyPath, 2200),
      this.readTextIfExists(agentsPath, 1800),
      this.readTextIfExists(designReadmePath, 1600),
      this.listPathEntries(paths.designs, 40),
    ]);

    const hasRequired = Boolean(karpathy || agents || designReadme || designBrands.length > 0);
    if (!hasRequired) return '';

    const lines = [];
    lines.push('[Required Local Resource Rules]');
    lines.push('- These rules are mandatory for every project session and every model size. Do not route quality down for smaller models.');
    lines.push(`- Karpathy tools: ${path.relative(this.projectPath, karpathyPath)}`);
    lines.push('  Apply: think before coding, state assumptions when needed, keep solutions simple, make surgical changes, and verify against concrete success criteria.');
    lines.push(`- Agent rules: ${path.relative(this.projectPath, agentsPath)}`);
    lines.push('  Apply: inspect source before edits, keep dependency and lockfile changes synced, prefer TypeScript for new TS/Next utilities, and use the appropriate dev/test command for the task.');
    lines.push(`- Design system corpus: ${path.relative(this.projectPath, designReadmePath)} and ${path.relative(this.projectPath, paths.designs)}`);
    lines.push('  Apply: for UI/brand/design tasks, search the design-md corpus first and follow the closest existing brand/design guidance instead of inventing style from scratch.');
    lines.push('- Use Read/Grep/Glob to inspect the full resource files whenever task details require more than this startup summary.');

    const brandNames = designBrands
      .filter(item => item.isDirectory)
      .map(item => item.name)
      .slice(0, 16);
    if (brandNames.length > 0) {
      lines.push(`- Available design-md examples include: ${brandNames.join(', ')}${designBrands.length > brandNames.length ? ', ...' : ''}`);
    }

    const evidence = [];
    if (/Think Before Coding|Simplicity First|Surgical Changes|Goal-Driven Execution/i.test(karpathy)) {
      evidence.push('karpathy-tools confirms Think Before Coding, Simplicity First, Surgical Changes, and Goal-Driven Execution.');
    }
    if (/development server|dependencies|lockfile|TypeScript/i.test(agents)) {
      evidence.push('agents.md confirms workflow, dependency, lockfile, and TypeScript guidance.');
    }
    if (/design|brand|guideline/i.test(designReadme)) {
      evidence.push('awesome-design-md provides brand/design guidance to consult on UI work.');
    }
    if (evidence.length > 0) {
      lines.push(`- Startup evidence: ${evidence.join(' ')}`);
    }

    return lines.join('\n');
  }

  async getProjectSignals() {
    const signals = [];

    try {
      const packageJsonPath = path.join(this.projectPath, 'package.json');
      const raw = await fs.readFile(packageJsonPath, 'utf8');
      const pkg = JSON.parse(raw);

      signals.push(String(pkg.name || '').toLowerCase());
      signals.push(String(pkg.description || '').toLowerCase());

      for (const key of ['dependencies', 'devDependencies', 'peerDependencies']) {
        const deps = pkg[key] || {};
        for (const depName of Object.keys(deps)) {
          signals.push(depName.toLowerCase());
        }
      }

      for (const script of Object.values(pkg.scripts || {})) {
        signals.push(String(script).toLowerCase());
      }
    } catch {
      // Ignore package.json parsing issues.
    }

    try {
      const entries = await fs.readdir(this.projectPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        signals.push(path.extname(entry.name).toLowerCase().slice(1));
        signals.push(entry.name.toLowerCase());
      }
    } catch {
      // Ignore directory scan issues.
    }

    return signals.filter(Boolean);
  }

  async getStartupSkillCatalog() {
    const catalog = new Set(['coding', 'design', 'debug', 'refactor', 'test', 'security', 'performance']);
    const resourcePaths = this.getResourcePaths();
    const userPaths = this.getUserResourcePaths();
    const folders = [resourcePaths.claude.skills, resourcePaths.codex.skills, userPaths.claudeSkills, userPaths.codexSkills];

    for (const folder of folders) {
      const entries = await this.listPathEntries(folder, 200);
      for (const entry of entries) {
        catalog.add(entry.name);
      }
    }

    return catalog;
  }

  async inferStartupSkills() {
    const catalog = await this.getStartupSkillCatalog();
    const signals = await this.getProjectSignals();
    const normalizedSignals = new Set(signals.map(value => value.toLowerCase()));

    const hasAny = (...items) => items.some(item => normalizedSignals.has(item));
    const activeSkills = new Set(['coding', 'debug', 'refactor', 'test']);

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

  compactText(text, maxChars = 1200, label = 'text') {
    if (!text || text.length <= maxChars) return text || '';
    return text.slice(0, maxChars) + `\n\n[... ${label} truncated at ${maxChars} chars]`;
  }
}
