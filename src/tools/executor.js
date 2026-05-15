/**
 * ❄️ WINTER TOOL EXECUTOR ❄️
 * Complete Claude Code / Codex compatible tool system
 */

import { promises as fs } from 'fs';
import path from 'path';
import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import { diffLines } from 'diff';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

export class ToolExecutor {
  constructor(repl) {
    this.repl = repl;
    this.projectPath = repl?.projectPath || process.cwd();
    this.allowedCommands = ['git', 'npm', 'node', 'python', 'code', 'pnpm', 'yarn', 'bun', 'pip', 'cargo', 'rustc'];
    this.blockedPatterns = ['rm -rf', 'format', '/f/s', '--force'];
  }

  getToolDefinitions() {
    return [
      {
        type: 'function',
        name: 'Read',
        description: 'Read complete file contents. Use for understanding code or viewing files.',
        parameters: {
          type: 'object',
          properties: {
            file_path: { type: 'string', description: 'Absolute or relative path to file' }
          },
          required: ['file_path']
        }
      },
      {
        type: 'function',
        name: 'Write',
        description: 'Create or overwrite a file with content. Prefer this for file creation instead of Bash echo/cat/heredoc. Also handles model aliases like write_to_file.',
        parameters: {
          type: 'object',
          properties: {
            file_path: { type: 'string', description: 'Path to file' },
            content: { type: 'string', description: 'Content to write' }
          },
          required: ['file_path', 'content']
        }
      },
      {
        type: 'function',
        name: 'Edit',
        description: 'Make surgical changes. Replace exact old_string with new_string. Also handles model aliases like replace_in_file and str_replace_editor.',
        parameters: {
          type: 'object',
          properties: {
            file_path: { type: 'string', description: 'File path' },
            old_string: { type: 'string', description: 'Exact text to find' },
            new_string: { type: 'string', description: 'Replacement text' }
          },
          required: ['file_path', 'old_string', 'new_string']
        }
      },
      {
        type: 'function',
        name: 'Bash',
        description: 'Execute a shell command. On Windows, shell auto-detects PowerShell or cmd.exe syntax. Prefer Write/Edit for file writes.',
        parameters: {
          type: 'object',
          properties: {
            command: { type: 'string', description: 'Shell command to execute' },
            cwd: { type: 'string', description: 'Working directory' },
            timeout: { type: 'number', description: 'Timeout in ms (default: 60000)' },
            shell: { type: 'string', description: 'Windows shell: auto, powershell, or cmd' }
          },
          required: ['command']
        }
      },
      {
        type: 'function',
        name: 'Glob',
        description: 'Find files matching glob pattern.',
        parameters: {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: 'Glob pattern (e.g., **/*.js)' },
            cwd: { type: 'string', description: 'Directory to search' }
          },
          required: ['pattern']
        }
      },
      {
        type: 'function',
        name: 'Grep',
        description: 'Search for text in files.',
        parameters: {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: 'Regex pattern' },
            path: { type: 'string', description: 'Directory to search' },
            glob: { type: 'string', description: 'File filter (e.g., *.js)' },
            output_mode: { type: 'string', description: 'content, files_with_matches, count' }
          },
          required: ['pattern', 'path']
        }
      },
      {
        type: 'function',
        name: 'LSP',
        description: 'LSP operations: goto_definition, find_references, hover, document_symbol',
        parameters: {
          type: 'object',
          properties: {
            operation: { type: 'string', description: 'goto_definition, find_references, hover, document_symbol' },
            file_path: { type: 'string', description: 'File path' },
            line: { type: 'number', description: 'Line number' },
            character: { type: 'number', description: 'Character position' }
          },
          required: ['operation', 'file_path']
        }
      },
      {
        type: 'function',
        name: 'TaskCreate',
        description: 'Create a task in the current session.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Task title' },
            description: { type: 'string', description: 'Task description' }
          },
          required: ['title']
        }
      },
      {
        type: 'function',
        name: 'TaskUpdate',
        description: 'Update a task in the current session.',
        parameters: {
          type: 'object',
          properties: {
            task_id: { type: 'string', description: 'Task id' },
            title: { type: 'string', description: 'New title' },
            description: { type: 'string', description: 'New description' },
            status: { type: 'string', description: 'pending, in_progress, completed' }
          },
          required: ['task_id']
        }
      },
      {
        type: 'function',
        name: 'TaskList',
        description: 'List tasks in the current session.',
        parameters: {
          type: 'object',
          properties: {}
        }
      },
      {
        type: 'function',
        name: 'BrowserDebug',
        description: 'Open URL in headless browser to capture Console errors, Network errors, and DOM state for debugging. Very useful to fix frontend UI issues.',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'URL to debug (e.g. http://localhost:3000)' },
            action: { type: 'string', description: 'Optional JS to evaluate (e.g. document.querySelector("button").click())' }
          },
          required: ['url']
        }
      },
      {
        type: 'function',
        name: 'WebFetch',
        description: 'Fetch web page content.',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'URL to fetch' },
            prompt: { type: 'string', description: 'What to extract from page' }
          },
          required: ['url']
        }
      },
      {
        type: 'function',
        name: 'WebSearch',
        description: 'Search the web.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' }
          },
          required: ['query']
        }
      }
    ];
  }

  async execute(toolName, input, context = {}) {
    input = input && typeof input === 'object' ? input : {};
    toolName = this.normalizeToolName(toolName);
    const cwd = context.cwd || this.projectPath;
    const resolvedPath = (p) => this.resolveInputPath(p, cwd);

    switch (toolName) {
      case 'Read':
        return await this.readFile(this.resolveInputPath(input.file_path ?? input.path ?? input.file, cwd));
      case 'Write':
        return await this.writeFile(this.resolveInputPath(input.file_path ?? input.path ?? input.file, cwd), input.content);
      case 'Edit':
        return await this.executeEdit(input, cwd);
      case 'Bash':
        return await this.bash(input.command ?? input.cmd, input.cwd || cwd, input.timeout, input.shell);
      case 'Glob':
        return await this.glob(input.pattern ?? input.glob ?? '**/*', input.cwd || input.path || cwd);
      case 'Grep':
        return await this.grep(input.pattern ?? input.query ?? input.q, input.path || cwd, input.glob, input.output_mode);
      case 'LSP':
        return await this.lsp(input.operation, input, resolvedPath(input.file_path ?? input.path ?? input.file));
      case 'TaskCreate':
        return await this.taskCreate(input.title ?? input.task ?? input.description, input.description || '');
      case 'TaskUpdate':
        return await this.taskUpdate(input.task_id ?? input.id, input);
      case 'TaskList':
        return await this.taskList();
      case 'BrowserDebug':
        return await this.browserDebug(input.url ?? input.uri, input.action);
      case 'WebFetch':
        return await this.webFetch(input.url ?? input.uri, input.prompt);
      case 'WebSearch':
        return await this.webSearch(input.query ?? input.q);
      default:
        return {
          success: false,
          error: `Unknown tool: ${toolName}`,
          availableTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'TaskCreate', 'TaskUpdate', 'TaskList', 'BrowserDebug', 'WebFetch', 'WebSearch'],
          recovery: 'Call one of the available tools. For file writes use Write with { "file_path": "...", "content": "..." }. For shell commands use Bash with { "command": "..." }.',
        };
    }
  }

  normalizeToolName(toolName) {
    const normalized = String(toolName || '').replace(/[-_\s]/g, '').toLowerCase();
    const aliases = {
      read: 'Read',
      readfile: 'Read',
      openfile: 'Read',
      viewfile: 'Read',
      cat: 'Read',
      write: 'Write',
      writefile: 'Write',
      writetofile: 'Write',
      createfile: 'Write',
      savefile: 'Write',
      edit: 'Edit',
      editfile: 'Edit',
      replaceinfile: 'Edit',
      strreplace: 'Edit',
      strreplaceeditor: 'Edit',
      applydiff: 'Edit',
      patch: 'Edit',
      bash: 'Bash',
      shell: 'Bash',
      command: 'Bash',
      commandexecutor: 'Bash',
      executecommand: 'Bash',
      runcommand: 'Bash',
      terminal: 'Bash',
      powershell: 'Bash',
      glob: 'Glob',
      listfiles: 'Glob',
      ls: 'Glob',
      findfiles: 'Glob',
      grep: 'Grep',
      search: 'Grep',
      searchfiles: 'Grep',
      searchtext: 'Grep',
      rg: 'Grep',
      lsp: 'LSP',
      listcodedefinitionnames: 'LSP',
      taskcreate: 'TaskCreate',
      createtask: 'TaskCreate',
      newtask: 'TaskCreate',
      taskupdate: 'TaskUpdate',
      updatetask: 'TaskUpdate',
      tasklist: 'TaskList',
      listtasks: 'TaskList',
      plan: 'TaskList',
      webfetch: 'WebFetch',
      fetch: 'WebFetch',
      fetchurl: 'WebFetch',
      websearch: 'WebSearch',
      searchweb: 'WebSearch',
      browserdebug: 'BrowserDebug',
      browser: 'BrowserDebug',
    };
    return aliases[normalized] || toolName;
  }

  resolveInputPath(filePath, cwd) {
    if (typeof filePath !== 'string' || filePath.trim() === '') {
      return null;
    }
    filePath = this.normalizePathText(filePath);
    return path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
  }

  normalizePathText(value) {
    return String(value)
      .trim()
      .replace(/^['"]|['"]$/g, '')
      .replace(/[\u2010-\u2015\u2212]/g, '-');
  }

  async readFile(filePath) {
    if (!filePath) {
      return { success: false, error: 'file_path is required' };
    }

    try {
      const stat = await fs.stat(filePath);
      if (stat.isDirectory()) {
        const entries = await fs.readdir(filePath, { withFileTypes: true });
        const content = entries
          .map(entry => `${entry.isDirectory() ? '[dir] ' : '[file]'} ${entry.name}`)
          .join('\n');
        return {
          success: true,
          content,
          path: filePath,
          lines: entries.length,
          size: content.length,
          isDirectory: true,
        };
      }

      const content = await fs.readFile(filePath, 'utf8');
      return {
        success: true,
        content,
        path: filePath,
        lines: content.split('\n').length,
        size: content.length
      };
    } catch (error) {
      return { success: false, error: error.message, path: filePath };
    }
  }

  async backupFile(filePath) {
    try {
      const fsMod = await import('fs/promises');
      const pathMod = await import('path');
      const backupDir = pathMod.join(this.projectPath, '.winter', 'backups');
      await fsMod.mkdir(backupDir, { recursive: true });
      
      const fileStat = await fsMod.stat(filePath).catch(() => null);
      if (fileStat && fileStat.isFile()) {
        const timestamp = Date.now();
        const baseName = pathMod.basename(filePath);
        const backupName = `${timestamp}_${baseName}`;
        const backupPath = pathMod.join(backupDir, backupName);
        await fsMod.copyFile(filePath, backupPath);
        
        const metaPath = pathMod.join(backupDir, 'meta.json');
        let meta = [];
        try {
           const metaContent = await fsMod.readFile(metaPath, 'utf8');
           meta = JSON.parse(metaContent);
        } catch(e){}
        meta.push({ original: filePath, backup: backupPath, time: timestamp });
        await fsMod.writeFile(metaPath, JSON.stringify(meta), 'utf8');
      }
    } catch(e) {}
  }

  async writeFile(filePath, content) {
    if (!filePath) {
      return { success: false, error: 'file_path is required' };
    }
    if (typeof content !== 'string') {
      return { success: false, error: 'content is required', path: filePath };
    }

    try {
      await this.backupFile(filePath);
      let oldContent = '';
      try { oldContent = await fs.readFile(filePath, 'utf8'); } catch(e) {}
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, 'utf8');
      
      const diffOutput = diffLines(oldContent, content)
        .filter(part => part.added || part.removed)
        .map(part => {
           const color = part.added ? '\x1b[32m' : '\x1b[31m';
           const prefix = part.added ? '+ ' : '- ';
           return part.value.split('\n').filter(l => l.trim()).map(l => `${color}${prefix}${l}\x1b[0m`).join('\n');
        }).filter(Boolean).join('\n');

      return { success: true, path: filePath, size: content.length, diff: diffOutput };
    } catch (error) {
      return { success: false, error: error.message, path: filePath };
    }
  }

  async executeEdit(input, cwd) {
    const request = this.unwrapToolInput(input);
    const batch = request.edits ?? request.replacements ?? request.changes;

    if (Array.isArray(batch)) {
      const results = [];
      for (const item of batch) {
        const edit = this.normalizeEditArgs({ ...request, ...this.unwrapToolInput(item) }, cwd);
        const result = await this.editFile(edit.filePath, edit.oldString, edit.newString);
        results.push(result);
        if (result.success === false) {
          return { ...result, batchResults: results };
        }
      }

      return {
        success: true,
        path: results[results.length - 1]?.path,
        replacements: results.reduce((sum, result) => sum + (result.replacements || 0), 0),
        batchResults: results,
        diff: results.map(result => result.diff).filter(Boolean).join('\n'),
      };
    }

    const edit = this.normalizeEditArgs(request, cwd);
    return await this.editFile(edit.filePath, edit.oldString, edit.newString);
  }

  unwrapToolInput(input) {
    let current = input && typeof input === 'object' ? input : {};
    for (const key of ['input', 'args', 'arguments', 'parameters']) {
      if (
        current[key]
        && typeof current[key] === 'object'
        && !Array.isArray(current[key])
        && Object.keys(current).length === 1
      ) {
        current = current[key];
      }
    }
    return current;
  }

  normalizeEditArgs(input, cwd) {
    const pick = (keys) => {
      for (const key of keys) {
        if (typeof input[key] === 'string') return input[key];
      }
      return undefined;
    };

    const filePath = this.resolveInputPath(pick([
      'file_path', 'filepath', 'filePath', 'path', 'file', 'filename', 'target_file', 'targetFile',
    ]), cwd);
    const oldString = pick([
      'old_string', 'oldString', 'old_text', 'oldText', 'old_str', 'oldStr',
      'search', 'search_string', 'searchString', 'find', 'find_text', 'findText',
      'target', 'target_string', 'targetString', 'text_to_replace', 'textToReplace',
      'pattern', 'original', 'before',
    ]);
    const newString = pick([
      'new_string', 'newString', 'new_text', 'newText', 'new_str', 'newStr',
      'replace', 'replacement', 'replace_with', 'replaceWith',
      'new_content', 'newContent', 'content', 'value', 'after',
    ]);

    return { filePath, oldString, newString };
  }

  async editFile(filePath, oldString, newString) {
    if (!filePath) {
      return { success: false, error: 'file_path is required' };
    }
    if (typeof oldString !== 'string' || typeof newString !== 'string') {
      return {
        success: false,
        error: 'old_string and new_string are required. Accepted aliases: oldString/old_str/search/find/text_to_replace and newString/new_str/replace/replacement/replace_with. For full-file replacement use Write instead of Edit.',
        path: filePath,
      };
    }

    try {
      await this.backupFile(filePath);
      const content = await fs.readFile(filePath, 'utf8');
      if (!content.includes(oldString)) {
        return { 
          success: false, 
          error: 'old_string not found in file. Ensure exact whitespace, indentation, and newlines match. Tip: Use /read to view the file or use Write to replace the entire file if needed.', 
          path: filePath 
        };
      }
      const newContent = content.replace(oldString, newString);
      await fs.writeFile(filePath, newContent, 'utf8');
      
      const diffOutput = diffLines(content, newContent)
        .filter(part => part.added || part.removed)
        .map(part => {
           const color = part.added ? '\x1b[32m' : '\x1b[31m';
           const prefix = part.added ? '+ ' : '- ';
           return part.value.split('\n').filter(l => l.trim()).map(l => `${color}${prefix}${l}\x1b[0m`).join('\n');
        }).filter(Boolean).join('\n');

      return { success: true, path: filePath, replacements: 1, diff: diffOutput };
    } catch (error) {
      return { success: false, error: error.message, path: filePath };
    }
  }

  async bash(command, cwd, timeout = 60000, shell = 'auto') {
    if (typeof command !== 'string' || command.trim() === '') {
      return { success: false, error: 'command is required', exitCode: 1 };
    }
    
    timeout = parseInt(timeout, 10);
    if (isNaN(timeout) || timeout < 0) timeout = 60000;

    const heredocResult = await this.tryHandleHeredocWrite(command, cwd);
    if (heredocResult) return heredocResult;

    let requestedShell = this.normalizeWindowsShell(shell);
    const translated = await this.translateWindowsCommand(command);
    command = translated.command;
    if (requestedShell === 'auto' && translated.shell) requestedShell = translated.shell;

    // Security check
    const lowerCommand = command.toLowerCase();
    for (const blocked of this.blockedPatterns) {
      if (lowerCommand.includes(blocked)) {
        return { success: false, error: `Blocked command pattern: ${blocked}` };
      }
    }

    try {
      const { stdout, stderr } = process.platform === 'win32'
        ? await this.execWindowsCommand(command, cwd, timeout, requestedShell)
        : await execAsync(command, { cwd, timeout, shell: true, maxBuffer: 10 * 1024 * 1024 });
      return {
        success: true,
        stdout: stdout || '',
        stderr: stderr || '',
        exitCode: 0
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        stdout: error.stdout || '',
        stderr: error.stderr || '',
        exitCode: error.code || 1
      };
    }
  }

  normalizeWindowsShell(shell) {
    const value = String(shell || 'auto').toLowerCase();
    if (['cmd', 'cmd.exe', 'commandprompt', 'command-prompt'].includes(value)) return 'cmd';
    if (['powershell', 'pwsh', 'ps', 'powershell.exe'].includes(value)) return 'powershell';
    return 'auto';
  }

  async execWindowsCommand(command, cwd, timeout, requestedShell = 'auto') {
    const shell = requestedShell === 'auto' ? this.detectWindowsShell(command) : requestedShell;
    if (shell === 'cmd') {
      return await execFileAsync('cmd.exe', ['/d', '/s', '/c', command], {
        cwd,
        timeout,
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024,
      });
    }

    return await execFileAsync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
      cwd,
      timeout,
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
    });
  }

  detectWindowsShell(command) {
    const trimmed = String(command || '').trim();
    if (this.looksLikePowerShell(trimmed)) return 'powershell';
    if (this.looksLikeCmd(trimmed)) return 'cmd';
    return 'powershell';
  }

  looksLikePowerShell(command) {
    return /(^|[;&|]\s*)(Get-|Set-|New-|Remove-|Copy-|Move-|Select-|Where-|ForEach-|Test-Path|Out-File|Write-Host|powershell(?:\.exe)?\b|pwsh\b)/i.test(command);
  }

  looksLikeCmd(command) {
    return /\s(&&|\|\|)\s/.test(command)
      || /(^|[&]\s*)(dir|copy|xcopy|del|erase|move|ren|type|echo|set|if|for|mkdir|rmdir)\b/i.test(command)
      || /^\s*@?echo\s+/i.test(command)
      || /(^|\s)(\/b|\/s|\/q|\/y)\b/i.test(command);
  }

  async glob(pattern, cwd) {
    const normalizedRequest = await this.normalizeGlobRequest(pattern, cwd);
    if (normalizedRequest.file) {
      return {
        success: true,
        pattern,
        cwd,
        files: [normalizedRequest.file],
        count: 1
      };
    }
    pattern = normalizedRequest.pattern;
    cwd = normalizedRequest.cwd;

    if (typeof pattern !== 'string' || pattern.trim() === '') {
      return { success: false, error: 'pattern is required', pattern, cwd };
    }

    try {
      const files = await this.findFiles(cwd, pattern);
      return {
        success: true,
        pattern,
        cwd,
        files: files.slice(0, 100),
        count: files.length
      };
    } catch (error) {
      return { success: false, error: error.message, pattern, cwd };
    }
  }

  async normalizeGlobRequest(pattern, cwd) {
    if (typeof pattern !== 'string') {
      return { pattern, cwd };
    }

    const cleanPattern = this.normalizePathText(pattern);
    if (path.isAbsolute(cleanPattern) && /[*?]/.test(cleanPattern)) {
      return this.splitAbsoluteGlob(cleanPattern, cwd);
    }

    if (!path.isAbsolute(cleanPattern)) {
      return { pattern, cwd };
    }

    try {
      const stat = await fs.stat(cleanPattern);
      if (stat.isDirectory()) {
        return { pattern: '**/*', cwd: cleanPattern };
      }
      if (stat.isFile()) {
        return { pattern, cwd, file: cleanPattern };
      }
    } catch {}

    return { pattern, cwd };
  }

  splitAbsoluteGlob(pattern, fallbackCwd) {
    const normalized = pattern.replace(/\\/g, '/');
    const wildcardIndex = normalized.search(/[*?]/);
    if (wildcardIndex === -1) {
      return { pattern, cwd: fallbackCwd };
    }

    const slashIndex = normalized.lastIndexOf('/', wildcardIndex);
    if (slashIndex === -1) {
      return { pattern, cwd: fallbackCwd };
    }

    const root = normalized.slice(0, slashIndex);
    const relativePattern = normalized.slice(slashIndex + 1) || '**/*';
    return {
      pattern: relativePattern,
      cwd: root,
    };
  }

  async translateWindowsCommand(command) {
    if (process.platform !== 'win32') return { command };

    const trimmed = command.trim();
    const ls = trimmed.match(/^ls(?:\s+(.+))?$/i);
    if (ls) {
      const parsed = this.parseLsArgs(ls[1] || '');
      const target = parsed.target || '.';
      const recurse = parsed.flags.has('r') || parsed.flags.has('recursive');
      const long = parsed.flags.has('l') || parsed.flags.has('la') || parsed.flags.has('al');
      const force = parsed.flags.has('a') || parsed.flags.has('force') || parsed.flags.has('la') || parsed.flags.has('al');
      const fields = long
        ? 'Mode,Length,LastWriteTime,Name'
        : 'Name';
      return {
        command: `Get-ChildItem -LiteralPath ${this.quotePowerShellString(target)}${recurse ? ' -Recurse' : ''}${force ? ' -Force' : ''} | Select-Object ${fields}`,
        shell: 'powershell',
      };
    }

    const cat = trimmed.match(/^cat\s+(.+)$/i);
    if (cat) {
      const target = cat[1].trim();
      const normalizedTarget = this.normalizePathText(target);
      try {
        const stat = await fs.stat(normalizedTarget);
        if (stat.isDirectory()) {
          return {
            command: `Get-ChildItem -LiteralPath ${this.quotePowerShellString(target)} -Force | Select-Object -ExpandProperty Name`,
            shell: 'powershell',
          };
        }
      } catch {}
      return {
        command: `Get-Content -LiteralPath ${this.quotePowerShellString(target)}`,
        shell: 'powershell',
      };
    }

    return { command };
  }

  async tryHandleHeredocWrite(command, cwd) {
    const match = String(command || '').match(/^cat\s*>\s*(.+?)\s*<<\s*['"]?([A-Za-z0-9_-]+)['"]?\r?\n([\s\S]*?)\r?\n\2\s*$/);
    if (!match) return null;

    const [, rawTarget, , content] = match;
    const target = this.resolveInputPath(rawTarget.trim(), cwd);
    return await this.writeFile(target, content.endsWith('\n') ? content : `${content}\n`);
  }

  parseLsArgs(rawArgs) {
    const tokens = this.splitShellLike(rawArgs);
    const flags = new Set();
    const paths = [];

    for (const token of tokens) {
      if (token.startsWith('-') && token.length > 1) {
        const flag = token.replace(/^-+/, '').toLowerCase();
        flags.add(flag);
        if (!flag.includes('=')) {
          for (const ch of flag) flags.add(ch);
        }
      } else {
        paths.push(token);
      }
    }

    return { flags, target: paths.join(' ') };
  }

  splitShellLike(text) {
    const tokens = [];
    let current = '';
    let quote = null;
    let escaped = false;

    for (const ch of String(text || '')) {
      if (escaped) {
        current += ch;
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if ((ch === '"' || ch === "'") && !quote) {
        quote = ch;
        continue;
      }
      if (ch === quote) {
        quote = null;
        continue;
      }
      if (/\s/.test(ch) && !quote) {
        if (current) {
          tokens.push(current);
          current = '';
        }
        continue;
      }
      current += ch;
    }

    if (current) tokens.push(current);
    return tokens;
  }

  quotePowerShellString(value) {
    const unquoted = value.replace(/^['"]|['"]$/g, '');
    return `'${unquoted.replace(/'/g, "''")}'`;
  }

  async grep(pattern, searchPath, globPattern, outputMode = 'content') {
    if (typeof pattern !== 'string' || pattern === '') {
      return { success: false, error: 'pattern is required', pattern, path: searchPath };
    }

    try {
      const files = await this.findFiles(searchPath, globPattern || '**/*');
      const matches = [];

      for (const file of files) {
        if (matches.length >= 50) break;
        let content;
        try {
          content = await fs.readFile(file, 'utf8');
        } catch {
          continue;
        }

        const lines = content.split(/\r?\n/);
        for (let i = 0; i < lines.length && matches.length < 50; i++) {
          if (lines[i].includes(pattern)) {
            matches.push(`${file}:${i + 1}:${lines[i]}`);
          }
        }
      }

      return {
        success: true,
        pattern,
        path: searchPath,
        matches: this.formatGrepMatches(matches, outputMode),
        count: matches.length,
        output_mode: outputMode
      };
    } catch (error) {
      return { success: false, error: error.message, pattern, path: searchPath };
    }
  }

  formatGrepMatches(matches, outputMode) {
    switch (outputMode) {
      case 'count':
        return [];
      case 'files_with_matches':
        return [...new Set(matches.map(match => {
          const parsed = match.match(/^(.+):\d+:/);
          return parsed ? parsed[1] : match;
        }))];
      case 'content':
      default:
        return matches;
    }
  }

  async findFiles(rootDir, pattern = '**/*') {
    const root = path.resolve(rootDir || this.projectPath);
    const results = [];
    const ignored = new Set(['node_modules', '.git', 'dist', 'build', '.winter', '.claude']);
    
    try {
      const ignorePath = path.join(this.projectPath, '.winterignore');
      const ignoreData = await fs.readFile(ignorePath, 'utf8');
      ignoreData.split('\n').forEach(line => {
        const t = line.trim();
        if (t && !t.startsWith('#')) ignored.add(t);
      });
    } catch(e) {}
    
    const matcher = this.createMatcher(pattern);

    const walk = async (dir) => {
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (ignored.has(entry.name)) continue;

        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
          continue;
        }

        const relative = path.relative(root, fullPath).replace(/\\/g, '/');
        if (matcher(relative, entry.name)) {
          results.push(fullPath);
        }
      }
    };

    await walk(root);
    return results;
  }

  createMatcher(pattern) {
    const normalized = String(pattern || '**/*').replace(/\\/g, '/');

    if (normalized === '**/*' || normalized === '*') {
      return () => true;
    }

    const regex = new RegExp(`^${this.globToRegexSource(normalized)}$`);
    return (relative, name) => regex.test(relative) || regex.test(name);
  }

  globToRegexSource(pattern) {
    let source = '';
    for (let i = 0; i < pattern.length; i++) {
      const char = pattern[i];
      const next = pattern[i + 1];
      const afterNext = pattern[i + 2];

      if (char === '*' && next === '*' && afterNext === '/') {
        source += '(?:.*/)?';
        i += 2;
      } else if (char === '*' && next === '*') {
        source += '.*';
        i += 1;
      } else if (char === '*') {
        source += '[^/]*';
      } else if (char === '?') {
        source += '[^/]';
      } else if ('\\^$+?.()|{}[]'.includes(char)) {
        source += `\\${char}`;
      } else {
        source += char;
      }
    }
    return source;
  }

  async lsp(operation, input, filePath) {
    if (typeof operation !== 'string' || operation.trim() === '') {
      return { success: false, error: 'operation is required' };
    }
    if (!filePath) {
      return { success: false, error: 'file_path is required' };
    }

    return {
      success: true,
      operation,
      filePath,
      message: `LSP ${operation} - integrate with language server for full functionality`
    };
  }

  async taskCreate(title, description) {
    if (typeof title !== 'string' || title.trim() === '') {
      return { success: false, error: 'title is required' };
    }
    if (!this.repl?.session?.createPlan) {
      return { success: false, error: 'session manager is not available' };
    }

    const task = await this.repl.session.createPlan(title, description);
    return { success: true, task };
  }

  async taskUpdate(taskId, updates) {
    if (typeof taskId !== 'string' || taskId.trim() === '') {
      return { success: false, error: 'task_id is required' };
    }
    if (!this.repl?.session?.updatePlan) {
      return { success: false, error: 'session manager is not available' };
    }

    const task = await this.repl.session.updatePlan(taskId, updates);
    if (!task) {
      return { success: false, error: 'Task not found', taskId };
    }
    return { success: true, task };
  }

  async taskList() {
    if (!this.repl?.session?.getPlans) {
      return { success: false, error: 'session manager is not available' };
    }
    return { success: true, tasks: this.repl.session.getPlans() };
  }

  async webFetch(url, prompt) {
    if (typeof url !== 'string' || url.trim() === '') {
      return { success: false, error: 'url is required' };
    }

    try {
      const response = await fetch(url);
      const html = await response.text();
      const cleanText = html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        .replace(/<head\b[^<]*(?:(?!<\/head>)<[^<]*)*<\/head>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return {
        success: true,
        url,
        content: cleanText.substring(0, 15000), // Cho phép đọc dài hơn
        length: text.length
      };
    } catch (error) {
      return { success: false, error: error.message, url };
    }
  }

  async webSearch(query) {
    if (typeof query !== 'string' || query.trim() === '') {
      return { success: false, error: 'query is required' };
    }

    try {
      const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'WinterCLI/1.0',
        },
      });
      const html = await response.text();
      const results = [...html.matchAll(/<a rel="nofollow" class="result__a" href="([^"]+)">([\s\S]*?)<\/a>/g)]
        .slice(0, 5)
        .map((match) => ({
          title: this.stripHtml(match[2]),
          url: this.decodeDuckDuckGoUrl(match[1]),
        }));

      return {
        success: true,
        query,
        results,
        count: results.length,
      };
    } catch (error) {
      return { success: false, error: error.message, query };
    }
  }

  stripHtml(html) {
    return html
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .trim();
  }

  decodeDuckDuckGoUrl(url) {
    try {
      const parsed = new URL(url, 'https://duckduckgo.com');
      const uddg = parsed.searchParams.get('uddg');
      return uddg ? decodeURIComponent(uddg) : parsed.href;
    } catch {
      return url;
    }
  }

  async browserDebug(url, action) {
    if (!url) return { success: false, error: 'url is required' };
    
    try {
      let puppeteer;
      try {
        puppeteer = (await import('puppeteer')).default;
      } catch (e) {
        return { success: false, error: 'Thư viện puppeteer chưa được cài đặt. AI HÃY TỰ DÙNG TOOL BASH ĐỂ CHẠY LỆNH: npm install puppeteer --no-save' };
      }

      const browser = await puppeteer.launch({ headless: 'new' });
      const page = await browser.newPage();
      
      const consoleLogs = [];
      const networkErrors = [];

      page.on('console', msg => {
        if (msg.type() === 'error' || msg.type() === 'warning') {
          consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
        }
      });

      page.on('requestfailed', request => {
        networkErrors.push(`${request.method()} ${request.url()} - ${request.failure()?.errorText}`);
      });

      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 }).catch(e => consoleLogs.push(e.message));

      let actionResult = null;
      if (action) {
        actionResult = await page.evaluate(action).catch(e => e.message);
      }

      const html = await page.evaluate(() => document.body.innerHTML.substring(0, 3000)).catch(() => '');
      await browser.close();

      return {
        success: true,
        url,
        consoleErrors: consoleLogs.slice(-10),
        networkErrors: networkErrors.slice(-10),
        domSnippet: html,
        actionResult
      };
    } catch (e) {
      return { success: false, error: e.message, url };
    }
  }
}
