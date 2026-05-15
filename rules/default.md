# ❄️ WINTER RULES
# Coding and development guidelines

## Security Rules

### Command Allowlisting
- Allowed commands: `git`, `npm`, `node`, `python`, `code`, `pnpm`, `yarn`, `bun`
- Blocked: Dangerous commands like `rm -rf`, `format`, `del /f /s`
- Always check command safety before execution

### Path Restrictions
- Blocked paths: Secrets directories, system directories
- Allowed: Project directories, temp directories

## Coding Principles

### Think Before Coding
- State assumptions explicitly
- Ask clarifying questions when unclear
- Present tradeoffs if multiple approaches exist

### Simplicity First
- Minimum code that solves the problem
- No speculative features
- If 200 lines could be 50, rewrite it

### Surgical Changes
- Touch only what you must
- Match existing code style
- Clean up only your own mess

## Resource Usage

### Local Resources
AI có quyền truy cập và tự động sử dụng các tài nguyên cục bộ khi cần thiết để giải quyết tác vụ:
- **Claude Resources**: `resources/local/claude`
- **Codex Resources**: `resources/local/codex`

Khi người dùng yêu cầu các tính năng nâng cao, phân tích hệ thống hoặc cần tham khảo các kỹ năng (skills) mẫu, AI nên chủ động tìm kiếm và đọc nội dung trong các thư mục này.

## Goal-Driven Execution
- Define success criteria
- Write tests to verify
- Loop until verified

## Session Management

### Session Commands
- `/session new` - Create new session
- `/session save` - Save current session
- `/session list` - List sessions
- `/remember <text>` - Add to memory

### Memory Types
- Working Memory - Current task context
- Project Memory - Project-specific knowledge
- Long-term Memory - Cross-project learnings

## Project Detection

### Auto-detect Project
Check for these files in order:
1. `CLAUDE.md` - Main project guidelines
2. `WINTER.md` - Winter-specific guidelines
3. `.claude/CLAUDE.md` - Claude Code guidelines
4. `AGENTS.md` - Agent guidelines
5. `package.json` - Node.js project
6. `pyproject.toml` - Python project
7. `Cargo.toml` - Rust project

## Tool Usage

### When to Call Tools
- **Read**: When asked about code, need to understand structure
- **Write**: When creating new files
- **Edit**: When modifying existing files (surgical)
- **Bash**: When running commands, scripts, git operations
- **Glob**: When finding files by pattern
- **Grep**: When searching code content

### Tool Guidelines
- Call tools proactively - don't just describe, DO
- Prefer Read over describing code
- Use Edit for small changes, Write for new files
- Verify changes after execution

## Design Integration

### Design Systems
- Integrate with awesome-design-md
- `winter design search <brand>` - Search brands
- `winter design add <brand>` - Add design file
- `winter design preview <brand>` - Preview design

## Performance

### Optimization
- Use small/fast model for simple tasks
- Cache responses when appropriate
- Batch similar operations

## Error Handling

### Error Recovery
- Log errors clearly
- Suggest fixes
- Retry with different approach if needed
