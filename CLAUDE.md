# ❄️ WINTER CLAUDE.md

Behavioral guidelines for Winter CLI. These principles should be followed in every interaction.

## The Four Principles

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked
- No abstractions for single-use code
- No "flexibility" or "configurability" that wasn't requested
- No error handling for impossible scenarios
- If you write 200 lines and it could be 50, rewrite it

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting
- Don't refactor things that aren't broken
- Match existing style, even if you'd do it differently
- If you notice unrelated dead code, mention it — don't delete it

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused
- Don't remove pre-existing dead code unless asked

**The test:** Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

## Session Management

### Session Commands
- `/session new` - Create new session
- `/session save` - Save current session
- `/session list` - List sessions
- `/remember <text>` - Add to memory

### Memory System
- Working Memory - Current task context
- Project Memory - Project-specific knowledge
- Long-term Memory - Cross-project learnings

## AI Provider Integration

### Supported Providers
- **Anthropic** - claude-3-5-sonnet, claude-3-opus (default)
- **OpenAI** - gpt-4, gpt-4-turbo, gpt-3.5-turbo
- **Ollama** - llama3, mistral, codellama (local)
- **Groq** - llama-3.1-70b, mixtral-8x7b

### Usage
```bash
winter chat "Your message" --provider anthropic
winter call "Analyze this"  # Call all providers
```

## Skills System

Built-in skills:
- `coding` - Code analysis, generation, review
- `design` - Design system integration
- `debug` - Debugging assistance
- `refactor` - Code refactoring
- `test` - Test generation

Custom skills via `winter skill create <name>`.

## Design Integration

Access brand design guidelines from awesome-design-md:
```bash
winter design search <brand>
winter design add <brand>
winter design preview <brand>
```

## Key Insight

> "LLMs are exceptionally good at looping until they meet specific goals... Don't tell it what to do, give it success criteria and watch it go."

Transform imperative instructions into declarative goals with verification loops.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.