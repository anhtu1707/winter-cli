# Hermes Agent Core

Use when a task involves Winter core behavior, agent loops, tools, skills, memory, subagents, TUI, gateways, scheduled automation, or making small models act more capable.

## Operating Rules

- Apply Hermes-style closed learning loops: after difficult work, identify reusable procedures and failure modes.
- Prefer skill lifecycle thinking: create, update, or recommend a skill when a workflow repeats.
- Use session search/compression patterns: preserve high-signal decisions and verification evidence, not long transcripts.
- Delegate independent workstreams through subagents or parallel tools when the task can be split safely.
- Treat MCP/tools as a gateway: allowlist, diagnose, timeout, retry carefully, and require concrete tool-result evidence.
- For UI/TUI work, keep rendering, command registry, tool progress, interrupts, model state, and session state as explicit separable surfaces.
- For scheduled/background tasks, define trigger, injected context, verification command, delivery path, and failure handling.

## Local Reference

Read `resources/local/hermes-agent-core/AGENTS.md` and the matching `resources/local/hermes-agent-core/skills/**/SKILL.md` file before changing non-trivial Winter agent/core behavior.
