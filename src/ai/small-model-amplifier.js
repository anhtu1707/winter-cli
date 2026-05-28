export function isWeakTier(modelTier = '') {
  return true;
}

export function buildCodingMasteryContract({ compact = false } = {}) {
  const rules = [
    'Read the code path before editing: entrypoint, caller, callee, config/env, and tests when they exist.',
    'Identify invariants and side effects before changing behavior: data shape, async ordering, permissions, IO, cache, UI state, and provider differences.',
    'Prefer the smallest correct patch, but update adjacent tests/docs/config when the contract changes.',
    'After editing, review the diff mentally for syntax errors, dead code, race conditions, missing imports, wrong paths, and Windows path/shell issues.',
    'Verify with the closest command. If verification is impossible, state the exact blocker and what evidence was still checked.',
    'For mutating work, expect Winter to run verification before the final answer; use failures as the next debugging input instead of claiming success early.',
    'Final answers must name concrete files changed and concrete verification results; no vague "should work" claims.',
  ];

  if (compact) {
    return `## Coding Mastery Contract\n${rules.slice(0, 5).map(rule => `- ${rule}`).join('\n')}`;
  }

  return [
    '## Coding Mastery Contract',
    '- Act like a senior maintainer: understand the runtime path, preserve local patterns, and optimize for the user-visible failure.',
    ...rules.map(rule => `- ${rule}`),
    '- For reviews, lead with defects and risks. For implementation, finish with a short change summary and verification evidence.',
  ].join('\n');
}

export function buildSmallModelAmplification({ modelTier = '', workflowProfile = 'general', depth = 'standard' } = {}) {
  const deepLike = depth === 'deep' || /debug|backend|data|devops|ai/.test(workflowProfile);
  const tier = String(modelTier || 'medium').toLowerCase();
  const smallLike = /tiny|small/.test(tier);
  const maxToolTurns = deepLike ? (smallLike ? 22 : 18) : (smallLike ? 18 : 14);

  const hint = [
    '[Winter Strength Amplifier]',
    `- Active model tier: ${tier}. Winter must compensate with stricter procedure, not weaker behavior.`,
    '- Mandatory loop for action tasks: restate success criteria privately -> inspect real files/state -> make one concrete tool call -> read result -> continue -> verify -> final.',
    '- If you are uncertain, call Read/Grep/Glob/Bash instead of guessing. Evidence beats reasoning guesses.',
    '- For tool fallback mode, output exactly one tool call and no prose. Do not wrap tool calls in explanation.',
    '- Do not claim files changed, browser checked, tests passed, or commands ran unless tool output in this turn proves it.',
    '- Prefer small, high-signal context reads over broad dumps. Use CodeGraph/codebase index before broad file reads when available.',
    '- Coding standard: follow the Coding Mastery Contract; inspect call sites and tests before edits, then verify the runtime path.',
    '- After a failed tool or test, inspect the new failure and try the next smallest fix. Stop only at max tool turns or a real blocker.',
    '- Before final answer, run a private self-check: requirement met, files touched, verification result, remaining risk. Do not print the self-check.',
  ].join('\n');

  return {
    weak: true,
    maxToolTurns,
    enforceSelfCritique: true,
    hint,
  };
}
