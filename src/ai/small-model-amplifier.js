import { isSmallModel } from './model-capabilities.js';

export function isWeakTier(modelTier = '') {
  return isSmallModel(modelTier);
}

export function buildSmallModelAmplification({ modelTier = '', workflowProfile = 'general', depth = 'standard' } = {}) {
  const weak = isWeakTier(modelTier);
  if (!weak) {
    return {
      weak: false,
      maxToolTurns: 8,
      enforceSelfCritique: false,
      hint: '',
    };
  }

  const deepLike = depth === 'deep' || /debug|backend|data|devops|ai/.test(workflowProfile);
  const maxToolTurns = deepLike ? 14 : 10;

  const hint = [
    '[Small Model Amplifier]',
    '- You are running in weak-model compensation mode.',
    '- Mandatory loop: PLAN (requirements + files + risks) -> TOOL ACTIONS -> VERIFY -> SELF-CHECK -> FINAL.',
    '- Do not skip verification. If verification fails, iterate until max loops.',
    '- Before final answer, run a private self-critique: missing edge cases, missing tests, over-claims, and incorrect assumptions.',
    '- Prefer concrete evidence from tool outputs over reasoning guesses.',
  ].join('\n');

  return {
    weak: true,
    maxToolTurns,
    enforceSelfCritique: true,
    hint,
  };
}

