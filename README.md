# Winter -- Advanced AI Coding Assistant

> **Winter** is a powerful, AI-driven CLI coding assistant designed to supercharge your development workflow directly from the terminal. Inspired by Claude Code and Codex CLI, Winter brings a beautiful Cyberpunk aesthetic, smart session management, autonomous agent capabilities, and 25+ AI tools to your local environment.
>
> *Winter la mot tro ly lap trinh CLI manh me duoc dieu khien boi AI, giup tang toc quy trinh phat trien truc tiep tu terminal. Lay cam hung tu Claude Code va Codex CLI, Winter mang den giao dien Cyberpunk dep mat, quan ly phien lam viec thong minh, kha nang agent tu tri, va hon 25 cong cu AI.*

---

## Key Features

| Feature | Description |
|---|---|
| **26 AI Tools** | Read, Write, Edit, Bash, Glob, Grep, Notebook, Todo, Scheduler, Agent, MCP & more |
| **Multi-Provider** | Anthropic, OpenAI, Ollama, Groq -- with **smart context routing** |
| **26 Tools** | Full parity with Claude Code + extra tools (WebArchive, HtmlEffectiveness, Notebook, Todo, Scheduler, InsertText, StrReplaceAll) |
| **Context Router** | Auto-selects best provider per task (Claude for code, OpenAI for docs, Groq for speed, Ollama for privacy) |
| **Session Management** | Isolated sessions with persistent memory, plans, and context |
| **MCP Support** | Model Context Protocol -- connect VS Code, GitHub, databases & more |
| **Permission System** | Granular allowlist for tools, commands, and MCP servers |
| **Secret Management** | Auto-migrate API keys to `secrets.env` -- no keys in config files |
| **Refactoring** | AI-assisted refactors with test-backed verification and minimal behavior drift |
| **Skills System** | Strong skill workflows with `skill-creator`, hot-reloadable custom skills, and bundled guidance |
| **TypeScript Definitions** | Typed surface for core CLI helpers and skill metadata |
| **Plugin System** | Load local Claude Code / Codex plugins |
| **Design Integration** | Browse & apply design systems from awesome-design-md |
| **Auto-Healing** | TDD-style loop -- AI runs tests & fixes errors automatically |
| **Git Auto-Pilot** | Auto commit messages + AI code reviews |
| **Real-time Streaming** | SSE streaming for instant response display |
| **Task Scheduler** | Schedule wakeup calls for delayed operations |
| **Clipboard Integration** | `/paste` command reads clipboard directly |
| **Image Support** | Analyze images & screenshots via `/image` |
| **Cross-Platform** | Windows, macOS, Linux -- full shell support |

---

## Project Stats

| Metric | Value |
|---|---|
| **Total Lines of Code** | ~13,500 |
| **Source Files** | 40+ |
| **Tools** | **26** |
| **Tests** | **213** (all passing) |
| **Exported Symbols** | 78 |
| **AI Providers** | 4 (Anthropic, OpenAI, Ollama, Groq) |
| **Slash Commands** | 50+ |
| **Node.js** | >= 18.0.0 |

---

## Installation

### Global install via npm

```bash
npm install -g winter-super-cli@latest
```

### Run directly (no install)

```bash
git clone https://github.com/anhtu1707/winter.git
cd winter
node bin/winter.js
```

### Verify installation

```bash
winter --version
winter --help
```

---

## Quick Start

```bash
# Start REPL in current directory
winter

# Start with a specific session
winter --session mysession

# Run one-shot command
winter chat "refactor this function to use async/await"

# Call all providers
winter call "Analyze this code architecture"

# Non-interactive mode
winter chat "explain this" --no-interactive
```

---

## AI Providers

Winter supports **4 AI providers** with automatic context routing:

| Provider | Config Key | Default Model | Best For |
|---|---|---|---|
| **Anthropic** | `anthropic` | `claude-sonnet-4-20250514` | Code review, refactoring, debugging |
| **OpenAI** | `openai` | `gpt-4-turbo` | Documentation, explanations |
| **Ollama** (local) | `ollama` | `llama3` | Privacy, offline use |
| **Groq** | `groq` | `llama-3.1-70b-versatile` | Speed, quick tasks |

### Provider commands

```bash
# List all providers
winter providers

# Switch provider
winter provider ollama

# Set model for current provider
winter model gpt-4

# Set model for specific provider
winter model ollama llama3.1

# List all models
winter models
```

### Smart Context Routing

Winter automatically selects the best provider based on your task:

```javascript
// Code tasks -> Claude (or first available)
"Please review this refactor and fix the bug"

// Documentation tasks -> OpenAI
"Write a commit message for these changes"

// Speed tasks -> Groq
"Quickly list all files with TODO comments"

// Privacy tasks -> Ollama (local)
"Analyze this sensitive code locally"

// Explicit override
"@claude fix this security vulnerability"
```

---

## Configuration

Configuration is stored in `~/.winter/winter.json`.

### Default configuration

```json
{
  "defaultProvider": "ollama",
  "anthropic": {
    "apiKeyEnv": "ANTHROPIC_API_KEY",
    "model": "claude-sonnet-4-20250514"
  },
  "openai": {
    "apiKeyEnv": "OPENAI_API_KEY",
    "model": "gpt-4-turbo"
  },
  "ollama": {
    "baseURL": "http://localhost:11434",
    "model": "llama3"
  },
  "groq": {
    "apiKeyEnv": "GROQ_API_KEY",
    "model": "llama-3.1-70b-versatile"
  },
  "permissions": {
    "promptByDefault": true,
    "allowlist": {
      "tools": ["Read", "Glob", "Grep", "WebFetch", "WebSearch", "Parallel"],
      "commands": [],
      "mcpServers": []
    }
  },
  "mcp": {
    "servers": []
  },
  "sandbox": {
    "enabled": true,
    "allowedCommands": ["git", "npm", "node", "python", "code"]
  },
  "session": {
    "autoSave": true,
    "maxHistory": 500
  }
}
```

### Secret Management

API keys are **never stored in winter.json**. They are auto-migrated to `~/.winter/secrets.env`:

```bash
# Check config
winter config

# Migrate existing inline secrets to secrets.env
winter config migrate-secrets

# Backup config
winter config backup

# Restore from backup
winter config restore <backup-path>
```

Environment variables set in `secrets.env` are auto-loaded by `ConfigLoader`:

```
# ~/.winter/secrets.env
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-proj-...
GROQ_API_KEY=gsk-...
```

---

## 26 AI Tools

Winter provides **26 tools** -- fully compatible with Claude Code's tool interface + extras:

| # | Tool | Description |
|---|---|---|
| 1 | **Read** | Read files with line numbers |
| 2 | **Write** | Create new files |
| 3 | **Edit** | Surgical string replacement (search & replace) |
| 4 | **Bash** | Execute shell commands |
| 5 | **Glob** | Find files by pattern |
| 6 | **Grep** | Advanced regex search (context lines, case-insensitive, invert, multiline, max results) |
| 7 | **LSP** | Language Server Protocol integration |
| 8 | **TaskCreate** | Create background tasks |
| 9 | **TaskUpdate** | Update task status |
| 10 | **TaskList** | List all tasks |
| 11 | **MCP** | Model Context Protocol tool calls |
| 12 | **Parallel** | Execute multiple tools in parallel |
| 13 | **NotebookRead** | Read Jupyter notebook cells |
| 14 | **NotebookEdit** | Edit Jupyter notebook cells |
| 15 | **TodoWrite** | Write todo items to a file |
| 16 | **TodoList** | List todo items |
| 17 | **ScheduleWakeup** | Schedule delayed operations |
| 18 | **AskUserQuestion** | Ask the user a question (text/select/multiselect) |
| 19 | **Agent** | Deploy a sub-agent for complex tasks |
| 20 | **InsertText** | Insert text at specific positions (line, after, before, beginning, end) |
| 21 | **StrReplaceAll** | Batch string replace across files |
| 22 | **BrowserDebug** | Browser automation & debugging |
| 23 | **WebFetch** | Fetch web page content |
| 24 | **WebSearch** | Search the web |
| 25 | **WebArchive** | Archive & retrieve web pages (Wayback Machine + local cache) |
| 26 | **HtmlEffectiveness** | Compile hybrid Markdown + YAML components into self-contained HTML |

### Advanced Grep Features

Grep tool supports:

- **Regex patterns** -- actual `RegExp`, not substring matching
- **Case insensitive** -- `case_insensitive: true`
- **Invert match** -- `invert_match: true`
- **Fixed string** -- `fixed_string: true` (escape regex chars)
- **Context lines** -- `context_lines`, `before_lines`, `after_lines`
- **Max results** -- configurable limit (default 50, max 500)
- **Line numbers** -- toggle `line_numbers: true/false`
- **Multiline** -- `multiline: true` search across lines
- **Output modes** -- `content`, `files_with_matches`, `count`

---

## Slash Commands

### Project & Session

| Command | Description |
|---|---|
| `/project` | Show/set current project |
| `/pwd` | Show current directory |
| `/cd <path>` | Change directory |
| `/session` | Show current session ID |
| `/sessions` | List all sessions |
| `/clear` | Clear screen |

### Memory & Plans

| Command | Description |
|---|---|
| `/remember <text>` | Store in memory |
| `/memories` | Show stored memories |
| `/forget [pattern]` | Clear memories |
| `/compress` | Compress conversation context |
| `/plan` | Create/view plans |
| `/plans` | List active plans |
| `/task <desc>` | Create task |
| `/tasks` | List tasks |

### Git & Automation

| Command | Description |
|---|---|
| `/commit` | Auto-generate commit message & commit |
| `/review` | AI code review on current diff |
| `/diff` | Preview git diff |
| `/watch <cmd>` | Watch files & run command |
| `/stats` | Tool usage statistics |
| `/replay [n]` | Replay tool events |
| `/swe <task>` | Run SWE-agent workflow |
| `/auto <task>` | Auto-healing mode (TDD loop) |
| `/autopilot <task>` | Autonomous analyze/fix/verify workflow |
| `/autopilot <task> --max-loops <n> --verify "cmd1;cmd2"` | Configure retry loops and explicit verification commands |

### Tool Shortcuts

| Command | Description |
|---|---|
| `/read <file>` | Quick file read |
| `/write <file>` | Quick file write (via editor) |
| `/edit <file>` | Quick file edit |
| `/bash <cmd>` | Quick command execution |
| `/glob <pattern>` | Quick file search |
| `/grep <pattern>` | Quick text search |
| `/image <file>` | Analyze image/screenshot |
| `/paste` | Paste clipboard content |

### Resources & Design

| Command | Description |
|---|---|
| `/codex` | Browse ~/.codex resources |
| `/claude` | Browse ~/.claude resources |
| `/karpathy` | Browse karpathy-tools |
| `/agents` | Read ~/agents.md |
| `/resources` | Show bundled resources |
| `/htmlfx` | Manage html-effectiveness integration (install/list/compile) |
| `/design search <brand>` | Search design systems |
| `/design add <brand>` | Add design system |
| `/design list` | List design systems |
| `/design preview <brand>` | Preview design system |
| `/skill list` | List skills |
| `/skill enable <name>` | Enable a skill |
| `/skill create <name>` | Create a custom skill |
| `/plugin list` | List plugins |
| `/plugin install <url>` | Install a plugin |

### Provider & Config

| Command | Description |
|---|---|
| `/provider [name]` | Show/switch provider |
| `/providers` | List all providers |
| `/model [id]` | Show/set model |
| `/models` | List models |
| `/config` | Show configuration |
| `/mcp list` | List MCP servers |
| `/mcp add <name> <cmd>` | Add MCP server |
| `/mcp remove <name>` | Remove MCP server |
| `/permissions list` | List permission allowlist |
| `/permissions allow <kind> <value>` | Allow tool/command/mcp |

### Help & Exit

| Command | Description |
|---|---|
| `/help` or `/?` | Show help |
| `/exit` or `/quit` | Exit Winter |

---

## MCP Integration

Winter supports the **Model Context Protocol** for connecting to external tools and services.

### MCP CLI Commands

```bash
# List configured MCP servers
winter mcp list

# Add an MCP server
winter mcp add my-server node ./path/to/server.js

# Remove an MCP server
winter mcp remove my-server

# Allow an MCP server (permissions)
winter mcp allow my-server
```

### MCP Permission Management

```bash
# List all permissions
winter permissions list

# Allow a tool
winter permissions allow tool Bash

# Allow a command
winter permissions allow command git

# Allow an MCP server
winter permissions allow mcp my-server

# Toggle prompt-before-execute mode
winter permissions prompt off
```

### Dynamic Tool Routing

Tools with the `mcp__` prefix are automatically routed to the appropriate MCP server:

```
mcp__vscode__openFile  ->  VS Code extension server
mcp__github__createPR  ->  GitHub integration server
mcp__db__query         ->  Database server
```

---

## Session Management

Winter provides persistent session management with memory and context.

```bash
# CLI commands
winter session new       # Create new session
winter session save      # Save current session
winter session list      # List all sessions

# In REPL
/session                 # Show session ID
/sessions                # List all sessions
/remember <text>         # Store in memory
/memories                # Show memories
/forget [pattern]        # Clear memory
/compress                # Compress context
```

### Three-Tier Memory System

| Level | Scope | Purpose |
|---|---|---|
| **Working Memory** | Current session | Task context, conversation history |
| **Project Memory** | Project-wide | Project-specific learnings & rules |
| **Long-term Memory** | Cross-project | Reusable patterns & knowledge |

---

## Skills System

Winter supports hot-reloadable skills for specialized tasks.

### Built-in Skills

| Skill | Description |
|---|---|
| `coding` | Code analysis, generation, review |
| `design` | Design system integration |
| `debug` | Debugging assistance |
| `refactor` | Code refactoring |
| `test` | Test generation |
| `skill-creator` | Create & modify custom skills |

### Custom Skills

```bash
# Create a new skill
winter skill create my-skill
# -> creates ~/.winter/skills/my-skill.md

# List all skills
winter skill list

# Enable a skill
/skill enable my-skill
```

---

## Plugin System

Load plugins from Claude Code and Codex CLI:

```bash
winter plugin list                     # List plugins
winter plugin install <url>            # Install plugin
winter plugin remove <name>            # Remove plugin
```

---

## Architecture

```
winter/
|- bin/
|   - winter.js              # Entry point
|- src/
|   |- agent/
|   |   - swe-agent.js       # SWE-agent integration
|   |- ai/
|   |   - providers.js       # AI provider management + streaming
|   |- cache/
|   |   - system.js          # Caching layer
|   |- cli/
|   |   - commands.js        # CLI command parser (50+ commands)
|   |   - config.js          # Config loader + secret management
|   |   - conversation-format.js  # Utility functions
|   |   - markdown-format.js # Markdown rendering
|   |   - prompt-builder.js  # System prompt assembly
|   |   - repl-commands.js   # Slash command handlers (extracted)
|   |   - repl.js            # Interactive REPL loop
|   |   - secret-env.js      # Env file loader + redaction
|   |   - slash-commands.js  # Command definitions
|   |   - snowflake-logo.js  # Cyberpunk UI branding
|   |   - spinner.js         # Terminal spinner
|   |   - terminal-ui.js     # Terminal rendering utilities
|   |- context/
|   |   - compress.js        # Conversation compression
|   |   - router.js          # Smart provider routing
|   |- design/
|   |   - commands.js        # Design system commands
|   |- mcp/
|   |   - client.js          # MCP client
|   |   - protocol.js        # MCP protocol implementation
|   |- plugins/
|   |   - manager.js         # Plugin manager
|   |- session/
|   |   - manager.js         # Session manager
|   |- skills/
|   |   - manager.js         # Skills manager
|   - tools/
|       - executor.js        # Tool executor (25 tools)
|       - notebook.js        # Jupyter notebook tools
|       - todo.js            # Todo tools
|       - scheduler.js       # Schedule wakeup tool
|       - interactive.js     # Ask user tool
|       - agent.js           # Sub-agent tool
|       - insert-text.js     # Insert text tool
|       - str-replace-all.js # Batch replace tool
|       - web-archive.js     # Web archive tool
|       - permission.js      # Permission manager
|       - analytics.js       # Tool usage tracking
|       - retry.js           # Retry utility
|- README.md
|- WINTER.md                  # Project rules for AI
|- package.json
```

---

## Core Philosophy

Winter operates on three core principles:

### 1. Think Before Coding
*Nghi truoc khi code*

- State assumptions explicitly. If uncertain, ask.
- Surface tradeoffs and alternatives -- don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.

### 2. Simplicity First
*Don gian la tren het*

- Minimum code that solves the problem. Nothing speculative.
- No features beyond what was asked.
- No abstractions for single-use code.
- No error handling for impossible scenarios.

### 3. Surgical Changes
*Sua doi chinh xac*

- Touch only what you must. Clean up only your own mess.
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.

---

## Streaming & Real-time

Winter supports **real-time SSE streaming** for instant response display:

```
User input -> REPL -> collectAssistantStream()
-> providers.streamRequest() -> streamRequestToProvider()
-> Fetch POST /chat/completions (stream: true)
-> Parse SSE data: events
-> Each chunk.content -> process.stdout.write immediately
-> Fallback to sendRequest() if stream fails
```

---

## Cross-Platform Support

| Platform | Shell Support | Status |
|---|---|---|
| **Windows** | cmd, PowerShell, Git Bash | Full support |
| **macOS** | zsh, bash | Full support |
| **Linux** | bash, sh, zsh | Full support |

Winter auto-detects your platform and shell:
- On Windows: uses `cmd` or `powershell` as appropriate
- On macOS/Linux: uses native POSIX shell

---

## Testing

```bash
# Run all tests (213)
npm test

# Run specific test file
node --test src/tools/executor.test.js

# Run tests with watch mode
node --test --watch src/**/*.test.js
```

---

## License

MIT License -- see [LICENSE](LICENSE) for details.

---

## Author

**Atus** -- fb: iam.anhtu | github: [anhtu1707](https://github.com/anhtu1707)

---

*Built with care -- Winter is the AI assistant that never sleeps.*
