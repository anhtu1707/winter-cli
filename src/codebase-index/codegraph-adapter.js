import path from 'path';

async function importCodeGraphModule() {
  return quietCodeGraph(() => import('@colbymchenry/codegraph'));
}

async function quietCodeGraph(fn) {
  if (process.env.WINTER_CODEGRAPH_DEBUG === '1') {
    return fn();
  }

  const originalLog = console.log;
  const originalInfo = console.info;
  const originalWarn = console.warn;
  const originalError = console.error;
  try {
    console.log = () => {};
    console.info = () => {};
    console.warn = () => {};
    console.error = () => {};
    return await fn();
  } finally {
    console.log = originalLog;
    console.info = originalInfo;
    console.warn = originalWarn;
    console.error = originalError;
  }
}

export class CodeGraphAdapter {
  constructor(options = {}) {
    this.projectPath = path.resolve(options.projectPath || process.cwd());
    this.enabled = options.enabled !== false;
    this.instance = options.instance || null;
    this.module = options.module || null;
    this.available = Boolean(this.instance);
    this.lastError = null;
  }

  async init() {
    if (!this.enabled) return false;
    if (this.instance) {
      this.available = true;
      return true;
    }

    try {
      const mod = this.module || await importCodeGraphModule();
      const CodeGraph = mod.CodeGraph || mod.default;
      if (!CodeGraph) throw new Error('CodeGraph export not found');

      this.instance = await quietCodeGraph(() => CodeGraph.isInitialized?.(this.projectPath)
        ? CodeGraph.open(this.projectPath, { sync: false })
        : CodeGraph.init(this.projectPath, {
          index: false,
          config: {
            exclude: [
              'node_modules/**',
              '.git/**',
              '.winter/**',
              'dist/**',
              'build/**',
              'resources/local/**',
              'VSCode-win32-x64/**',
              'vscode-main/**',
            ],
          },
        }));
      this.available = true;
      return true;
    } catch (error) {
      this.available = false;
      this.lastError = error;
      return false;
    }
  }

  async ensureIndexed() {
    if (!await this.init()) return null;
    const stats = this.safeStats();
    if (!stats || stats.nodeCount === 0 || stats.fileCount === 0) {
      await quietCodeGraph(() => this.instance.indexAll());
    } else {
      await quietCodeGraph(() => this.instance.sync?.());
    }
    return this.safeStats();
  }

  safeStats() {
    try {
      return this.instance?.getStats?.() || null;
    } catch (error) {
      this.lastError = error;
      return null;
    }
  }

  async search(query, options = {}) {
    await this.ensureIndexed();
    if (!this.instance) return [];
    try {
      return await quietCodeGraph(() => this.instance.searchNodes(String(query || ''), {
        limit: options.limit || 20,
      }));
    } catch (error) {
      this.lastError = error;
      return [];
    }
  }

  async buildContext(task, options = {}) {
    await this.ensureIndexed();
    if (!this.instance) return '';
    try {
      const result = await quietCodeGraph(() => this.instance.buildContext(String(task || ''), {
        maxNodes: options.maxNodes || 24,
        maxCodeBlocks: options.maxCodeBlocks || 8,
        maxCodeBlockSize: options.maxCodeBlockSize || 1800,
        includeCode: options.includeCode !== false,
        format: 'markdown',
      }));
      return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
    } catch (error) {
      this.lastError = error;
      return '';
    }
  }

  async findSymbol(name, options = {}) {
    const results = await this.search(name, options);
    return results.map(result => {
      const node = result.node || result;
      return {
        name: node.name,
        type: node.kind || 'symbol',
        filePath: node.filePath,
        line: node.startLine || 1,
        endLine: node.endLine || node.startLine || 1,
        qualifiedName: node.qualifiedName,
        score: result.score,
        content: node.signature || node.docstring || '',
        node,
      };
    });
  }

  close() {
    try {
      this.instance?.close?.();
    } catch {}
  }
}

export default CodeGraphAdapter;
