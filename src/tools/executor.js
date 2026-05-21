/**
 * ❄️ WINTER TOOL EXECUTOR ❄️
 * Complete Claude Code / Codex compatible tool system
 */

import { promises as fs } from 'fs';
import path from 'path';
import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import { diffLines } from 'diff';
import { withRetry } from './retry.js';
import { PermissionManager } from './permission.js';
import { MCPClient } from '../mcp/client.js';
import { trackToolUse } from './analytics.js';
import { NotebookTool } from './notebook.js';
import { TodoTool } from './todo.js';
import { SchedulerTool } from './scheduler.js';
import { InteractiveTool } from './interactive.js';
import { AgentTool } from './agent.js';
import { InsertTextTool } from './insert-text.js';
import { StrReplaceAllTool } from './str-replace-all.js';
import { WebArchiveTool } from './web-archive.js';
import { formatRuntimeEnvironmentSummary, getRuntimeEnvironment } from '../cli/runtime-env.js';
import { HtmlFxManager } from '../integrations/htmlfx-manager.js';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

export class ToolExecutor {
  constructor(repl) {
    this.repl = repl;
    this.projectPath = repl?.projectPath || process.cwd();
    this.allowedCommands = ['git', 'npm', 'node', 'python', 'code', 'pnpm', 'yarn', 'bun', 'pip', 'cargo', 'rustc'];
    this.blockedPatterns = ['rm -rf', '/f/s', '--force'];
    this.permissionManager = new PermissionManager(repl?.config, repl?.session);
    this.mcpClients = new Map();
    this.notebookTool = new NotebookTool();
    this.todoTool = new TodoTool(repl?.projectPath ? path.join(repl.projectPath, '.winter') : undefined);
    this.schedulerTool = new SchedulerTool(repl?.projectPath ? path.join(repl.projectPath, '.winter') : undefined);
    this.interactiveTool = new InteractiveTool(repl);
    this.agentTool = new AgentTool(repl);
    this.insertTextTool = new InsertTextTool();
    this.strReplaceAllTool = new StrReplaceAllTool();
    this.webArchiveTool = new WebArchiveTool(repl?.projectPath ? path.join(repl.projectPath, '.winter') : undefined);
    this.htmlFxManager = new HtmlFxManager({ projectPath: this.projectPath });
    this.mcpToolCache = null; // Cache for dynamically discovered MCP tools
  }

  getRuntimeEnvironmentSummary() {
    return formatRuntimeEnvironmentSummary(getRuntimeEnvironment());
  }

  getToolDefinitions() {
    const environmentSummary = this.getRuntimeEnvironmentSummary();
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
        description: `Execute a shell command.\n\n${environmentSummary}\n\nPrefer Write/Edit for file writes.`,
        parameters: {
          type: 'object',
          properties: {
            command: { type: 'string', description: 'Shell command to execute' },
            cwd: { type: 'string', description: 'Working directory' },
            timeout: { type: 'number', description: 'Timeout in ms (default: 60000)' },
            shell: { type: 'string', description: process.platform === 'win32' ? 'Windows shell hint: auto, powershell, or cmd' : 'POSIX shell hint: usually omit; use only when required' }
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
    description: 'Search for text in files using regex or fixed string, with context lines, case insensitive, invert match, multiline, and more.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Search pattern (regex or fixed string)' },
        path: { type: 'string', description: 'Directory to search' },
        glob: { type: 'string', description: 'File filter (e.g., *.js, *.ts, **/*.js)' },
        output_mode: { type: 'string', description: 'content, files_with_matches, count', enum: ['content', 'files_with_matches', 'count'] },
        case_insensitive: { type: 'boolean', description: 'Case insensitive search (default: false)' },
        invert_match: { type: 'boolean', description: 'Return lines that do NOT match (default: false)' },
        fixed_string: { type: 'boolean', description: 'Treat pattern as literal string, not regex (default: false)' },
        multiline: { type: 'boolean', description: 'Search across multiple lines (default: false)' },
        context_lines: { type: 'number', description: 'Lines of context before and after each match (default: 0)' },
        before_lines: { type: 'number', description: 'Lines of context before each match (default: 0)' },
        after_lines: { type: 'number', description: 'Lines of context after each match (default: 0)' },
        max_results: { type: 'number', description: 'Maximum number of results to return (default: 50, max: 500)' },
        line_numbers: { type: 'boolean', description: 'Include line numbers in output (default: true)' }
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
        name: 'MCP',
        description: 'Call a configured MCP server tool by name. Use for external integrations and IDE-like tools. Discover available MCP tools via the MCP tool with server name and tool=list. Also, tools from MCP servers are exposed with mcp__<server>__<tool> naming for direct IDE integration (e.g. mcp__vscode__open_file).',
        parameters: {
          type: 'object',
          properties: {
            server: { type: 'string', description: 'Configured MCP server name (e.g. vscode)' },
            tool: { type: 'string', description: 'MCP tool name, or set to "list" to discover all tools from a server' },
            arguments: { type: 'object', description: 'Tool arguments' },
          },
          required: ['server', 'tool']
        }
      },
      {
        type: 'function',
        name: 'Parallel',
        description: 'Execute multiple independent Winter tools concurrently. Use only when the calls do not depend on each other.',
        parameters: {
          type: 'object',
          properties: {
            tools: {
              type: 'array',
              description: 'Array of tool calls: { name, input }',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  input: { type: 'object' },
                },
                required: ['name']
              }
            }
          },
          required: ['tools']
        }
      },
      {
        type: 'function',
        name: 'NotebookRead',
        description: 'Read a Jupyter notebook (.ipynb) file and return its cells, metadata, and outputs.',
        parameters: {
          type: 'object',
          properties: {
            notebook_path: { type: 'string', description: 'Path to .ipynb file' },
          },
          required: ['notebook_path']
        }
      },
      {
        type: 'function',
        name: 'NotebookEdit',
        description: 'Edit a specific cell in a Jupyter notebook by replacing its source.',
        parameters: {
          type: 'object',
          properties: {
            notebook_path: { type: 'string', description: 'Path to .ipynb file' },
            cell_id: { type: 'string', description: 'Cell ID (e.g., cell-0, cell-1)' },
            new_source: { type: 'string', description: 'New source code for the cell' },
          },
          required: ['notebook_path', 'cell_id', 'new_source']
        }
      },
      {
        type: 'function',
        name: 'TodoWrite',
        description: 'Create a new persistent todo item with title, status, and priority.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Todo title' },
            status: { type: 'string', description: 'pending, in_progress, completed, cancelled (default: pending)' },
            priority: { type: 'string', description: 'low, medium, high, critical (default: medium)' },
          },
          required: ['title']
        }
      },
      {
        type: 'function',
        name: 'TodoList',
        description: 'List all todos, optionally filtered by status.',
        parameters: {
          type: 'object',
          properties: {
            status: { type: 'string', description: 'Optional filter: pending, in_progress, completed, cancelled' },
          },
        }
      },
      {
        type: 'function',
        name: 'ScheduleWakeup',
        description: 'Schedule a reminder/prompt to be triggered after a delay. The AI will be called again with the scheduled prompt.',
        parameters: {
          type: 'object',
          properties: {
            delay: { type: 'string', description: 'Delay before trigger, e.g. "30s", "5m", "1h", "2d", or milliseconds' },
            prompt: { type: 'string', description: 'Prompt to execute when triggered' },
            recurring: { type: 'boolean', description: 'Whether to repeat the schedule (default: false)' },
          },
          required: ['delay', 'prompt']
        }
      },
      {
        type: 'function',
        name: 'AskUserQuestion',
        description: 'Ask the user a question and wait for their response. Supports text input, single-select, and multi-select.',
        parameters: {
          type: 'object',
          properties: {
            questions: {
              type: 'array',
              description: 'Array of questions to ask',
              items: {
                type: 'object',
                properties: {
                  question: { type: 'string', description: 'The question text' },
                  type: { type: 'string', description: 'text, select, or multi-select' },
                  options: { type: 'array', items: { type: 'string' }, description: 'Options for select/multi-select' },
                  default: { type: 'string', description: 'Default value for text input' },
                },
                required: ['question']
              }
            }
          },
          required: ['questions']
        }
      },
      {
        type: 'function',
        name: 'Agent',
        description: 'Spawn a subagent to execute a complex task with planning, execution, and verification workflow.',
        parameters: {
          type: 'object',
          properties: {
            task: { type: 'string', description: 'Task description for the agent' },
            max_steps: { type: 'number', description: 'Maximum execution steps (default: 10, max: 25)' },
            provider: { type: 'string', description: 'AI provider to use for this agent' },
            cwd: { type: 'string', description: 'Working directory' },
          },
          required: ['task']
        }
      },
      {
        type: 'function',
        name: 'InsertText',
        description: 'Insert text at a specific line or position in a file. Supports line number, search-text, beginning, and end modes.',
        parameters: {
          type: 'object',
          properties: {
            file_path: { type: 'string', description: 'File path' },
            insert_text: { type: 'string', description: 'Text to insert' },
            mode: { type: 'string', description: 'Insertion mode: line, after, before, end, beginning' },
            position: { type: 'string', description: 'Line number (for mode:line) or search text (for mode:after/before)' },
          },
          required: ['file_path', 'insert_text']
        }
      },
      {
        type: 'function',
        name: 'StrReplaceAll',
        description: 'Replace ALL occurrences of a string in a file. Unlike Edit which replaces only the first match.',
        parameters: {
          type: 'object',
          properties: {
            file_path: { type: 'string', description: 'File path' },
            old_string: { type: 'string', description: 'String to find (all occurrences)' },
            new_string: { type: 'string', description: 'Replacement string' },
          },
          required: ['file_path', 'old_string', 'new_string']
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
      },
      {
        type: 'function',
        name: 'WebArchive',
        description: 'Fetch archived/cached version of a webpage from Wayback Machine or local cache. Falls back to direct fetch, then Wayback Machine. Use when a page is down, has changed, or you need historical content.',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'URL to fetch archived version of' },
            max_length: { type: 'number', description: 'Max content length (default: 15000)' },
            prefer_direct: { type: 'boolean', description: 'Try direct fetch first before Wayback (default: true)' },
            no_cache: { type: 'boolean', description: 'Bypass local cache (default: false)' },
            clear_cache: { type: 'boolean', description: 'Clear local cache for this URL or all (default: false)' },
          },
          required: ['url']
        }
      },
      {
        type: 'function',
        name: 'HtmlEffectiveness',
        description: 'Compile hybrid markdown into a self-contained HTML document via html-effectiveness-scripts.',
        parameters: {
          type: 'object',
          properties: {
            input_path: { type: 'string', description: 'Input markdown path' },
            output_path: { type: 'string', description: 'Output html path' },
            auto_install: { type: 'boolean', description: 'Auto install/build compiler when missing (default: true)' },
          },
          required: ['input_path', 'output_path']
        }
      }
    ];
  }

  async execute(toolName, input, context = {}) {
    const startedAt = Date.now();
    const normalizedToolName = this.normalizeToolName(toolName);
    try {
      const result = await this.executeInternal(normalizedToolName, input, context);
      trackToolUse(normalizedToolName, Date.now() - startedAt, result?.success !== false, result?.error);
      await this.repl?.session?.recordToolEvent?.({
        tool: normalizedToolName,
        input: this.redactToolInput(input),
        result: this.summarizeToolResult(result),
        durationMs: Date.now() - startedAt,
        success: result?.success !== false,
      });
      return result;
    } catch (error) {
      trackToolUse(normalizedToolName, Date.now() - startedAt, false, error.message);
      await this.repl?.session?.recordToolEvent?.({
        tool: normalizedToolName,
        input: this.redactToolInput(input),
        result: { error: error.message },
        durationMs: Date.now() - startedAt,
        success: false,
      });
      throw error;
    }
  }

  async executeInternal(toolName, input, context = {}) {
    toolName = this.normalizeToolName(toolName);
    input = this.normalizeToolInput(toolName, input);
    const cwd = context.cwd || this.projectPath;
    const resolvedPath = (p) => this.resolveInputPath(p, cwd);

    const preflight = await this.preflightValidateToolArgs(toolName, input, { cwd });
    if (preflight?.success === false) {
      return preflight;
    }
    if (preflight?.coerced && preflight.args) {
      input = preflight.args;
    }

    switch (toolName) {
      case 'Read':
        return await this.readFile(this.resolveInputPath(input.file_path ?? input.filePath ?? input.filepath ?? input.path ?? input.file ?? input.filename ?? input.target_file ?? input.targetFile, cwd));
      case 'Write':
        return await this.writeFile(this.resolveInputPath(input.file_path ?? input.filePath ?? input.filepath ?? input.path ?? input.file ?? input.filename ?? input.target_file ?? input.targetFile, cwd), input.content ?? input.text ?? input.data ?? input.value ?? input.body);
      case 'Edit':
        return await this.executeEdit(input, cwd);
      case 'Bash':
        return await this.bash(input.command ?? input.cmd ?? input.script ?? input.code ?? input.input, input.cwd || input.path || cwd, input.timeout, input.shell);
      case 'Glob':
        return await this.glob(input.pattern ?? input.glob ?? '**/*', input.cwd || input.path || cwd);
      case 'Grep':
        return await this.grep(
          input.pattern ?? input.query ?? input.q,
          input.path || input.cwd || cwd,
          input.glob,
          input.output_mode,
          {
            case_insensitive: input.case_insensitive ?? input.ignoreCase,
            invert_match: input.invert_match ?? input.invert,
            fixed_string: input.fixed_string ?? input.fixedString,
            multiline: input.multiline,
            context_lines: input.context_lines ?? input.context,
            before_lines: input.before_lines,
            after_lines: input.after_lines,
            max_results: input.max_results ?? input.maxResults ?? input.max,
            line_numbers: input.line_numbers ?? input.lineNumbers,
          }
        );
      case 'LSP':
        return await this.lsp(input.operation, input, resolvedPath(input.file_path ?? input.path ?? input.file));
      case 'TaskCreate':
        return await this.taskCreate(input.title ?? input.task ?? input.description, input.description || '');
      case 'TaskUpdate':
        return await this.taskUpdate(input.task_id ?? input.id, input);
      case 'TaskList':
        return await this.taskList();
      case 'MCP':
        return await this.mcp(input.server ?? input.server_name ?? input.name, input.tool ?? input.tool_name ?? input.method, input.arguments ?? input.args ?? input.params ?? {});
      case 'Parallel':
        return await this.parallelExecute(input.tools ?? input.calls ?? [], { cwd });
      case 'BrowserDebug':
        return await this.browserDebug(input.url ?? input.uri, input.action);
      case 'WebFetch':
        return await this.webFetch(input.url ?? input.uri ?? input.href, input.prompt ?? input.query ?? input.extract);
      case 'WebSearch':
        return await this.webSearch(input.query ?? input.q ?? input.search ?? input.search_query ?? input.searchQuery);
      case 'NotebookRead':
        return await this.notebookTool.read(this.resolveInputPath(input.notebook_path ?? input.path ?? input.file, cwd));
      case 'NotebookEdit':
        return await this.notebookTool.edit(this.resolveInputPath(input.notebook_path ?? input.path ?? input.file, cwd), input.cell_id ?? input.cellId, input.new_source ?? input.newSource ?? input.source);
      case 'TodoWrite':
        return await this.todoTool.write(input.title, input.status, input.priority);
      case 'TodoList':
        return await this.todoTool.list(input.status);
      case 'ScheduleWakeup':
        return await this.schedulerTool.schedule(input.delay, input.prompt, input.recurring);
      case 'AskUserQuestion':
        return await this.interactiveTool.askQuestion(input.questions ?? input.question);
      case 'Agent':
        return await this.agentTool.run(input.task, { maxSteps: input.max_steps ?? input.maxSteps, provider: input.provider, cwd: input.cwd });
      case 'InsertText':
        return await this.insertTextTool.insert(this.resolveInputPath(input.file_path ?? input.path ?? input.file, cwd), input.insert_text ?? input.text ?? input.content, input);
      case 'StrReplaceAll':
        return await this.strReplaceAllTool.replaceAll(this.resolveInputPath(input.file_path ?? input.path ?? input.file, cwd), input.old_string ?? input.oldString ?? input.find, input.new_string ?? input.newString ?? input.replace);
      case 'WebArchive':
        return await this.webArchiveTool.fetch(input.url, {
          maxLength: input.max_length ?? input.maxLength,
          preferDirect: input.prefer_direct ?? input.preferDirect,
          cache: input.no_cache ? false : true,
          clearCache: input.clear_cache ?? input.clearCache,
        });
      case 'HtmlEffectiveness':
        return await this.htmlEffectivenessCompile(input, cwd);
      default:
        // Check if tool name starts with mcp__ for MCP-IDE integration
        const mcpMatch = toolName.match(/^mcp__([^_]+)__(.+)/);
        if (mcpMatch) {
          return await this.mcp(mcpMatch[1], mcpMatch[2], input);
        }
        return {
          success: false,
          error: `Unknown tool: ${toolName}`,
          availableTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'TaskCreate', 'TaskUpdate', 'TaskList', 'MCP', 'Parallel', 'BrowserDebug', 'WebFetch', 'WebSearch', 'WebArchive', 'HtmlEffectiveness', 'NotebookRead', 'NotebookEdit', 'TodoWrite', 'TodoList', 'ScheduleWakeup', 'AskUserQuestion', 'Agent', 'InsertText', 'StrReplaceAll'],
          recovery: 'Call one of the available tools. For file writes use Write with { "file_path": "...", "content": "..." }. For shell commands use Bash with { "command": "..." }.',
        };
    }
  }

  async preflightValidateToolArgs(toolName, input, { cwd } = {}) {
    const args = (input && typeof input === 'object' && !Array.isArray(input)) ? input : {};
    const pick = (...keys) => {
      for (const key of keys) {
        const value = args[key];
        if (typeof value === 'string' && value.trim() !== '') return value;
      }
      return undefined;
    };

    const requireOne = (keys, example) => {
      for (const key of keys) {
        const value = args[key];
        if (typeof value === 'string' && value.trim() !== '') return null;
      }
      return {
        success: false,
        error: `Missing required argument. Provide one of: ${keys.join(', ')}.`,
        recovery: example,
      };
    };

    if (toolName === 'Read') {
      const filePath = pick('file_path', 'filePath', 'filepath', 'path', 'file', 'filename', 'target_file', 'targetFile');
      if (!filePath) {
        return {
          success: false,
          error: 'Missing required argument. Provide one of: file_path, path, file.',
          recovery: 'Example: Read {"file_path":"README.md"}',
        };
      }
      return { success: true, coerced: true, args: { file_path: filePath } };
    }

    if (toolName === 'Write') {
      const filePath = pick('file_path', 'filePath', 'filepath', 'path', 'file', 'filename', 'target_file', 'targetFile');
      if (!filePath) {
        return { success: false, error: 'content is required', recovery: 'Example: Write {"file_path":"src/app.js","content":"..."}' };
      }
      const content = pick('content', 'text', 'data', 'value', 'body');
      if (typeof content !== 'string') {
        return { success: false, error: 'content is required', recovery: 'Example: Write {"file_path":"src/app.js","content":"..."}' };
      }
      return { success: true, coerced: true, args: { file_path: filePath, content } };
    }

    if (toolName === 'Bash') {
      const cmd = pick('command', 'cmd', 'script', 'code', 'input');
      if (!cmd) {
        return { success: false, error: 'command is required', recovery: 'Example: Bash {"command":"npm test"}' };
      }
      const missingScript = await this.findMissingNpmScript(cmd, cwd);
      if (missingScript) {
        return {
          success: false,
          error: `npm script "${missingScript.script}" does not exist in package.json`,
          recovery: missingScript.available.length
            ? `Use an existing script: ${missingScript.available.map(name => `npm run ${name}`).join(', ')}`
            : 'No package scripts are defined. Inspect package.json before running npm scripts.',
        };
      }
      const next = { command: cmd };
      if (typeof args.timeout !== 'undefined') next.timeout = args.timeout;
      if (typeof args.shell !== 'undefined') next.shell = args.shell;
      if (typeof args.cwd === 'string' && args.cwd.trim()) next.cwd = args.cwd;
      return { success: true, coerced: true, args: next };
    }

    if (toolName === 'Grep') {
      const pattern = pick('pattern', 'query', 'q');
      if (!pattern) {
        return { success: false, error: 'pattern is required', recovery: 'Example: Grep {"pattern":"TODO","path":"."}' };
      }
      // path is optional at preflight (defaults to cwd in executeInternal)
      const next = { ...args, pattern };
      if (!next.path && (typeof cwd === 'string' && cwd.trim())) next.path = next.cwd || cwd;
      // Normalize common option names (keep others intact)
      if (typeof next.output_mode === 'undefined' && typeof next.outputMode === 'string') next.output_mode = next.outputMode;
      if (typeof next.case_insensitive === 'undefined' && typeof next.ignoreCase !== 'undefined') next.case_insensitive = next.ignoreCase;
      if (typeof next.fixed_string === 'undefined' && typeof next.fixedString !== 'undefined') next.fixed_string = next.fixedString;
      if (typeof next.invert_match === 'undefined' && typeof next.invert !== 'undefined') next.invert_match = next.invert;
      if (typeof next.max_results === 'undefined' && typeof next.maxResults !== 'undefined') next.max_results = next.maxResults;
      if (typeof next.line_numbers === 'undefined' && typeof next.lineNumbers !== 'undefined') next.line_numbers = next.lineNumbers;
      return { success: true, coerced: true, args: next };
    }

    if (toolName === 'HtmlEffectiveness') {
      const inputPath = pick('input_path', 'inputPath', 'input');
      const outputPath = pick('output_path', 'outputPath', 'output');
      if (!inputPath || !outputPath) {
        return {
          success: false,
          error: 'input_path and output_path are required',
          recovery: 'Example: HtmlEffectiveness {"input_path":"doc.md","output_path":"doc.html"}',
        };
      }
      const next = { input_path: inputPath, output_path: outputPath };
      if (typeof args.auto_install !== 'undefined') next.auto_install = args.auto_install;
      if (typeof args.autoInstall !== 'undefined') next.auto_install = args.autoInstall;
      return { success: true, coerced: true, args: next };
    }

    if (toolName === 'NotebookRead') {
      const notebookPath = pick('notebook_path', 'path', 'file');
      if (!notebookPath) {
        return { success: false, error: 'notebook_path is required', recovery: 'Example: NotebookRead {"notebook_path":"analysis.ipynb"}' };
      }
      return { success: true, coerced: true, args: { notebook_path: notebookPath } };
    }

    if (toolName === 'NotebookEdit') {
      const notebookPath = pick('notebook_path', 'path', 'file');
      if (!notebookPath) {
        return { success: false, error: 'notebook_path is required', recovery: 'Example: NotebookEdit {"notebook_path":"a.ipynb","cell_id":"cell-0","new_source":"print(1)"}' };
      }
      const cellId = pick('cell_id', 'cellId');
      const newSource = pick('new_source', 'newSource', 'source');
      if (!cellId || !newSource) {
        return {
          success: false,
          error: 'cell_id and new_source are required',
          recovery: 'Example: NotebookEdit {"notebook_path":"a.ipynb","cell_id":"cell-0","new_source":"print(1)"}',
        };
      }
      return { success: true, coerced: true, args: { notebook_path: notebookPath, cell_id: cellId, new_source: newSource } };
    }

    if (toolName === 'WebFetch' || toolName === 'WebArchive' || toolName === 'BrowserDebug') {
      const url = pick('url', 'uri', 'href');
      if (!url) {
        return { success: false, error: 'url is required', recovery: `Example: ${toolName} {"url":"https://example.com"}` };
      }
      const next = { ...args, url };
      return { success: true, coerced: true, args: next };
    }

    if (toolName === 'WebSearch') {
      const query = pick('query', 'q', 'search', 'search_query', 'searchQuery');
      if (!query) {
        return { success: false, error: 'query is required', recovery: 'Example: WebSearch {"query":"winter cli"}' };
      }
      return { success: true, coerced: true, args: { query } };
    }

    // Default: allow tool implementation to validate
    return { success: true };
  }

  async findMissingNpmScript(command, cwd) {
    const match = String(command || '').trim().match(/^(?:npm|pnpm|yarn|bun)\s+run\s+([A-Za-z0-9:_-]+)(?:\s|$)/i);
    if (!match) return null;
    const script = match[1];
    try {
      const packageJsonPath = path.join(cwd || this.projectPath, 'package.json');
      const pkg = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
      const scripts = pkg.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : {};
      if (Object.prototype.hasOwnProperty.call(scripts, script)) return null;
      return { script, available: Object.keys(scripts).sort() };
    } catch {
      return null;
    }
  }

  redactToolInput(input) {
    if (!input || typeof input !== 'object') return input;
    const secretPattern = /(api[-_]?key|auth[-_]?token|access[-_]?token|refresh[-_]?token|secret|password)/i;
    return Object.fromEntries(
      Object.entries(input).map(([key, value]) => [
        key,
        secretPattern.test(key) ? '[redacted]' : value,
      ])
    );
  }

  summarizeToolResult(result) {
    if (!result || typeof result !== 'object') return result;
    const summary = {
      success: result.success !== false,
    };
    for (const key of ['error', 'path', 'count', 'exitCode', 'server', 'tool']) {
      if (result[key] !== undefined) summary[key] = result[key];
    }
    if (typeof result.stdout === 'string') summary.stdout = result.stdout.slice(0, 1000);
    if (typeof result.stderr === 'string') summary.stderr = result.stderr.slice(0, 1000);
    if (typeof result.content === 'string') summary.content = result.content.slice(0, 1000);
    if (Array.isArray(result.files)) summary.files = result.files.slice(0, 20);
    if (Array.isArray(result.matches)) summary.matches = result.matches.slice(0, 20);
    return summary;
  }

  async getRuntimeConfig() {
    try {
      return await this.repl?.config?.load?.() || {};
    } catch {
      return {};
    }
  }

  async getRetryPolicy() {
    const cfg = await this.getRuntimeConfig();
    return {
      maxAttempts: cfg.reliability?.retryAttempts || 3,
      baseDelayMs: cfg.reliability?.retryBaseDelayMs || 100,
    };
  }

  async getMcpServerConfig(serverName) {
    const cfg = await this.getRuntimeConfig();
    return (cfg.mcp?.servers || []).find(server => server.name === serverName && server.enabled !== false) || null;
  }

  async getMcpClient(serverName) {
    if (this.mcpClients.has(serverName)) {
      return this.mcpClients.get(serverName);
    }

    const serverConfig = await this.getMcpServerConfig(serverName);
    if (!serverConfig) return null;

    const client = new MCPClient(serverConfig);
    this.mcpClients.set(serverName, client);
    return client;
  }

  async mcp(serverName, toolName, argumentsObject = {}) {
    if (typeof serverName !== 'string' || serverName.trim() === '') {
      return { success: false, error: 'server is required' };
    }
    if (typeof toolName !== 'string' || toolName.trim() === '') {
      return { success: false, error: 'tool is required' };
    }

    const allowed = await this.permissionManager.isMcpServerAllowed(serverName);
    if (!allowed) {
      return { success: false, error: `MCP server not allowlisted: ${serverName}` };
    }

    const client = await this.getMcpClient(serverName);
    if (!client) {
      return { success: false, error: `MCP server not configured: ${serverName}` };
    }

    const retryPolicy = await this.getRetryPolicy();
    try {
      const result = await withRetry(() => client.callTool(toolName, argumentsObject), retryPolicy);
      return { success: true, server: serverName, tool: toolName, result };
    } catch (error) {
      return { success: false, error: error.message, server: serverName, tool: toolName };
    }
  }

  normalizeToolName(toolName) {
    const raw = String(toolName || '').trim();
    const normalized = raw
      .replace(/^functions[._-]/i, '')
      .replace(/^tools?[._-]/i, '')
      .replace(/^winter[._-]/i, '')
      .replace(/^[\w-]+[.:/](?=[A-Za-z])/i, '')
      .replace(/[-_\s]/g, '')
      .toLowerCase();
    const aliases = {
      read: 'Read',
      readfile: 'Read',
      fileread: 'Read',
      openfile: 'Read',
      viewfile: 'Read',
      view: 'Read',
      cat: 'Read',
      getfile: 'Read',
      readfilecontent: 'Read',
      write: 'Write',
      writefile: 'Write',
      filewrite: 'Write',
      writetofile: 'Write',
      createfile: 'Write',
      savefile: 'Write',
      create: 'Write',
      overwritefile: 'Write',
      edit: 'Edit',
      editfile: 'Edit',
      fileedit: 'Edit',
      replaceinfile: 'Edit',
      strreplace: 'Edit',
      strreplaceeditor: 'Edit',
      strreplaceedit: 'Edit',
      applydiff: 'Edit',
      applypatch: 'Edit',
      patch: 'Edit',
      bash: 'Bash',
      shell: 'Bash',
      command: 'Bash',
      commandexecutor: 'Bash',
      executecommand: 'Bash',
      runterminalcmd: 'Bash',
      runterminalcommand: 'Bash',
      runcommand: 'Bash',
      runcmd: 'Bash',
      exec: 'Bash',
      terminal: 'Bash',
      powershell: 'Bash',
      cmd: 'Bash',
      glob: 'Glob',
      listfiles: 'Glob',
      list: 'Glob',
      ls: 'Glob',
      findfiles: 'Glob',
      find: 'Glob',
      grep: 'Grep',
      search: 'Grep',
      searchfiles: 'Grep',
      grepsearch: 'Grep',
      searchtext: 'Grep',
      searchcode: 'Grep',
      rg: 'Grep',
      rgfull: 'Grep',
      searchadvanced: 'Grep',
      advancedsearch: 'Grep',
      textsearch: 'Grep',
      findinfile: 'Grep',
      grepadvanced: 'Grep',
      grepfull: 'Grep',
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
      geturl: 'WebFetch',
      websearch: 'WebSearch',
      searchweb: 'WebSearch',
      internetsearch: 'WebSearch',
      googlesearch: 'WebSearch',
      browserdebug: 'BrowserDebug',
      browser: 'BrowserDebug',
      browserinspect: 'BrowserDebug',
      parallel: 'Parallel',
      parallelexecute: 'Parallel',
      paralleltools: 'Parallel',
      batch: 'Parallel',
      // New tools
      webarchive: 'WebArchive',
      webarchivetool: 'WebArchive',
      archive: 'WebArchive',
      wayback: 'WebArchive',
      htmleffectiveness: 'HtmlEffectiveness',
      htmlfx: 'HtmlEffectiveness',
      markdown2html: 'HtmlEffectiveness',
      compilehtml: 'HtmlEffectiveness',
      notebookread: 'NotebookRead',
      readnotebook: 'NotebookRead',
      notebookedit: 'NotebookEdit',
      editnotebook: 'NotebookEdit',
      todowrite: 'TodoWrite',
      writetodo: 'TodoWrite',
      createtodo: 'TodoWrite',
      todolist: 'TodoList',
      listtodos: 'TodoList',
      todos: 'TodoList',
      schedulewakeup: 'ScheduleWakeup',
      scheduler: 'ScheduleWakeup',
      wakeup: 'ScheduleWakeup',
      askuserquestion: 'AskUserQuestion',
      ask: 'AskUserQuestion',
      askquestion: 'AskUserQuestion',
      interactiveprompt: 'AskUserQuestion',
      inserttext: 'InsertText',
      insert: 'InsertText',
      insertinto: 'InsertText',
      strreplaceall: 'StrReplaceAll',
      replaceall: 'StrReplaceAll',
      batchreplace: 'StrReplaceAll',
      agent: 'Agent',
      subagent: 'Agent',
      agentrun: 'Agent',
    };
    return aliases[normalized] || raw;
  }

  normalizeToolInput(toolName, input) {
    if (input && typeof input === 'object' && !Array.isArray(input)) {
      return this.unwrapToolInput(input);
    }

    if (typeof input !== 'string') return {};
    const value = input.trim();
    if (!value) return {};

    switch (toolName) {
      case 'Read':
      case 'NotebookRead':
        return { file_path: value };
      case 'Write':
        return { content: value };
      case 'Bash':
        return { command: value };
      case 'Glob':
        return { pattern: value };
      case 'Grep':
      case 'WebSearch':
        return { query: value };
      case 'WebFetch':
      case 'WebArchive':
      case 'BrowserDebug':
        return { url: value };
      case 'TaskCreate':
      case 'TodoWrite':
        return { title: value };
      case 'ScheduleWakeup':
        return { prompt: value };
      case 'Agent':
        return { task: value };
      default:
        return { input: value };
    }
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
      if (error?.code === 'ENOENT') {
        const suggestions = await this.findNearbyPathSuggestions(filePath);
        return {
          success: false,
          error: `File not found: ${filePath}`,
          code: 'ENOENT',
          path: filePath,
          suggestions,
          recovery: [
            'Do not retry the same missing path.',
            'Use Glob or Grep to discover the real file path before reading again.',
            suggestions.length ? `Nearby candidates: ${suggestions.join(', ')}` : `Search from project root: ${this.projectPath}`,
          ].join(' '),
        };
      }
      return { success: false, error: error.message, code: error?.code, path: filePath };
    }
  }

  async findNearbyPathSuggestions(filePath, limit = 8) {
    if (!filePath) return [];
    const targetName = path.basename(filePath).toLowerCase();
    const targetStem = targetName.replace(/\.[^.]+$/, '');
    if (!targetName) return [];

    const candidates = [];
    const ignored = new Set(['node_modules', '.git', 'dist', 'build', '.winter', '.claude', 'VSCode-win32-x64', 'vscode-main']);
    const walk = async (dir, depth = 0) => {
      if (depth > 5 || candidates.length >= limit * 4) return;
      let entries = [];
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (ignored.has(entry.name)) continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath, depth + 1);
          continue;
        }
        const name = entry.name.toLowerCase();
        if (name === targetName || name.includes(targetStem) || targetStem.includes(name.replace(/\.[^.]+$/, ''))) {
          candidates.push(path.relative(this.projectPath, fullPath) || fullPath);
        }
      }
    };

    await walk(this.projectPath);
    return [...new Set(candidates)].slice(0, limit);
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
      const executedShell = process.platform === 'win32'
        ? (requestedShell === 'auto' ? this.detectWindowsShell(command) : requestedShell)
        : (process.env.SHELL || 'native');
      const { stdout, stderr } = process.platform === 'win32'
        ? await this.execWindowsCommand(command, cwd, timeout, requestedShell)
        : await execAsync(command, { cwd, timeout, shell: true, maxBuffer: 10 * 1024 * 1024 });
      return {
        success: true,
        stdout: stdout || '',
        stderr: stderr || '',
        exitCode: 0,
        shell: executedShell,
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

  async grep(pattern, searchPath, globPattern, outputMode = 'content', options = {}) {
    if (typeof pattern !== 'string' || pattern === '') {
      return { success: false, error: 'pattern is required', pattern, path: searchPath };
    }

    const caseInsensitive = options.case_insensitive || options.ignoreCase || false;
    const invertMatch = options.invert_match || options.invert || false;
    const contextBefore = options.context_lines ?? options.before_lines ?? 0;
    const contextAfter = options.context_lines ?? options.after_lines ?? 0;
    const maxResults = Math.max(1, options.max_results ?? options.maxResults ?? 50);
    const showLineNumbers = options.line_numbers ?? options.lineNumbers ?? true;
    const fixedString = options.fixed_string ?? options.fixedString ?? false;
    const multiline = options.multiline ?? false;

    try {
      const files = await this.findFiles(searchPath, globPattern || '**/*');
      const matches = [];
      const flags = ['g', caseInsensitive ? 'i' : '', multiline ? 'm' : ''].filter(Boolean).join('');

      for (const file of files) {
        if (matches.length >= maxResults) break;
        let content;
        try {
          content = await fs.readFile(file, 'utf8');
        } catch {
          continue;
        }

        // Build the search regex
        let searchRegex;
        try {
          if (fixedString) {
            const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            searchRegex = new RegExp(escaped, flags);
          } else {
            searchRegex = new RegExp(pattern, flags);
          }
        } catch {
          matches.push({ error: `Invalid regex pattern: ${pattern}` });
          break;
        }

        const lines = content.split(/\r?\n/);

        if (multiline) {
          // Multiline mode: search across the entire content at once
          const fullContent = content;
          let match;
          while ((match = searchRegex.exec(fullContent)) !== null) {
            if (matches.length >= maxResults) break;
            // Find line numbers for the match
            const textUpToMatch = fullContent.slice(0, match.index);
            const lineNumber = (textUpToMatch.match(/\n/g) || []).length + 1;
            const matched = match[0].replace(/\n/g, '\\n').substring(0, 200);
            matches.push(`${file}:${lineNumber}:${matched}`);
          }
        } else {
          for (let i = 0; i < lines.length && matches.length < maxResults; i++) {
            const line = lines[i];
            const isMatch = searchRegex.test(line);
            // Reset lastIndex for global regex
            searchRegex.lastIndex = 0;

            if (invertMatch ? !isMatch : isMatch) {
              let matchStr = '';

              // Add context lines before
              if (contextBefore > 0) {
                const start = Math.max(0, i - contextBefore);
                for (let ci = start; ci < i; ci++) {
                  matchStr += `${file}:${ci + 1}:${lines[ci]} (context before)\n`;
                }
              }

              // The matched line itself
              if (showLineNumbers) {
                matchStr += `${file}:${i + 1}:${line}`;
              } else {
                matchStr += line;
              }

              // Add context lines after
              if (contextAfter > 0) {
                const end = Math.min(lines.length, i + 1 + contextAfter);
                for (let ci = i + 1; ci < end; ci++) {
                  matchStr += `\n${file}:${ci + 1}:${lines[ci]} (context after)`;
                }
              }

              matches.push(matchStr);
            }
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
          // Handle multi-line context matches: extract file from first line
          const firstLine = String(match).split('\n')[0];
          const parsed = firstLine.match(/^(.+?):\d+:/);
          return parsed ? parsed[1] : firstLine;
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

  async parallelExecute(calls = [], context = {}) {
    if (!Array.isArray(calls) || calls.length === 0) {
      return { success: false, error: 'tools must be a non-empty array' };
    }

    const safeCalls = calls.slice(0, 8).map((call, index) => ({
      index,
      name: this.normalizeToolName(call?.name ?? call?.tool),
      input: call?.input ?? call?.arguments ?? call?.args ?? {},
    }));

    for (const call of safeCalls) {
      if (!call.name || typeof call.name !== 'string') {
        return {
          success: false,
          error: `Parallel tool call at index ${call.index} is missing name`,
          index: call.index,
        };
      }
      if (await this.permissionManager.shouldPromptForToolPermission?.(call.name)) {
        return {
          success: false,
          error: `Parallel cannot execute sensitive tool without an explicit direct grant: ${call.name}`,
          tool: call.name,
        };
      }
    }

    const results = await Promise.all(safeCalls.map(async call => {
      const result = await this.execute(call.name, call.input, context);
      return {
        index: call.index,
        tool: call.name,
        result,
      };
    }));

    return {
      success: results.every(item => item.result?.success !== false),
      parallel: true,
      results,
    };
  }

  async webFetch(url, prompt) {
    if (typeof url !== 'string' || url.trim() === '') {
      return { success: false, error: 'url is required' };
    }

    try {
      const retryPolicy = await this.getRetryPolicy();
      const response = await withRetry(() => fetch(url), retryPolicy);
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
        length: cleanText.length
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
      const retryPolicy = await this.getRetryPolicy();
      const response = await withRetry(() => fetch(url, {
        headers: {
          'User-Agent': 'WinterCLI/1.0',
        },
      }), retryPolicy);
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
      const retryPolicy = await this.getRetryPolicy();
      let puppeteer;
      try {
        puppeteer = (await import('puppeteer')).default;
      } catch (e) {
        return { success: false, error: 'Thư viện puppeteer chưa được cài đặt. AI HÃY TỰ DÙNG TOOL BASH ĐỂ CHẠY LỆNH: npm install puppeteer --no-save' };
      }

      const browser = await withRetry(() => puppeteer.launch({ headless: 'new' }), retryPolicy);
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

  async htmlEffectivenessCompile(input, cwd) {
    const inputPath = this.resolveInputPath(input.input_path ?? input.inputPath ?? input.input, cwd);
    const outputPath = this.resolveInputPath(input.output_path ?? input.outputPath ?? input.output, cwd);
    if (!inputPath || !outputPath) {
      return { success: false, error: 'input_path and output_path are required' };
    }

    const autoInstall = input.auto_install ?? input.autoInstall ?? true;
    const info = await this.htmlFxManager.info();
    if (!info.binaryReady) {
      if (!autoInstall) {
        return { success: false, error: 'html-effectiveness compiler is not installed. Run winter htmlfx install first.' };
      }
      await this.htmlFxManager.ensureInstalled({ update: false });
    }

    return await this.htmlFxManager.compile({ inputPath, outputPath });
  }
}
