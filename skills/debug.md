# ❄️ Debug Skill

Systematic debugging with automatic tool usage.

## Debugging Process

### 1. Reproduce
- Run the code to see the error
- Note the exact error message
- Identify when it happens

### 2. Understand
- Read the relevant code
- Trace the execution flow
- Identify the root cause

### 3. Fix
- Make surgical changes
- Don't over-engineer the fix

### 4. Verify
- Run the code again
- Confirm the bug is fixed
- Check for regressions

## Examples

### Bug: TypeError: Cannot read property 'x' of undefined

```
1. Reproduce → Run code, see error
2. Read file with error
3. Edit: Add null check or fix data source
4. Verify → Run again
```

### Bug: API returns 500

```
1. Reproduce → Call API, see 500
2. Read server logs (Bash: cat logs)
3. Read handler code
4. Fix the issue
5. Verify → Call API again
```

## Key Commands

- `Read` - Read source files
- `Bash` - Run commands, check logs
- `Edit` - Fix the bug
- `Grep` - Find related code

## Anti-Patterns

❌ Blind guessing
✅ Reproduce first, then fix

❌ Over-engineered fixes
✅ Surgical changes

❌ "It might be..." without evidence
✅ Read code, trace execution