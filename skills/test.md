# ❄️ Test Skill

Test generation and execution.

## Test Types

### Unit Tests
- Test individual functions
- Mock dependencies
- Fast to run

### Integration Tests
- Test API endpoints
- Test database operations
- Slower but comprehensive

### E2E Tests
- Test full user flows
- Use browser automation
- Slowest but most realistic

## Process

### 1. Identify What to Test
- Find the code to test
- Identify edge cases
- Check existing tests

### 2. Write Tests
- Use appropriate framework (Vitest, Jest, etc.)
- Follow project conventions
- Cover happy path AND edge cases

### 3. Run Tests
```bash
npm test
# or
npm run test:watch
```

### 4. Verify
- All tests pass
- Coverage improved
- No regressions

## Examples

### Add Tests for Function
```
User: Add tests for calculateTotal
→ Read calculateTotal function
→ Write tests for:
  - Normal case
  - Empty array
  - Negative values
→ Run tests
→ Report coverage
```

## Key Commands

- `Read` - Read source and existing tests
- `Write` - Create test files
- `Bash` - Run test commands