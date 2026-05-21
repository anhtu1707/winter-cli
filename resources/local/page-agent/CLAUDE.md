# Page Agent - Instructions for Winter CLI

This file provides quick reference for Winter when working with Page Agent.

## Quick Start

```bash
# Browse docs
winter page-agent docs

# Search for topics
winter page-agent search "DOM manipulation"

# Read specific doc
winter page-agent read README
```

## What is Page Agent?

- **In-page JavaScript library** for browser automation via natural language
- **No browser extension needed** - works via script injection
- **Bring your own LLM** - supports OpenAI-compatible APIs
- **Text-based DOM manipulation** - no screenshots required

## Packages

| Package | Description |
|---------|-------------|
| `page-agent` | Main entry with UI Panel |
| `@page-agent/core` | Headless agent (npm) |
| `@page-agent/llms` | LLM client with reflection-before-action |
| `@page-agent/page-controller` | DOM operations |
| `@page-agent/ui` | Panel and i18n |

## Key Commands for Winter

- `/page-agent` - Browse bundled resources
- `/browse <url>` - Fetch web page content
- `/fill` - Smart form filling (future)

## Architecture

1. **DOM Extraction**: Live DOM → simplified text
2. **LLM Processing**: AI returns action plans
3. **Execution**: PageAgent calls PageController by element index

## Integration with Winter

Page Agent is automatically suggested when:
- Task mentions "browser", "automation", "crawl", "scrape"
- Task mentions "form fill", "e2e", "playwright", "selenium"

See `WINTER.md` for detailed integration guide.