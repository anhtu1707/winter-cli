/**
 * ❄ ECC Integration ❄
 * Everything Claude Code — agent harness performance optimization system
 * Browsing, searching, syncing ECC resources inside Winter
 */

import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { colors } from './snowflake-logo.js';

const ECC_DIR = 'resources/local/ecc';
const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export class ECCManager {
  constructor({ projectPath, tools, config } = {}) {
    this.projectPath = path.resolve(projectPath || process.cwd());
    this.tools = tools;
    this.config = config;
    this.eccPath = this.resolveEccPath();
    this.lastSyncAt = null;
  }

  resolveEccPath() {
    const projectEccPath = path.resolve(this.projectPath, ECC_DIR);
    // Prefer a project-local resource bundle when running from this checkout.
    // Fall back to the package bundle so global installs can browse ECC too.
    return existsSync(projectEccPath)
      ? projectEccPath
      : path.resolve(PACKAGE_ROOT, ECC_DIR);
  }

  getEccPath() {
    return this.eccPath;
  }

  getPaths() {
    const root = this.eccPath;
    return {
      root,
      agents: path.join(root, 'agents'),
      skills: path.join(root, 'skills'),
      rules: path.join(root, 'rules'),
      commands: path.join(root, 'commands'),
      plugins: path.join(root, 'plugins'),
      hooks: path.join(root, 'hooks'),
      config: path.join(root, 'config'),
      contexts: path.join(root, 'contexts'),
      docs: path.join(root, 'docs'),
      mcp: path.join(root, 'mcp-configs'),
      src: path.join(root, 'src'),
      research: path.join(root, 'research'),
      readme: path.join(root, 'README.md'),
      claude: path.join(root, 'CLAUDE.md'),
      agentsMd: path.join(root, 'AGENTS.md'),
      manifest: path.join(root, 'package.json'),
    };
  }

  getSections() {
    return [
      { name: 'agents', path: this.getPaths().agents, desc: 'ECC subagent definitions and workflows' },
      { name: 'skills', path: this.getPaths().skills, desc: 'ECC skill templates for AI agents' },
      { name: 'rules', path: this.getPaths().rules, desc: 'ECC behavioral rules and constraints' },
      { name: 'commands', path: this.getPaths().commands, desc: 'ECC custom commands and integrations' },
      { name: 'plugins', path: this.getPaths().plugins, desc: 'ECC plugin system' },
      { name: 'config', path: this.getPaths().config, desc: 'ECC configuration templates' },
      { name: 'contexts', path: this.getPaths().contexts, desc: 'ECC context definitions' },
      { name: 'docs', path: this.getPaths().docs, desc: 'ECC documentation' },
      { name: 'research', path: this.getPaths().research, desc: 'ECC research notes' },
      { name: 'mcp-configs', path: this.getPaths().mcp, desc: 'ECC MCP server configurations' },
    ];
  }

  async isEccInstalled() {
    try {
      await fs.access(this.eccPath);
      return true;
    } catch {
      return false;
    }
  }

  async getInfo() {
    const installed = await this.isEccInstalled();
    if (!installed) {
      return { installed: false, error: 'ECC chưa được cài đặt. Dùng /ecc sync để cài.' };
    }

    let fileCount = 0;
    let dirCount = 0;
    let totalBytes = 0;

    try {
      const walkDir = async (dir) => {
        const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            dirCount++;
            await walkDir(fullPath);
          } else if (entry.isFile()) {
            fileCount++;
            try {
              const stat = await fs.stat(fullPath);
              totalBytes += stat.size;
            } catch {}
          }
        }
      };
      await walkDir(this.eccPath);
    } catch {}

    let gitSha = '';
    try {
      const head = await fs.readFile(path.join(this.eccPath, '.git', 'HEAD'), 'utf8');
      const headValue = head.trim();
      if (headValue.startsWith('ref:')) {
        const refPath = path.join(this.eccPath, '.git', headValue.replace(/^ref:\s*/, ''));
        gitSha = (await fs.readFile(refPath, 'utf8')).trim().substring(0, 12);
      } else {
        gitSha = headValue.substring(0, 12);
      }
    } catch {}

    return {
      installed: true,
      fileCount,
      dirCount,
      totalMB: (totalBytes / 1024 / 1024).toFixed(2),
      gitSha,
      lastSyncAt: this.lastSyncAt,
      lastSyncStr: this.lastSyncAt ? new Date(this.lastSyncAt).toLocaleString() : 'chưa đồng bộ',
    };
  }

  async browseSection(sectionName) {
    const sections = this.getSections();

    // Check if it's a nested path like "skills/error-handling"
    const parts = sectionName.split('/');
    let target = null;

    // Try exact match for first part
    target = sections.find(s => s.name === parts[0]);
    if (!target) {
      // Try fuzzy match
      target = sections.find(s =>
        s.name.includes(parts[0]) || parts[0].includes(s.name)
      );
    }

    if (!target) {
      // Try direct path within ECC
      const directPath = path.join(this.eccPath, sectionName);
      if (existsSync(directPath)) {
        const entries = await this._listDir(directPath);
        if (entries) {
          return {
            section: sectionName,
            description: `Custom path: ${sectionName}`,
            path: directPath,
            entries,
          };
        }
      }
      return { error: `Không tìm thấy section "${sectionName}". Các section: ${sections.map(s => s.name).join(', ')}` };
    }

    // Build full path for nested request
    let fullPath = target.path;
    if (parts.length > 1) {
      fullPath = path.join(target.path, ...parts.slice(1));
    }

    // Check if path exists, otherwise fall back to section root
    if (!existsSync(fullPath)) {
      fullPath = target.path;
    }

    const entries = await this._listDir(fullPath);
    if (!entries) {
      return { error: `Không thể đọc section "${sectionName}"` };
    }

    return {
      section: parts[0],
      subPath: parts.length > 1 ? parts.slice(1).join('/') : null,
      description: target.desc,
      path: fullPath,
      entries,
    };
  }

  async search(query) {
    const results = { query, matches: [], fileMatches: [] };
    const q = query.toLowerCase();

    // Search in directory names (top-level)
    for (const section of this.getSections()) {
      const entries = await this._listDir(section.path);
      if (!entries) continue;

      const matched = entries.filter(entry =>
        entry.name.toLowerCase().includes(q)
      );
      for (const m of matched) {
        results.matches.push({
          section: section.name,
          name: m.name,
          isDirectory: m.isDirectory,
          path: path.join(section.path, m.name),
        });
      }
    }

    // Search in file contents (.md, .js, .json)
    const contentExtensions = ['.md', '.js', '.json', '.txt'];
    await this._searchContent(this.eccPath, q, results.fileMatches, contentExtensions);

    // Merge fileMatches into matches with section info
    for (const fileMatch of results.fileMatches) {
      const relativePath = path.relative(this.eccPath, fileMatch.path);
      const parts = relativePath.split(path.sep);
      const section = parts[0] || 'root';
      results.matches.push({
        section,
        name: path.basename(fileMatch.path),
        isDirectory: false,
        path: fileMatch.path,
        snippet: fileMatch.snippet,
        line: fileMatch.line,
      });
    }

    return results;
  }

  async _searchContent(dir, query, results, extensions, depth = 0) {
    if (depth > 5) return; // Limit recursion depth

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        // Skip hidden dirs and .git
        if (entry.name.startsWith('.') && entry.isDirectory()) continue;

        if (entry.isDirectory()) {
          await this._searchContent(fullPath, query, results, extensions, depth + 1);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (!extensions.includes(ext)) continue;

          try {
            const content = await fs.readFile(fullPath, 'utf8');
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].toLowerCase().includes(query)) {
                results.push({
                  path: fullPath,
                  line: i + 1,
                  snippet: lines[i].trim().substring(0, 150),
                });
                if (results.length >= 50) return; // Limit results
              }
            }
          } catch {}
        }
      }
    } catch {}
  }

  async sync() {
    console.log(`${colors.cyan}ECC: Đang đồng bộ từ GitHub...${colors.reset}`);

    try {
      const gitDir = path.join(this.eccPath, '.git');
      try {
        await fs.access(gitDir);
      } catch {
        console.log(`${colors.yellow}ECC is available as a packaged snapshot, not a git checkout. Reinstall or update winter-super-cli to refresh it.${colors.reset}`);
        return { success: false, error: 'ECC packaged snapshot is not a git checkout' };
      }

      const { execSync } = await import('child_process');
      execSync('git fetch origin main --depth 1', {
        cwd: this.eccPath,
        timeout: 120000,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      execSync('git reset --hard origin/main', {
        cwd: this.eccPath,
        timeout: 60000,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.lastSyncAt = Date.now();
      console.log(`${colors.green}✓ ECC đã đồng bộ thành công!${colors.reset}`);
      return { success: true, syncedAt: this.lastSyncAt };
    } catch (error) {
      console.log(`${colors.red}✖ Lỗi đồng bộ ECC: ${error.message}${colors.reset}`);
      return { success: false, error: error.message };
    }
  }

  async showSummary() {
    const installed = await this.isEccInstalled();
    if (!installed) {
      console.log(`${colors.yellow}ECC chưa được cài đặt. Dùng /ecc sync để clone từ GitHub.${colors.reset}`);
      return;
    }

    const info = await this.getInfo();
    const sections = this.getSections();

    console.log(`\n${colors.cyan}╭${'─'.repeat(50)}╮${colors.reset}`);
    console.log(`${colors.cyan}│${colors.reset}  ${colors.bright}ECC — Everything Claude Code${colors.reset}${colors.cyan}│${colors.reset}`);
    console.log(`${colors.cyan}╰${'─'.repeat(50)}╯${colors.reset}`);
    console.log(`\n${colors.dim}Commit:${colors.reset} ${info.gitSha || 'N/A'}`);
    console.log(`${colors.dim}Files:${colors.reset} ${info.fileCount} files, ${info.totalMB} MB`);
    console.log(`${colors.dim}Sync:${colors.reset} ${info.lastSyncStr}`);
    console.log(`${colors.dim}Web:${colors.reset} ${colors.cyan}https://github.com/affaan-m/ECC${colors.reset}`);
    console.log('');

    for (const section of sections) {
      const entries = await this._listDir(section.path);
      const count = entries ? entries.length : 0;
      const icon = entries ? (count > 0 ? '►' : '►') : '⛔';
      console.log(`  ${icon} ${colors.green}${section.name}${colors.reset} ${colors.dim}(${count} items)${colors.reset}`);
      console.log(`    ${colors.dim}${section.desc}${colors.reset}`);
    }
    console.log('');
  }

  async _listDir(dirPath) {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      return entries
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
    } catch {
      return null;
    }
  }
}
