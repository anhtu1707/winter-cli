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
      winter: {
        root: PACKAGE_ROOT,
        skills: path.join(PACKAGE_ROOT, 'skills'),
        memories: path.join(PACKAGE_ROOT, 'memories'),
      },
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
      pageAgent: path.join(localRoot, 'page-agent'),
      ecc: path.join(localRoot, 'ecc'),
      eccReadme: path.join(localRoot, 'ecc', 'README.md'),
      gsapSkills: path.join(localRoot, 'gsap-skills'),
      gsapSkillsIndex: path.join(localRoot, 'gsap-skills', 'skills', 'llms.txt'),
      hermesAgentCore: path.join(localRoot, 'hermes-agent-core'),
      hermesAgentCoreAgents: path.join(localRoot, 'hermes-agent-core', 'AGENTS.md'),
      hermesAgentCoreSkills: path.join(localRoot, 'hermes-agent-core', 'skills'),
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

  async readFirstExisting(basePath, candidates = [], maxChars = 1800) {
    for (const candidate of candidates) {
      const filePath = path.join(basePath, candidate);
      const content = await this.readTextIfExists(filePath, maxChars);
      if (content) {
        return { filePath, content };
      }
    }
    return { filePath: '', content: '' };
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
      const [winterSkills, winterMemories, claudeSkills, codexSkills, claudePlugins, codexMemories] = await Promise.all([
        this.listPathEntries(paths.winter.skills, 20),
        this.listPathEntries(paths.winter.memories, 20),
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
      lines.push('- Local resource families: winter skills, winter memories, agents.md, awesome-design-md, claude, codex, karpathy-tools, page-agent, ecc, gsap-skills, hermes-agent-core.');
      lines.push(`- User resource roots: ${userPaths.codexRoot}, ${userPaths.claudeRoot}`);

      if (winterSkills.length > 0) {
        lines.push(`- Winter packaged skills: ${winterSkills.slice(0, 10).map(item => item.name).join(', ')}${winterSkills.length > 10 ? ', ...' : ''}`);
      }
      if (winterMemories.length > 0) {
        lines.push(`- Winter packaged memories: ${winterMemories.slice(0, 10).map(item => item.name).join(', ')}${winterMemories.length > 10 ? ', ...' : ''}`);
      }
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
    const pageAgentReadmePath = path.join(paths.pageAgent, 'README.md');
    const pageAgentAgentsPath = path.join(paths.pageAgent, 'AGENTS.md');
    const pageAgentWinterPath = path.join(paths.pageAgent, 'WINTER.md');
    const gsapReadmePath = path.join(paths.gsapSkills, 'README.md');
    const gsapIndexPath = paths.gsapSkillsIndex;
    const hermesReadmePath = path.join(paths.hermesAgentCore, 'README.md');
    const hermesAgentsPath = paths.hermesAgentCoreAgents;
    const hermesRoutinesPath = path.join(paths.hermesAgentCore, 'hermes-already-has-routines.md');
    const winterCodingSkillPath = path.join(paths.winter.skills, 'coding.md');
    const winterDebugSkillPath = path.join(paths.winter.skills, 'debug.md');
    const winterTestSkillPath = path.join(paths.winter.skills, 'test.md');
    const winterMemoryReadmePath = path.join(paths.winter.memories, 'readme.md');

    const [
      karpathy,
      agents,
      designReadme,
      designBrands,
      pageAgentWinter,
      pageAgentAgents,
      gsapReadme,
      gsapIndex,
      hermesReadme,
      hermesAgents,
      hermesRoutines,
      hermesSkillFamilies,
      winterCodingSkill,
      winterDebugSkill,
      winterTestSkill,
      winterMemoryReadme,
    ] = await Promise.all([
      this.readTextIfExists(karpathyPath, 2200),
      this.readTextIfExists(agentsPath, 1800),
      this.readTextIfExists(designReadmePath, 1600),
      this.listPathEntries(paths.designs, 40),
      this.readTextIfExists(pageAgentWinterPath, 1600),
      this.readTextIfExists(pageAgentAgentsPath, 2200),
      this.readTextIfExists(gsapReadmePath, 1600),
      this.readTextIfExists(gsapIndexPath, 1800),
      this.readTextIfExists(hermesReadmePath, 1800),
      this.readTextIfExists(hermesAgentsPath, 2200),
      this.readTextIfExists(hermesRoutinesPath, 1400),
      this.listPathEntries(paths.hermesAgentCoreSkills, 40),
      this.readTextIfExists(winterCodingSkillPath, 1200),
      this.readTextIfExists(winterDebugSkillPath, 1000),
      this.readTextIfExists(winterTestSkillPath, 1000),
      this.readTextIfExists(winterMemoryReadmePath, 1000),
    ]);

    const hasRequired = Boolean(
      karpathy ||
      agents ||
      designReadme ||
      designBrands.length > 0 ||
      pageAgentWinter ||
      pageAgentAgents ||
      gsapReadme ||
      gsapIndex ||
      hermesReadme ||
      hermesAgents ||
      hermesRoutines ||
      hermesSkillFamilies.length > 0 ||
      winterCodingSkill ||
      winterDebugSkill ||
      winterTestSkill ||
      winterMemoryReadme
    );
    if (!hasRequired) return '';

    const lines = [];
    lines.push('[Required Local Resource Rules]');
    lines.push('- These rules are mandatory for every project session and every model size. Do not route quality down for smaller models.');
    lines.push(`- Karpathy tools: ${path.relative(this.projectPath, karpathyPath)}`);
    lines.push('  Apply: think before coding, state assumptions when needed, keep solutions simple, make surgical changes, and verify against concrete success criteria.');
    lines.push(`- Agent rules: ${path.relative(this.projectPath, agentsPath)}`);
    lines.push('  Apply: inspect source before edits, keep dependency and lockfile changes synced, prefer TypeScript for new TS/Next utilities, and use the appropriate dev/test command for the task.');
    lines.push(`- Page Agent (Alibaba GUI Agent): ${path.relative(this.projectPath, pageAgentReadmePath)}`);
    lines.push('  Apply: for browser automation, smart form filling, SaaS AI copilot, accessibility, and multi-page agent tasks. PageAgent is an in-page JavaScript library that uses text-based DOM manipulation to control web interfaces with natural language. No browser extension or headless browser required.');
    lines.push(`  Internal architecture at: ${path.relative(this.projectPath, pageAgentAgentsPath)}`);
    lines.push(`- GSAP skills: ${path.relative(this.projectPath, gsapIndexPath)}`);
    lines.push('  Apply: for JavaScript animation, React/Vue/Svelte animation, timelines, ScrollTrigger, Flip, Draggable, SVG/motion-path work, and animation performance. Read the matching GSAP SKILL.md before implementing non-trivial animation.');
    lines.push(`- Hermes Agent core: ${path.relative(this.projectPath, hermesAgentsPath)}`);
    lines.push('  Apply directly in Winter core for self-improving skills, session search/compression, subagent delegation, tool gateway discipline, TUI/gateway separation, scheduled automation, and central command registry patterns.');
    lines.push(`- Design system corpus: ${path.relative(this.projectPath, designReadmePath)} and ${path.relative(this.projectPath, paths.designs)}`);
    lines.push('  Apply: for UI/brand/design tasks, search the design-md corpus first and follow the closest existing brand/design guidance instead of inventing style from scratch.');
    lines.push(`- Winter packaged skills: ${path.relative(this.projectPath, paths.winter.skills)}`);
    lines.push('  Apply: coding/debug/test skills are bundled with the npm package, so a global install on another machine can still load Winter baseline behavior without project-local skill files.');
    lines.push(`- Winter packaged memories: ${path.relative(this.projectPath, paths.winter.memories)}`);
    lines.push('  Apply: packaged memories document how Winter memory is structured; user/session memories still live under the user profile.');
    lines.push('- Use Read/Grep/Glob to inspect the full resource files whenever task details require more than this startup summary.');

    const brandNames = designBrands
      .filter(item => item.isDirectory)
      .map(item => item.name)
      .slice(0, 16);
    if (brandNames.length > 0) {
      lines.push(`- Available design-md examples include: ${brandNames.join(', ')}${designBrands.length > brandNames.length ? ', ...' : ''}`);
    }
    const hermesFamilies = hermesSkillFamilies
      .filter(item => item.isDirectory)
      .map(item => item.name)
      .slice(0, 12);
    if (hermesFamilies.length > 0) {
      lines.push(`- Hermes core skill families include: ${hermesFamilies.join(', ')}${hermesSkillFamilies.length > hermesFamilies.length ? ', ...' : ''}`);
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
    if (/Page Agent|GUI agent|browser automation|web agent/i.test(pageAgentWinter)) {
      evidence.push('page-agent provides in-page GUI automation via text-based DOM manipulation. Winter also has built-in WebFetch (HTTP fetch) and BrowserDebug (Chrome DevTools) tools for browsing URLs.');
    }
    if (/Monorepo|PageAgentCore|PageController|DOM Pipeline|FlatDomTree/i.test(pageAgentAgents)) {
      evidence.push('page-agent AGENTS.md confirms monorepo structure, DOM pipeline, and tool architecture.');
    }
    if (/gsap-core|gsap-scrolltrigger|gsap-react|ScrollTrigger|timeline/i.test(`${gsapReadme}\n${gsapIndex}`)) {
      evidence.push('gsap-skills confirms core GSAP, timelines, ScrollTrigger, framework, plugin, and performance guidance.');
    }
    if (/self-improving|learning loop|subagents|TUI|gateway|Skill|MCP|cron|scheduled/i.test(`${hermesReadme}\n${hermesAgents}\n${hermesRoutines}`)) {
      evidence.push('hermes-agent-core confirms self-improving agent loops, skills, memory/search, subagents, tool gateways, TUI separation, and automation routines.');
    }
    if (/Read code to understand|Read relevant project files|Verify|automatic tool usage/i.test(winterCodingSkill)) {
      evidence.push('packaged coding skill confirms inspect-before-edit and verify-after-change behavior.');
    }
    if (/Reproduce|root cause|surgical/i.test(winterDebugSkill)) {
      evidence.push('packaged debug skill confirms reproduce, trace root cause, fix surgically, and verify.');
    }
    if (/Unit Tests|Integration Tests|Run Tests/i.test(winterTestSkill)) {
      evidence.push('packaged test skill confirms test planning and execution behavior.');
    }
    if (/Long-term Memory|Project Memory|\/remember/i.test(winterMemoryReadme)) {
      evidence.push('packaged memory guide confirms long-term and project memory concepts.');
    }
    if (evidence.length > 0) {
      lines.push(`- Startup evidence: ${evidence.join(' ')}`);
    }

    return lines.join('\n');
  }

  async getResourceApplicationProfile({ projectInstructionFiles = [] } = {}) {
    const paths = this.getResourcePaths();
    const userPaths = this.getUserResourcePaths();
    const [
      karpathy,
      agents,
      pageAgent,
      pageAgentAgents,
      hermesAgents,
      hermesReadme,
      hermesRoutines,
      gsapIndex,
      gsapReadme,
      eccReadme,
      codexGuide,
      claudeGuide,
      codexRules,
      codexSkills,
      claudeSkills,
      designBrands,
      winterSkills,
      winterMemories,
      userCodexSkills,
      userCodexRules,
      userCodexMemories,
      userClaudeSkills,
    ] = await Promise.all([
      this.readTextIfExists(path.join(paths.karpathy, 'CLAUDE.md'), 1400),
      this.readTextIfExists(path.join(paths.agents, 'AGENTS.md'), 1400),
      this.readFirstExisting(paths.pageAgent, ['WINTER.md', 'README.md'], 1400),
      this.readTextIfExists(path.join(paths.pageAgent, 'AGENTS.md'), 1400),
      this.readTextIfExists(paths.hermesAgentCoreAgents, 1600),
      this.readTextIfExists(path.join(paths.hermesAgentCore, 'README.md'), 1400),
      this.readTextIfExists(path.join(paths.hermesAgentCore, 'hermes-already-has-routines.md'), 1200),
      this.readTextIfExists(paths.gsapSkillsIndex, 1600),
      this.readTextIfExists(path.join(paths.gsapSkills, 'README.md'), 1200),
      this.readTextIfExists(paths.eccReadme, 1200),
      this.readFirstExisting(paths.codex.root, ['AGENTS.md', 'README.md', 'CLAUDE.md'], 1400),
      this.readFirstExisting(paths.claude.root, ['AGENTS.md', 'README.md', 'CLAUDE.md'], 1400),
      this.listPathEntries(paths.codex.rules, 40),
      this.listPathEntries(paths.codex.skills, 40),
      this.listPathEntries(paths.claude.skills, 40),
      this.listPathEntries(paths.designs, 40),
      this.listPathEntries(paths.winter.skills, 40),
      this.listPathEntries(paths.winter.memories, 40),
      this.listPathEntries(userPaths.codexSkills, 40),
      this.listPathEntries(userPaths.codexRules, 40),
      this.listPathEntries(userPaths.codexMemories, 40),
      this.listPathEntries(userPaths.claudeSkills, 40),
    ]);

    const lines = [];
    lines.push('[Auto-loaded Resource Application Profile]');
    lines.push('- Winter must apply this profile automatically before task work. It is not optional and does not require a slash command.');
    lines.push('- Default agent loop: read project rules + relevant resource profile -> inspect project state -> use tools -> verify -> final.');
    lines.push('- If a task touches any listed domain, inspect the matching resource file in depth with Read/Grep before implementation.');

    const projectRules = (projectInstructionFiles || [])
      .map(file => `${file.relativePath}: ${this.compactText(String(file.content || '').replace(/\s+/g, ' ').trim(), 360, file.relativePath)}`)
      .filter(Boolean);
    if (projectRules.length > 0) {
      lines.push('Project rules loaded:');
      projectRules.slice(0, 8).forEach(rule => lines.push(`- ${rule}`));
    }

    const addSection = (name, apply, evidence, sourcePath = '') => {
      lines.push(`${name}:`);
      lines.push(`- Apply: ${apply}`);
      if (sourcePath) lines.push(`- Source: ${sourcePath}`);
      if (evidence) lines.push(`- Loaded evidence: ${this.compactText(evidence.replace(/\s+/g, ' ').trim(), 520, name)}`);
    };

    addSection(
      'karpathy-tools',
      'coding discipline, simplicity, surgical edits, verification criteria, and anti-overengineering.',
      karpathy,
      path.join(paths.karpathy, 'CLAUDE.md')
    );
    addSection(
      'agents.md',
      'agentic development workflow, dependency hygiene, project conventions, and repo-specific agent rules.',
      agents,
      path.join(paths.agents, 'AGENTS.md')
    );
    addSection(
      'page-agent',
      'visible/browser-like GUI automation, DOM reasoning, form workflows, multi-page interaction, and web agent tasks.',
      `${pageAgent.content}\n${pageAgentAgents}`,
      pageAgent.filePath || path.join(paths.pageAgent, 'README.md')
    );
    addSection(
      'hermes-agent-core',
      'self-improving loops, skill lifecycle, memory/search compression, subagents, TUI separation, tool gateways, and automation routines.',
      `${hermesAgents}\n${hermesReadme}\n${hermesRoutines}`,
      paths.hermesAgentCore
    );
    addSection(
      'gsap-skills',
      'GSAP animation, timelines, ScrollTrigger, framework bindings, SVG/motion-path work, and animation performance.',
      `${gsapIndex}\n${gsapReadme}`,
      paths.gsapSkills
    );
    addSection(
      'ecc',
      'ECC knowledge/resource browsing and bundled ecosystem context when a task references ECC or encoded/corpus resources.',
      eccReadme,
      paths.ecc
    );
    addSection(
      'codex',
      'Codex-style skills, plugins, rules, memories, provider/tool reliability, and coding-agent behavior.',
      codexGuide.content,
      paths.codex.root
    );
    addSection(
      'claude',
      'Claude-style skills, plugins, project rules, subagent conventions, hooks, and MCP workflows.',
      claudeGuide.content,
      paths.claude.root
    );
    addSection(
      'awesome-design-md',
      'brand/design/UI work. Search design-md before inventing visual direction; use the closest matching design guide.',
      designBrands.length ? `Design libraries available: ${designBrands.filter(item => item.isDirectory).slice(0, 24).map(item => item.name).join(', ')}` : '',
      paths.designs
    );
    addSection(
      'winter packaged skills and memories',
      'baseline coding/debug/test/memory behavior that survives global installs and external project roots.',
      [
        winterSkills.length ? `Skills: ${winterSkills.slice(0, 24).map(item => item.name).join(', ')}` : '',
        winterMemories.length ? `Memories: ${winterMemories.slice(0, 16).map(item => item.name).join(', ')}` : '',
      ].filter(Boolean).join(' '),
      paths.winter.root
    );

    const catalogLines = [];
    if (codexRules.length > 0) catalogLines.push(`Codex rules: ${codexRules.slice(0, 16).map(item => item.name).join(', ')}`);
    if (codexSkills.length > 0) catalogLines.push(`Codex skills: ${codexSkills.slice(0, 16).map(item => item.name).join(', ')}`);
    if (claudeSkills.length > 0) catalogLines.push(`Claude skills: ${claudeSkills.slice(0, 16).map(item => item.name).join(', ')}`);
    if (userCodexSkills.length > 0) catalogLines.push(`Home Codex skills: ${userCodexSkills.slice(0, 16).map(item => item.name).join(', ')}`);
    if (userCodexRules.length > 0) catalogLines.push(`Home Codex rules: ${userCodexRules.slice(0, 16).map(item => item.name).join(', ')}`);
    if (userCodexMemories.length > 0) catalogLines.push(`Home Codex memories: ${userCodexMemories.slice(0, 16).map(item => item.name).join(', ')}`);
    if (userClaudeSkills.length > 0) catalogLines.push(`Home Claude skills: ${userClaudeSkills.slice(0, 16).map(item => item.name).join(', ')}`);
    if (catalogLines.length > 0) {
      lines.push('Discovered rule/skill/memory catalogs:');
      catalogLines.forEach(item => lines.push(`- ${item}`));
    }

    return lines.join('\n');
  }

  async getProjectSignals() {
    const signals = [];
    const addSignal = (value) => {
      const raw = String(value || '').toLowerCase();
      if (!raw) return;
      signals.push(raw);
      for (const part of raw.split(/[^a-z0-9.+#-]+/i).filter(Boolean)) {
        signals.push(part);
      }
      for (const part of raw.split(/[^a-z0-9]+/i).filter(Boolean)) {
        signals.push(part);
      }
    };

    try {
      const packageJsonPath = path.join(this.projectPath, 'package.json');
      const raw = await fs.readFile(packageJsonPath, 'utf8');
      const pkg = JSON.parse(raw);

      addSignal(pkg.name);
      addSignal(pkg.description);
      for (const keyword of pkg.keywords || []) {
        addSignal(keyword);
      }

      for (const key of ['dependencies', 'devDependencies', 'peerDependencies']) {
        const deps = pkg[key] || {};
        for (const depName of Object.keys(deps)) {
          addSignal(depName);
        }
      }

      for (const script of Object.values(pkg.scripts || {})) {
        addSignal(script);
      }
    } catch {
      // Ignore package.json parsing issues.
    }

    try {
      const entries = await fs.readdir(this.projectPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        addSignal(path.extname(entry.name).toLowerCase().slice(1));
        addSignal(entry.name);
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
    const folders = [
      resourcePaths.winter.skills,
      resourcePaths.claude.skills,
      resourcePaths.codex.skills,
      path.join(resourcePaths.gsapSkills, 'skills'),
      path.join(resourcePaths.hermesAgentCoreSkills, 'software-development'),
      path.join(resourcePaths.hermesAgentCoreSkills, 'autonomous-ai-agents'),
      path.join(resourcePaths.hermesAgentCoreSkills, 'mcp'),
      path.join(resourcePaths.hermesAgentCoreSkills, 'github'),
      userPaths.claudeSkills,
      userPaths.codexSkills,
    ];

    for (const folder of folders) {
      const entries = await this.listPathEntries(folder, 200);
      for (const entry of entries) {
        catalog.add(entry.name.replace(/\.md$/i, ''));
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
      ['hermes-agent', 'subagent-driven-development', 'native-mcp', 'hermes-agent-skill-authoring'].forEach(skill => activeSkills.add(skill));
    }

    if (hasAny('tui', 'terminal', 'gateway', 'cron', 'schedule', 'webhook', 'memory', 'session', 'subagent')) {
      ['hermes-agent', 'subagent-driven-development', 'systematic-debugging', 'test-driven-development'].forEach(skill => activeSkills.add(skill));
    }

    if (hasAny('docs', 'markdown', 'md', 'readme', 'documentation')) {
      ['claude-md-improver', 'docs', 'writing-rules'].forEach(skill => activeSkills.add(skill));
    }

    if (hasAny('figma', 'design-md', 'brand', 'brand-guidelines', 'style-guide')) {
      ['vibefigma', 'web-design-guidelines'].forEach(skill => activeSkills.add(skill));
    }

    if (hasAny('gsap', 'animation', 'animate', 'motion', 'scrolltrigger', 'scroll-trigger', 'greensock')) {
      ['gsap', 'gsap-core', 'gsap-timeline', 'gsap-scrolltrigger', 'gsap-performance'].forEach(skill => activeSkills.add(skill));
      if (hasAny('react', 'next', 'nextjs', 'tsx', 'jsx')) activeSkills.add('gsap-react');
      if (hasAny('vue', 'svelte', 'nuxt', 'sveltekit')) activeSkills.add('gsap-frameworks');
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
