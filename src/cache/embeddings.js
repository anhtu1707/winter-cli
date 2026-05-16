/**
 * Embeddings Cache - Vector embedding storage with similarity search
 * and cache_control (TTL-based expiration) support.
 */
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { homedir } from 'os';

const CACHE_DIR = path.join(homedir(), '.winter', 'cache', 'embeddings');
const INDEX_FILE = path.join(CACHE_DIR, 'index.json');

export class EmbeddingCache {
  constructor(options = {}) {
    this.memory = new Map();
    this.index = { embeddings: [], lastUpdated: null };
    this.initialized = false;
    this.defaultTtlMs = options.defaultTtlMs || 30 * 60 * 1000; // 30 min default
  }

  async init() {
    if (this.initialized) return;
    try {
      await fs.mkdir(CACHE_DIR, { recursive: true });
      const raw = await fs.readFile(INDEX_FILE, 'utf8').catch(() => '{}');
      this.index = JSON.parse(raw);
      if (!this.index.embeddings) this.index.embeddings = [];
      this.initialized = true;
    } catch {
      this.index = { embeddings: [], lastUpdated: null };
      this.initialized = true;
    }
  }

  _hashKey(key) {
    return createHash('md5').update(String(key)).digest('hex');
  }

  _isExpired(entry) {
    if (!entry || !entry.expiresAt) return false;
    return Date.now() > entry.expiresAt;
  }

  async cacheEmbedding(text, vector, metadata = {}) {
    await this.init();
    const hash = this._hashKey(text);
    const ttlMs = metadata.ttlMs || this.defaultTtlMs;
    const entry = {
      hash,
      text: text.substring(0, 500),
      vector,
      metadata,
      createdAt: Date.now(),
      expiresAt: Date.now() + ttlMs,
      ttlMs,
    };

    this.memory.set(hash, entry);

    // Update index
    const existingIdx = this.index.embeddings.findIndex(e => e.hash === hash);
    if (existingIdx >= 0) {
      this.index.embeddings[existingIdx] = entry;
    } else {
      this.index.embeddings.push(entry);
    }
    this.index.lastUpdated = Date.now();

    // Persist
    const filePath = path.join(CACHE_DIR, `${hash}.json`);
    await fs.writeFile(filePath, JSON.stringify(entry), 'utf8');
    await fs.writeFile(INDEX_FILE, JSON.stringify(this.index, null, 2), 'utf8');
  }

  async getEmbedding(text, options = {}) {
    await this.init();
    const hash = this._hashKey(text);
    const ignoreExpiry = options.ignoreExpiry === true;

    if (this.memory.has(hash)) {
      const cached = this.memory.get(hash);
      if (ignoreExpiry || !this._isExpired(cached)) {
        return cached;
      }
      this.memory.delete(hash);
    }

    try {
      const filePath = path.join(CACHE_DIR, `${hash}.json`);
      const raw = await fs.readFile(filePath, 'utf8');
      const entry = JSON.parse(raw);
      if (ignoreExpiry || !this._isExpired(entry)) {
        this.memory.set(hash, entry);
        return entry;
      }
      await fs.unlink(filePath).catch(() => {});
      return null;
    } catch {
      return null;
    }
  }

  async findSimilar(text, threshold = 0.8, limit = 5) {
    await this.init();
    if (this.index.embeddings.length === 0) return [];

    const now = Date.now();
    const results = [];
    const expired = [];

    for (const entry of this.index.embeddings) {
      if (entry.expiresAt && now > entry.expiresAt) {
        expired.push(entry.hash);
        continue;
      }
      const score = this._cosineSimilarity(text, entry.text);
      if (score >= threshold) {
        results.push({ score, entry });
      }
    }

    // Clean expired entries
    if (expired.length > 0) {
      this.index.embeddings = this.index.embeddings.filter(
        e => !expired.includes(e.hash)
      );
      this.index.lastUpdated = now;
      for (const hash of expired) {
        this.memory.delete(hash);
        const fp = path.join(CACHE_DIR, `${hash}.json`);
        await fs.unlink(fp).catch(() => {});
      }
      await fs.writeFile(INDEX_FILE, JSON.stringify(this.index, null, 2), 'utf8');
    }

    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  async pruneExpired() {
    await this.init();
    const now = Date.now();
    const before = this.index.embeddings.length;

    this.index.embeddings = this.index.embeddings.filter(e => {
      if (e.expiresAt && now > e.expiresAt) {
        this.memory.delete(e.hash);
        const fp = path.join(CACHE_DIR, `${e.hash}.json`);
        fs.unlink(fp).catch(() => {});
        return false;
      }
      return true;
    });

    this.index.lastUpdated = now;
    await fs.writeFile(INDEX_FILE, JSON.stringify(this.index, null, 2), 'utf8');
    return before - this.index.embeddings.length;
  }

  _cosineSimilarity(a, b) {
    const tokensA = new Set(a.toLowerCase().split(/\s+/));
    const tokensB = b.toLowerCase().split(/\s+/);
    const intersection = tokensB.filter(t => tokensA.has(t)).length;
    const denom = Math.sqrt(tokensA.size * tokensB.length);
    return denom === 0 ? 0 : intersection / denom;
  }

  async getStats() {
    await this.init();
    return {
      totalEmbeddings: this.index.embeddings.length,
      memoryEntries: this.memory.size,
      lastUpdated: this.index.lastUpdated,
      cacheDir: CACHE_DIR,
      defaultTtlMs: this.defaultTtlMs,
    };
  }

  async clear() {
    this.memory.clear();
    this.index = { embeddings: [], lastUpdated: null };
    await fs.writeFile(INDEX_FILE, JSON.stringify(this.index), 'utf8').catch(() => {});
  }
}

export const globalEmbeddingCache = new EmbeddingCache();
