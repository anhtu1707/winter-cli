export function isWeakTier(modelTier = '') {
  return true;
}

export function buildSmallModelAmplification({ modelTier = '', workflowProfile = 'general', depth = 'standard' } = {}) {
  const deepLike = depth === 'deep' || /debug|backend|data|devops|ai/.test(workflowProfile);
  const maxToolTurns = deepLike ? 18 : 14;

  const hint = [
    '[Winter Strength Amplifier]',
    '- Every model, including tiny/local/free models, must run at Winter maximum capability.',
    '- Mandatory loop: PLAN (requirements + files + risks) -> TOOL ACTIONS -> VERIFY -> SELF-CHECK -> FINAL.',
    '- Do not skip verification. If verification fails, iterate until max loops.',
    '- Before final answer, run a private self-critique: missing edge cases, missing tests, over-claims, and incorrect assumptions.',
    '- Prefer concrete evidence from tool outputs over reasoning guesses.',
    '- Use CodeGraph/codebase index context before broad file reads when available.',
  ].join('\n');

  return {
    weak: true,
    maxToolTurns,
    enforceSelfCritique: true,
    hint,
  };
}
