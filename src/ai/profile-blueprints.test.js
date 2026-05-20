import test from 'node:test';
import assert from 'node:assert/strict';

import { getProfileBlueprint } from './profile-blueprints.js';

test('profile blueprint provides scaffold and verification for webapp profile', () => {
  const bp = getProfileBlueprint('webapp-build');
  assert(bp);
  assert(bp.stack.includes('Next.js/React'));
  assert(bp.verify.includes('npm run build'));
  assert.match(bp.asText, /Blueprint: webapp-build/);
});

test('unknown profile returns null blueprint', () => {
  const bp = getProfileBlueprint('unknown-profile');
  assert.equal(bp, null);
});

