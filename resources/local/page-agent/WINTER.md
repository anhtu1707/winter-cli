# Page Agent — Winter Integration Guide

This file tells Winter how to use Alibaba's Page Agent library for browser automation and GUI agent tasks.

## Overview

Page Agent is an in-page JavaScript library that controls web interfaces using natural language. It uses **text-based DOM manipulation** — no screenshots, no multi-modal LLMs, no browser extensions required (though a Chrome extension is available for multi-page tasks).

## When to Use Page Agent

- **SaaS AI Copilot**: Ship an AI copilot in your product in lines of code
- **Smart Form Filling**: Turn 20-click workflows into one sentence (ERP, CRM, admin systems)
- **Accessibility**: Make any web app accessible through natural language / voice commands
- **Multi-page Agent**: Extend agent reach across browser tabs (via Chrome extension)
- **MCP Server**: Control the browser from external agent clients

## Architecture

```
packages/
├── core/                    @page-agent/core — Core agent logic (headless)
├── page-agent/              page-agent — Main entry class (with UI + controller + demo builds)
├── llms/                    @page-agent/llms — LLM client with reflection-before-action
├── page-controller/         @page-agent/page-controller — DOM operations + visual feedback
├── ui/                      @page-agent/ui — Panel and i18n
├── mcp/                     @page-agent/mcp — MCP Server
├── extension/               Chrome extension (WXT + React)
└── website/                 Docs and landing page
```

## How to Use

### Installation
```bash
npm install page-agent
```

### Basic Usage
```javascript
import { PageAgent } from 'page-agent'

const agent = new PageAgent({
    model: 'qwen3.5-plus',         // Or any OpenAI-compatible LLM
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKey: 'YOUR_API_KEY',
    language: 'en-US',
})

await agent.execute('Click the login button')
```

### DOM Pipeline
1. **DOM Extraction**: Live DOM → `FlatDomTree` via `page-controller/src/dom/dom_tree/`
2. **Dehydration**: DOM tree → simplified text for LLM
3. **LLM Processing**: AI returns action plans
4. **Indexed Operations**: PageAgent calls PageController by element index

### Key Concepts
- **PageAgentCore** (`packages/core/src/PageAgentCore.ts`): Headless core agent
- **PageController** (`packages/page-controller/src/PageController.ts`): DOM operations with optional visual feedback mask
- **PageAgent** (`packages/page-agent/src/PageAgent.ts`): Main class with built-in UI Panel

## MCP Server (Beta)

Page Agent includes an MCP server that allows external agent clients to control the browser:

```bash
# Start the MCP server
node packages/mcp/dist/index.js
```

Then connect from any MCP-compatible client (including Winter's built-in MCP client).

## Environment Detection

Winter should enable page-agent knowledge when the task involves:
- Browser automation / web UI testing
- Form filling in web applications
- AI copilot for SaaS products
- Accessibility improvements for web apps
- Multi-page browser tasks
- DOM manipulation / web scraping

## Key Files

| File | Purpose |
|------|---------|
| `packages/page-agent/src/PageAgent.ts` | Main PageAgent class with UI |
| `packages/core/src/PageAgentCore.ts` | Core agent logic (headless) |
| `packages/core/src/prompts/system_prompt.md` | System prompt template for the LLM |
| `packages/core/src/tools/index.ts` | Tool definitions |
| `packages/page-controller/src/PageController.ts` | DOM operations controller |
| `packages/page-controller/src/actions.ts` | Element interactions (click, input, scroll) |
| `packages/page-controller/src/dom/dom_tree/` | DOM extraction engine |
| `packages/llms/src/index.ts` | LLM client with retry logic |
| `packages/mcp/README.md` | MCP server documentation |
| `AGENTS.md` | Full project architecture (monorepo) |

## License

MIT
