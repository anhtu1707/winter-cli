/**
 * Task Classifier - Analyzes user input to determine task type,
 * complexity level, and optimal processing strategy.
 */

export const TASK_TYPES = {
  QUICK: 'quick',
  SIMPLE: 'simple',
  MODERATE: 'moderate',
  COMPLEX: 'complex',
  DEEP: 'deep',
};

export const TASK_CATEGORIES = {
  READ: 'read',
  EDIT: 'edit',
  SEARCH: 'search',
  DEBUG: 'debug',
  REFACTOR: 'refactor',
  PLAN: 'plan',
  GENERATE: 'generate',
  EXPLAIN: 'explain',
  REVIEW: 'review',
  TEST: 'test',
  CONFIG: 'config',
  INSTALL: 'install',
};

const TYPE_KEYWORDS = {
  read: ['read', 'show', 'cat', 'display', 'open', 'print', 'what is in', 'contents of', 'view'],
  edit: ['edit', 'change', 'update', 'modify', 'replace', 'add', 'remove', 'delete', 'rename', 'fix', 'patch'],
  search: ['search', 'find', 'grep', 'locate', 'where is', 'look for'],
  debug: ['debug', 'error', 'bug', 'crash', 'fail', 'broken', 'wrong', 'issue', 'problem'],
  refactor: ['refactor', 'restructure', 'reorganize', 'rewrite', 'clean up', 'simplify', 'extract'],
  plan: ['plan', 'design', 'architecture', 'strategy', 'approach', 'how to', 'step by step'],
  generate: ['generate', 'create', 'implement', 'build', 'write', 'make', 'new file', 'scaffold'],
  explain: ['explain', 'what does', 'how does', 'why does', 'describe', 'clarify', 'elaborate'],
  review: ['review', 'audit', 'inspect', 'check', 'validate', 'verify'],
  test: ['test', 'unit test', 'integration test', 'assert', 'spec'],
  config: ['config', 'setup', 'install', 'configure', 'initialize'],
  install: ['install', 'npm install', 'pip install', 'gem install', 'cargo install', 'brew install'],
};

const COMPLEXITY_SIGNALS = {
  deep: [
    'multiple files', 'cross-cutting', 'architecture', 'refactor',
    'migrate', 'redesign', 'rearchitect', 'complex', 'complicated',
    'full stack', 'end to end', 'e2e',
  ],
  complex: [
    'refactor', 'debug', 'implement', 'build', 'create',
    'integration', 'several', 'multiple',
  ],
  moderate: [
    'edit', 'change', 'update', 'fix', 'test', 'review',
    'add feature', 'improve',
  ],
};

function countKeywordMatches(text, keywords) {
  return keywords.filter(kw => text.includes(kw)).length;
}

function getMatchedText(original, matchFn) {
  return original;
}

export function classifyTask(userInput) {
  const text = String(userInput || '').toLowerCase().trim();
  if (!text) return { type: TASK_TYPES.QUICK, category: TASK_CATEGORIES.EXPLAIN };

  // Determine category
  let bestCategory = TASK_CATEGORIES.EXPLAIN;
  let bestScore = 0;

  for (const [category, keywords] of Object.entries(TYPE_KEYWORDS)) {
    const score = countKeywordMatches(text, keywords);
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  // Determine complexity
  let complexity = TASK_TYPES.QUICK;

  // Word count heuristic
  const wordCount = text.split(/\s+/).length;
  if (wordCount > 50) complexity = TASK_TYPES.COMPLEX;
  else if (wordCount > 20) complexity = TASK_TYPES.MODERATE;
  else if (wordCount < 5) complexity = TASK_TYPES.QUICK;
  else complexity = TASK_TYPES.SIMPLE;

  // Override with keyword signals for higher complexity
  for (const [level, signals] of Object.entries(COMPLEXITY_SIGNALS)) {
    if (countKeywordMatches(text, signals) >= 2) {
      if (level === 'deep' || (level === 'complex' && complexity !== TASK_TYPES.DEEP)) {
        complexity = TASK_TYPES[level.toUpperCase()];
      }
    }
  }

  const estimatedTokens = wordCount * 2; // rough estimate

  return {
    type: complexity,
    category: bestCategory,
    wordCount,
    estimatedTokens,
    requiresTools: bestCategory !== TASK_CATEGORIES.EXPLAIN,
    requiresContext: ['edit', 'refactor', 'debug', 'review', 'test'].includes(bestCategory),
  };
}

export function shouldUseFastModel(taskInfo) {
  return taskInfo.type === TASK_TYPES.QUICK || taskInfo.type === TASK_TYPES.SIMPLE;
}

export function shouldUseDeepModel(taskInfo) {
  return taskInfo.type === TASK_TYPES.COMPLEX || taskInfo.type === TASK_TYPES.DEEP;
}
