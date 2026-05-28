# Changelog

All notable changes to Winter CLI will be documented in this file.

## [Unreleased]

### Added
- Added Hermes core resource packaging and prompt integration for self-improving agent loops, skills, memory/search, subagents, TUI separation, tool gateways, and automation thinking.
- Added GSAP skills resource packaging for animation and UI motion workflows.
- Added runtime auto-verification before final answers after mutating tool calls.
- Added unit coverage for `design/`, `integrations/`, `plugins/`, and `cache/` modules.
- Added stronger README documentation for debug workflow, provider switching, image paste, quality gates, and scorecard usage.
- Added an auto-loaded resource application profile so Winter applies bundled rules, skills, memories, and local resources from page-agent, karpathy-tools, Hermes, GSAP, ECC, Codex, Claude, awesome-design-md, and agents.md by default.
- Added `VisibleBrowser`, a visible Puppeteer browser-control tool for real navigation, click, type, evaluate, snapshot, and screenshot workflows when chrome-devtools MCP is unavailable.
- Added real subagent execution for `Agent`, `DelegateTask`, and `ParallelAgent` with isolated messages, scoped tools, timeout/error isolation, changed-file summaries, and parent result passing.
- Added child-process isolation for live subagent runs and behavior-based capability scorecard probes instead of file-existence-only checks.
- Added scrolling slash command menu selection so Up/Down keeps long `/` command lists visible.

### Changed
- Reworked TUI dashboard around model state, agent core status, command discovery, tool progress, and recent context.
- Updated capability scorecard probes to detect source-backed provider switching, image paste, debug workflow, browser debugging, and verification support even outside a live REPL instance.
- Strengthened small-model coding contracts so weak models are forced through inspect, tool, verify, and repair loops.

### Fixed
- Prevented streamed pseudo-progress text from being printed as if browser or file checks had actually run.
- Improved MCP timeout recovery by resetting the cached client and returning targeted recovery guidance.

## [2026.5.26] - 2026-05-16

### Changed
- Added GitHub Actions CI workflow to run the test suite on Node.js 18 and 20.
- Tightened the Bash security blocklist so PowerShell `-Format` arguments are no longer blocked.
- Added a regression test for PowerShell `Get-Date -Format` usage.

### Added
- `CHANGELOG.md` for release tracking.
