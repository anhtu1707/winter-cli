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
