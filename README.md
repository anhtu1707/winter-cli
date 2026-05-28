# Winter

> **Winter** is an AI-powered CLI for coding, debugging, refactoring, and multi-provider model orchestration.
>
> Built for local development workflows, Winter combines a fast terminal UX, session memory, slash commands, tool execution, provider routing, and a growing set of automation features.

## Highlights

- **Multi-provider AI** with support for OpenAI-compatible, Anthropic, and Gemini-style APIs
- **Universal provider abstraction** for custom gateways and named presets like Qwen, Kimi, MiniMax, DeepSeek, OpenRouter, Groq, Ollama, Mistral, Fireworks, SiliconFlow, Zhipu, Baichuan, and more
- **Custom provider support** with `apiFormat: openai | anthropic | gemini`
- **Streaming + tool use** through a normalized provider adapter layer
- **Session memory, plans, tasks, and history** for long-running coding work
- **Rich slash-command workflow** for provider switching, search, debugging, design systems, skills, MCP, and automation
- **Local resource packs** for design systems, agent docs, Karpathy tools, Claude/Codex references, and ECC knowledge browsing

## Quick Start

### Install

```bash
npm install -g winter-super-cli
```

### Run

```bash
winter
```

### Verify

```bash
winter --help
winter --version
```

## What Winter Does

Winter is designed to help you move through the full coding loop:

1. inspect the codebase
2. plan the change
3. edit surgically
4. verify with tests or syntax checks
5. repeat until the result is solid

It is especially useful for:

- debugging runtime issues
- refactoring existing code
- generating and applying patches
- switching between AI providers
- inspecting large local contexts
- working with tools, sessions, and background tasks

## Agent Runtime Guarantees

Winter is not a prompt-only wrapper. The REPL runtime enforces several behavior gates before an assistant answer is allowed through:

- **Tool evidence guard:** action requests must use real tools before claiming progress.
- **Fake completion guard:** claims such as "fixed", "created", "opened", or "checked" are blocked when no matching tool result exists.
- **Verification before final answer:** after mutating work such as `Edit`, `Write`, or replacement tools, Winter runs inferred verification commands before the final response when the task implies tests/build/lint/debugging.
- **Repair loop:** failed verification output is sent back into the agent loop so the model debugs the first hard failure instead of pretending the work is complete.
- **Provider-agnostic tool calls:** native tool calls, legacy function calls, XML fallback calls, JSON fallback calls, and `CALL_TOOL` text calls are normalized into the same executor path.
- **Real subagents:** `Agent` and `DelegateTask` run separate message contexts with role-scoped tools, child-process isolation in live REPL runs, timeout/error isolation, result passing, changed-file summaries, and `ParallelAgent` aggregation for independent subtasks.

## Debug Workflow

Use `/debug` or `/auto` when you want Winter to run the inspect -> patch -> verify loop with stronger constraints:

```text
/debug failing npm test
/auto fix provider timeout --verify "npm test;npm run pack:audit"
```

For browser-visible issues, configure Chrome DevTools MCP and ask Winter to inspect the live page. Winter prefers visible Chrome MCP tools for click/fill/screenshot/console/network work and uses headless browser debugging only as a fallback.

```text
/mcp preset chrome-devtools --isolated
/mcp tools chrome-devtools
```

## Multimodal Input

Winter supports direct clipboard image paste in the interactive input controller. Press `Ctrl+V` while the REPL is focused to attach a clipboard image to the next message. Screenshots are treated as primary evidence for UI, browser, and visual debugging tasks.

## Provider Support

Winter supports a flexible provider model:

- **OpenAI-compatible APIs**
- **Anthropic native API**
- **Google Gemini native API**
- **Custom local or remote gateways**
- **Preset providers** with automatic base URL / model defaults

### Example: custom OpenAI-compatible provider

```json
{
  "custom": {
    "baseURL": "http://localhost:4000/v1",
    "apiKey": "your-key",
    "model": "gpt-4o-mini"
  }
}
```

### Example: custom Anthropic provider

```json
{
  "custom": {
    "apiFormat": "anthropic",
    "apiKey": "your-anthropic-key",
    "model": "claude-3-5-sonnet-latest"
  }
}
```

### Example: custom Gemini provider

```json
{
  "custom": {
    "apiFormat": "gemini",
    "apiKey": "your-gemini-key",
    "model": "gemini-1.5-pro"
  }
}
```

### Example: preset provider

```json
{
  "qwen": {
    "apiKey": "your-dashscope-key"
  },
  "kimi": {
    "apiKey": "your-moonshot-key"
  },
  "minimax": {
    "apiKey": "your-minimax-key"
  }
}
```

## Key Commands

### Provider commands

```bash
winter providers
winter provider <name>
winter model <model-id>
winter models
winter config
```

Inside the REPL, use the slash forms:

```text
/providers
/provider custom
/model qwen3-coder-plus
```

### Project workflow

```bash
winter
winter /context "analyze this refactor"
winter /doctor full
winter /scorecard
```

### Useful slash commands

- `/providers` — list configured providers
- `/provider` — switch provider
- `/model` — set active model
- `/context` — inspect model context
- `/doctor` — diagnose provider/model/tool calls
- `/design` — browse and apply design systems
- `/skill` — manage skills
- `/mcp` — manage MCP servers
- `/auto` — run test/fix loop
- `/ensemble` — run providers in parallel
- `/vote` — compare model outputs

## Configuration

Winter reads config from the user profile directory. Typical settings include:

- default provider
- provider entries
- permissions
- session behavior
- MCP servers
- sandbox / allowlist options

### Chrome DevTools MCP

Winter has a built-in preset for ChromeDevTools/chrome-devtools-mcp:

```bash
winter mcp preset chrome-devtools --isolated
winter mcp tools chrome-devtools
```

In the REPL, use the same flow with slash commands:

```text
/mcp preset chrome-devtools --isolated
/mcp tools chrome-devtools
```

The preset registers the `chrome-devtools` MCP server, allowlists it, and gives Winter runtime hints to use its page navigation, click, fill, snapshot, screenshot, console, network, and performance tools for live browser debugging. Omit `--headless` when you want to watch Winter operate Chrome in a normal visible window.
It requires Node.js 22.12+ and a current Chrome installation, matching the upstream MCP package requirements.

### Browser control tools

Winter exposes three browser paths:

- `OpenBrowser` opens Chrome/default browser visibly for the user.
- `VisibleBrowser` launches a real visible Chrome/Chromium session with Puppeteer and can navigate, click, type, evaluate JavaScript, snapshot DOM, and capture screenshots.
- `BrowserDebug` runs headless Puppeteer for console/network/DOM diagnostics when visible control is not needed.

For live page interaction, Winter should prefer `chrome-devtools` MCP when configured, then `VisibleBrowser`, then `BrowserDebug` as the headless fallback.

### Minimal example

```json
{
  "defaultProvider": "custom",
  "custom": {
    "apiFormat": "openai",
    "baseURL": "http://localhost:4000/v1",
    "apiKey": "your-key",
    "model": "gpt-4o-mini"
  }
}
```

## Documentation

- [Provider abstraction guide](docs/provider-abstraction.md)
- [Project architecture](docs/architecture.md)
- [Slash commands](src/cli/slash-commands.js)

## Development

```bash
npm install
npm test
```

### Useful scripts

```bash
npm run test
npm run prepublish:gate
npm run pack:audit
npm run smoke:package
```

## Quality Gates

Winter ships with Node's built-in test runner and package-audit checks:

```bash
npm test
npm run pack:audit
```

The capability scorecard is available from the CLI:

```bash
winter /scorecard
```

Tracked areas include agent loop, tool reliability, codebase intelligence, memory compression, subagents, terminal UX, provider routing, debug workflow, and ecosystem resources.

## Repository Structure

```text
src/
  ai/          provider manager, adapters, prompts, reasoning
  cli/         REPL, slash commands, session UI
  context/     routing, resource loading, compression
  tools/       file, shell, browser, agent, and utility tools
resources/local/
  design-md/   local design system corpus
  agents.md/   agent workflow docs
  karpathy-tools/
  page-agent/
```

## License

MIT

## Author

**Atus** — [github.com/anhtu1707](https://github.com/anhtu1707) - **Atus** — [facebook.com/iam.anhtu](https://facebook.com/iam.anhtu)
