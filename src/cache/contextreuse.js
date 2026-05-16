/**
 * Context Reuse - Cache and reuse similar conversation contexts.
 * Reduces API calls by matching new queries against cached responses.
 */

import { SimilaritySearch } from './similarity.js';
import { EmbeddingCache } from './embeddings.js';
import { createHash } from 'crypto';

export class ContextReuseManager {
  constructor(options = {}) {
    this.similarity = new SimilaritySearch();
    this.embeddings = new EmbeddingCache();
    this.maxCacheSize = options.maxCacheSize || 500;
    this.minSimilarity = options.minSimilarity || 0.75;
    this.ttlMs = options.ttlMs || 30 * 60 * 1000; // 30 minutes default
    this.contexts = new Map();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Store a context-response pair for future reuse.
   */
  async store(query, response, metadata = {}) {
    const hash = this._hash(query);
    const entry = {
      hash,
      query,
      response,
      metadata,
      createdAt: Date.now(),
      accessCount: 0,
    };

    // Trim cache if needed
    if (this.contexts.size >= this.maxCacheSize) {
      this._evictOldest();
    }

    this.contexts.set(hash, entry);
    this.similarity.add(hash, query, { hash, createdAt: Date.now() });

    // Also try to store embedding
    try {
      await this.embeddings.cacheEmbedding(query, [], { hash, response: response.substring(0, 200) });
    } catch {
      // Embedding cache is optional
    }
  }

  /**
   * Find a similar context for the given query.
   */
  async find(query, options = {}) {
    const threshold = options.threshold || this.minSimilarity;
    const results = this.similarity.search(query, { limit: 3, threshold });

    for (const result of results) {
      const entry = this.contexts.get(result.id);
      if (!entry) continue;

      // Check TTL
      if (Date.now() - entry.createdAt > this.ttlMs) {
        this.contexts.delete(result.id);
        this.similarity.remove(result.id);
        continue;
      }

      entry.accessCount++;
      this.hits++;
      return {
        matched: true,
        query: entry.query,
        response: entry.response,
        score: result.score,
        metadata: entry.metadata,
        accessCount: entry.accessCount,
      };
    }

    this.misses++;
    return { matched: false };
  }

  /**
   * Check if a query has a cached response.
   */
  async has(query) {
    const result = await this.find(query);
    return result.matched;
  }

  /**
   * Get cache statistics.
   */
  getStats() {
    return {
      size: this.contexts.size,
      maxSize: this.maxCacheSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: this.hits + this.misses > 0
        ? (this.hits / (this.hits + this.misses)).toFixed(3)
        : 0,
      similarityIndexSize: this.similarity.stats().documents,
      ttlMs: this.ttlMs,
    };
  }

  /**
   * Clear all cached contexts.
   */
  clear() {
    this.contexts.clear();
    this.similarity.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Remove expired entries.
   */
  prune() {
    const now = Date.now();
    let removed = 0;
    for (const [hash, entry] of this.contexts) {
      if (now - entry.createdAt > this.ttlMs) {
        this.contexts.delete(hash);
        this.similarity.remove(hash);
        removed++;
      }
    }
    return removed;
  }

  // --- Private helpers ---

  _hash(str) {
    return createHash('md5').update(String(str)).digest('hex');
  }

  _evictOldest() {
    let oldest = null;
    let oldestHash = null;
    for (const [hash, entry] of this.contexts) {
      if (!oldest || entry.createdAt < oldest.createdAt) {
        oldest = entry;
        oldestHash = hash;
      }
    }
    if (oldestHash) {
      this.contexts.delete(oldestHash);
      this.similarity.remove(oldestHash);
    }
  }
}

export const globalContextReuse = new ContextReuseManager();
