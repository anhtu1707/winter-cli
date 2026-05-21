/**
 * ❄ CACHE SYSTEM ❄
 * Context embedding and response caching
 */

import { promises as fs } from 'fs';
import path from 'path';
import { homedir } from 'os';
import crypto from 'crypto';

export class CacheSystem {
  constructor() {
    this.cacheDir = path.join(homedir(), '.winter', 'cache');
    this.embeddingsDir = path.join(this.cacheDir, 'embeddings');
    this.responsesDir = path.join(this.cacheDir, 'responses');
    this.memoryCache = new Map();
  }

  async init() {
    await fs.mkdir(this.embeddingsDir, { recursive: true });
    await fs.mkdir(this.responsesDir, { recursive: true });
  }

  // Simple hash-based caching
  async get(key) {
    // Check memory cache first
    if (this.memoryCache.has(key)) {
      return this.memoryCache.get(key);
    }

    // Check disk cache
    const hash = this.hashKey(key);
    const filePath = path.join(this.responsesDir, `${hash}.json`);

    try {
      const data = await fs.readFile(filePath, 'utf8');
      const cached = JSON.parse(data);

      // Check expiry
      if (cached.expiresAt && Date.now() > cached.expiresAt) {
        await this.delete(key);
        return null;
      }

      this.memoryCache.set(key, cached.data);
      return cached.data;
    } catch {
      return null;
    }
  }

  async set(key, data, ttl = 3600000) {
    // Store in memory
    this.memoryCache.set(key, data);

    // Store on disk
    const hash = this.hashKey(key);
    const filePath = path.join(this.responsesDir, `${hash}.json`);

    const cached = {
      data,
      createdAt: Date.now(),
      expiresAt: Date.now() + ttl,
    };

    await fs.writeFile(filePath, JSON.stringify(cached));
  }

  async delete(key) {
    this.memoryCache.delete(key);

    const hash = this.hashKey(key);
    const filePath = path.join(this.responsesDir, `${hash}.json`);

    try {
      await fs.unlink(filePath);
    } catch {
      // Ignore if file doesn't exist
    }
  }

  async clear() {
    this.memoryCache.clear();

    try {
      const files = await fs.readdir(this.responsesDir);
      for (const file of files) {
        await fs.unlink(path.join(this.responsesDir, file));
      }
    } catch {
      // Ignore errors
    }
  }

  async getStats() {
    const memorySize = this.memoryCache.size;

    let diskSize = 0;
    let diskCount = 0;

    try {
      const files = await fs.readdir(this.responsesDir);
      for (const file of files) {
        const stat = await fs.stat(path.join(this.responsesDir, file));
        diskSize += stat.size;
        diskCount++;
      }
    } catch {
      // Ignore errors
    }

    return {
      memory: { count: memorySize },
      disk: { count: diskCount, size: diskSize },
      total: { count: memorySize + diskCount, size: diskSize },
    };
  }

  hashKey(key) {
    return crypto.createHash('md5').update(key).digest('hex');
  }

  // Embedding cache for context
  async cacheEmbedding(context, embedding) {
    const hash = this.hashKey(context);
    const filePath = path.join(this.embeddingsDir, `${hash}.json`);

    await fs.writeFile(filePath, JSON.stringify({
      context,
      embedding,
      createdAt: Date.now(),
    }));
  }

  async getEmbedding(context) {
    const hash = this.hashKey(context);
    const filePath = path.join(this.embeddingsDir, `${hash}.json`);

    try {
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data).embedding;
    } catch {
      return null;
    }
  }

  async clearEmbeddings() {
    try {
      const files = await fs.readdir(this.embeddingsDir);
      for (const file of files) {
        await fs.unlink(path.join(this.embeddingsDir, file));
      }
    } catch {
      // Ignore errors
    }
  }
}