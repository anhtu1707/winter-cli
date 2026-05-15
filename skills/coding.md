# ❄️ Coding Skill

Expert-level coding assistance with automatic tool usage.

## When to Use

Use this skill when the user asks to:
- Write code, create files
- Fix bugs
- Refactor code
- Understand existing code
- Review code
- Add features

## How to Use

### Step 1: Understand the Task
1. Read relevant project files to understand context
2. Check for CLAUDE.md, WINTER.md, or other guidelines
3. Identify the scope of changes needed

### Step 2: Plan Changes
For simple tasks:
- Just do it

For complex tasks:
```
1. [Action] → verify: [check]
2. [Action] → verify: [check]
```

### Step 3: Execute
- Read files before modifying
- Use Write for new files
- Use Edit for existing files (surgical changes)
- Use Bash for running commands, git, tests
- Use Glob/Grep to find relevant files

### Step 4: Verify
- Run tests if available
- Check the changes work
- Report what was done

## Examples

### Write New File
```
User: Create a REST API for users
→ Write users.js with Express routes
→ Test with curl
```

### Fix Bug
```
User: Fix the login bug
→ Read auth.js to understand the issue
→ Edit the buggy line
→ Test the fix
```

### Understand Code
```
User: How does this module work?
→ Read the module files
→ Summarize functionality
```

## Key Principles

1. **Don't assume** - Read code to understand before modifying
2. **Be surgical** - Only change what's needed
3. **Verify** - Test your changes work
4. **Be proactive** - Call tools automatically, don't wait to be asked

## Anti-Patterns

❌ "Here's the code you need:" (describe without writing)
✅ Write the file directly

❌ "I think you should..." (assume without reading)
✅ Read the relevant files first

❌ Change 500 lines for a 5-line fix
✅ Surgical edit only

❌ "Try this and let me know if it works"
✅ Run tests, verify, report results