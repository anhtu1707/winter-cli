# Architecture

This document gives a high-level map of Winter for contributors and GitHub readers.

## Runtime Flow

```text
bin/winter.js
  -> CLI / REPL
  -> AIProviderManager
  -> provider adapter
  -> tool executor / provider HTTP call
  -> normalized response or stream chunks
```

## Major Areas

### `src/ai/`

AI orchestration lives here.

Important files:

- `providers.js` — provider manager, routing, request execution, streaming, tool-chat loop
- `provider-adapters.js` — universal provider request/response/stream adapters
- `model-capabilities.js` — model tier and capability classification
- `reasoning.js` — reasoning level and complexity helpers
- `prompts/` — system prompts, task classification, success criteria

### `src/cli/`

Interactive terminal experience.

Important files:

- `repl.js` — interactive REPL loop
- `slash-commands.js` — command registry
- `config.js` — config loading and redaction helpers
- `terminal-ui.js` — terminal rendering helpers

### `src/tools/`

Tool execution surface.

Examples:

- file reading/writing/editing
- shell command execution
- glob/grep search
- browser debugging
- web fetch/search/archive
- notebook editing
- scheduler and task tools
- sub-agent execution

### `src/context/`

Context assembly and routing.

Examples:

- selecting execution profile
- loading relevant local resources
- compressing conversation history

### `resources/local/`

Bundled local resources used to improve AI behavior and documentation quality.

Examples:

- Karpathy coding principles
- agent workflow references
- page-agent docs
- design system corpus
- embedded context corpus

## Provider Abstraction Boundary

`AIProviderManager` does not hand-build every native provider request. It delegates to:

- `buildProviderRequest()`
- `normalizeProviderResponse()`
- `normalizeProviderStreamChunk()`
- `getProviderPreset()`

This keeps provider-specific details out of the main manager.

See [Provider Abstraction](provider-abstraction.md) for details.

## Testing

Winter uses Node's built-in test runner.

```bash
npm test
```

For provider work, start with:

```bash
node --test src/ai/providers.test.js
```

For syntax-only verification:

```bash
node --check src/ai/providers.js
node --check src/ai/provider-adapters.js
```

## Contribution Guidelines

Keep changes small and verifiable:

1. inspect the runtime path before editing
2. make the narrowest change that solves the issue
3. add or update tests close to the changed behavior
4. run the nearest verification command
5. avoid dependency changes unless required

## Release Checklist

Before publishing or pushing a release branch:

```bash
npm test
npm run prepublish:gate
npm run pack:audit
npm run smoke:package
```

If a command is platform-specific or unavailable, document the reason in the PR or release notes.
