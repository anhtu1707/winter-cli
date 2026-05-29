import path from 'path';
import { pathToFileURL } from 'url';
import { promises as fs } from 'fs';

const DEFAULT_TOOL_SETS = {
  general: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'OpenBrowser', 'VisibleBrowser', 'BrowserDebug', 'DesignToCode', 'WebFetch', 'WebSearch', 'Parallel', 'Agent', 'DelegateTask'],
  plan: ['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch', 'Parallel'],
  review: ['Read', 'Grep', 'Glob', 'Bash', 'WebFetch'],
  debug: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob', 'OpenBrowser', 'VisibleBrowser', 'BrowserDebug', 'WebFetch', 'Parallel'],
  design: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob', 'OpenBrowser', 'VisibleBrowser', 'BrowserDebug', 'DesignToCode', 'WebFetch'],
  research: ['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch', 'Parallel'],
  swe: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob', 'OpenBrowser', 'VisibleBrowser', 'BrowserDebug', 'Parallel'],
};

const BUILTIN_AGENTS = [
  {
    id: 'general',
    displayName: 'General Agent',
    tools: DEFAULT_TOOL_SETS.general,
    instructionsPrompt: 'You are a general Winter coding agent. Inspect real project state, use tools, make focused changes, verify, and report concrete evidence.',
  },
  {
    id: 'plan',
    displayName: 'Planner',
    tools: DEFAULT_TOOL_SETS.plan,
    instructionsPrompt: 'Create a practical implementation plan from real repository context. Read relevant files first and avoid speculative architecture.',
  },
  {
    id: 'debug',
    displayName: 'Debugger',
    tools: DEFAULT_TOOL_SETS.debug,
    instructionsPrompt: 'Find the first hard failure, inspect exact logs/files, patch the smallest root cause, and verify with the closest test, build, or browser smoke.',
  },
  {
    id: 'review',
    displayName: 'Reviewer',
    tools: DEFAULT_TOOL_SETS.review,
    instructionsPrompt: 'Review for bugs, regressions, missing tests, security issues, and behavioral risks. Lead with concrete findings and file evidence.',
  },
  {
    id: 'design',
    displayName: 'Design Agent',
    tools: DEFAULT_TOOL_SETS.design,
    instructionsPrompt: 'Improve UI by reading existing components and styles first. Build polished, responsive, domain-appropriate interfaces and verify visible behavior.',
  },
  {
    id: 'research',
    displayName: 'Research Agent',
    tools: DEFAULT_TOOL_SETS.research,
    instructionsPrompt: 'Gather focused evidence from local files and web sources when needed. Separate sourced facts from inference.',
  },
  {
    id: 'swe',
    displayName: 'SWE Agent',
    tools: DEFAULT_TOOL_SETS.swe,
    instructionsPrompt: 'Execute a complete software engineering loop: inspect, implement, verify, review, and summarize changed files.',
  },
];

function normalizeToolNames(tools, fallback = DEFAULT_TOOL_SETS.general) {
  if (!Array.isArray(tools) || tools.length === 0) return [...fallback];
  return [...new Set(tools.map(tool => String(tool || '').trim()).filter(Boolean))];
}

export function normalizeAgentDefinition(input = {}, source = 'builtin') {
  const id = String(input.id || input.name || '').trim();
  if (!id) return null;
  const fallbackTools = DEFAULT_TOOL_SETS[id] || DEFAULT_TOOL_SETS.general;
  return {
    id,
    displayName: String(input.displayName || input.title || id),
    model: input.model ? String(input.model) : null,
    tools: normalizeToolNames(input.tools || input.toolNames, fallbackTools),
    spawnableAgents: Array.isArray(input.spawnableAgents) ? input.spawnableAgents.map(String) : [],
    instructionsPrompt: String(input.instructionsPrompt || input.instructions || input.prompt || '').trim(),
    source,
    raw: input,
  };
}

export class AgentDefinitionRegistry {
  constructor({ projectPath = process.cwd() } = {}) {
    this.projectPath = path.resolve(projectPath);
    this.cache = null;
  }

  getBuiltinDefinitions() {
    return BUILTIN_AGENTS.map(agent => normalizeAgentDefinition(agent, 'builtin')).filter(Boolean);
  }

  async load({ refresh = false } = {}) {
    if (this.cache && !refresh) return this.cache;
    const map = new Map();
    for (const agent of this.getBuiltinDefinitions()) {
      map.set(agent.id, agent);
    }
    for (const agent of await this.loadProjectDefinitions()) {
      map.set(agent.id, agent);
    }
    this.cache = map;
    return map;
  }

  async get(id = 'general') {
    const map = await this.load();
    return map.get(id) || map.get('general') || normalizeAgentDefinition(BUILTIN_AGENTS[0], 'builtin');
  }

  async list() {
    const map = await this.load();
    return [...map.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  async loadProjectDefinitions() {
    const dirs = [
      path.join(this.projectPath, '.winter', 'agents'),
      path.join(this.projectPath, '.agents'),
    ];
    const agents = [];
    for (const dir of dirs) {
      let entries = [];
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (!/\.(json|js|mjs)$/i.test(entry.name)) continue;
        const filePath = path.join(dir, entry.name);
        const agent = await this.loadDefinitionFile(filePath);
        if (agent) agents.push(agent);
      }
    }
    return agents;
  }

  async loadDefinitionFile(filePath) {
    try {
      const ext = path.extname(filePath).toLowerCase();
      let value;
      if (ext === '.json') {
        value = JSON.parse(await fs.readFile(filePath, 'utf8'));
      } else {
        const url = `${pathToFileURL(filePath).href}?t=${Date.now()}`;
        const mod = await import(url);
        value = mod.default || mod.agent || mod;
      }
      return normalizeAgentDefinition(value, path.relative(this.projectPath, filePath));
    } catch {
      return null;
    }
  }
}
