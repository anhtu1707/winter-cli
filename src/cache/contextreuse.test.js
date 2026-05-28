import test from 'node:test';
import assert from 'node:assert/strict';

import { ContextReuseManager } from './contextreuse.js';
import { SimilaritySearch } from './similarity.js';

test('SimilaritySearch returns ranked matches and supports removal', () => {
  const search = new SimilaritySearch()
    .add('debug', 'debug mcp timeout reset cached client')
    .add('design', 'responsive dashboard layout command center');

  const results = search.search('debug timeout client', { threshold: 0.01 });

  assert.equal(results[0].id, 'debug');
  assert.equal(search.stats().documents, 2);
  search.remove('debug');
  assert.equal(search.search('debug timeout client', { threshold: 0.01 }).length, 0);
});

test('ContextReuseManager stores, finds, prunes, and clears reusable contexts', async () => {
  const reuse = new ContextReuseManager({
    maxCacheSize: 2,
    minSimilarity: 0.01,
    ttlMs: 1000,
  });
  reuse.embeddings = {
    cacheEmbedding: async () => {},
  };

  await reuse.store('fix winter provider routing', 'inspect providers and run tests', { area: 'ai' });
  const hit = await reuse.find('provider routing winter fix', { threshold: 0.01 });

  assert.equal(hit.matched, true);
  assert.equal(hit.metadata.area, 'ai');
  assert.equal(reuse.getStats().hits, 1);

  const miss = await reuse.find('unrelated payroll page', { threshold: 10 });
  assert.equal(miss.matched, false);
  assert.equal(reuse.getStats().misses, 1);

  reuse.clear();
  assert.equal(reuse.getStats().size, 0);
});
