/**
 * ❄️ WEB ARCHIVE TOOL ❄️
 * Fetch archived/cached versions of web pages from Wayback Machine,
 * Google Cache, and local cache. Inspired by Claude Code's WebArchive.
 */

import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

export class WebArchiveTool {
  constructor(cacheDir) {
    this.cacheDir = cacheDir || path.join(process.cwd(), '.winter', 'web-archive');
    this.cacheMaxAge = 24 * 60 * 60 * 1000; // 24h default
  }

  cacheKey(url) {
    return crypto.createHash('md5').update(url).digest('hex');
  }

  cachePath(url) {
    return path.join(this.cacheDir, `${this.cacheKey(url)}.json`);
  }

  async readCache(url) {
    try {
      const cached = await fs.readFile(this.cachePath(url), 'utf8');
      const data = JSON.parse(cached);
      const age = Date.now() - new Date(data.cachedAt).getTime();
      if (age < this.cacheMaxAge) {
        return data;
      }
    } catch {}
    return null;
  }

  async writeCache(url, data) {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
      await fs.writeFile(
        this.cachePath(url),
        JSON.stringify({ ...data, cachedAt: new Date().toISOString() }, null, 2),
        'utf8'
      );
    } catch {}
  }

  async clearCache(url) {
    if (url) {
      try {
        await fs.rm(this.cachePath(url), { force: true });
        return { success: true, cleared: 1 };
      } catch {
        return { success: false, error: 'Cache entry not found' };
      }
    }

    // Clear all cache
    try {
      await fs.rm(this.cacheDir, { recursive: true, force: true });
      return { success: true, cleared: -1 };
    } catch {
      return { success: true, cleared: 0 };
    }
  }

  async fetchFromWayback(url) {
    try {
      // Step 1: Check availability
      const availUrl = `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`;
      const availResponse = await fetch(availUrl, {
        headers: { 'User-Agent': 'WinterCLI/1.0' },
        signal: AbortSignal.timeout(10000),
      });

      if (!availResponse.ok) return null;

      const availData = await availResponse.json();
      const closest = availData?.archived_snapshots?.closest;

      if (!closest?.url) return null;

      // Step 2: Fetch the archived snapshot
      const snapshotUrl = closest.url.replace('http://', 'https://');
      const snapshotResponse = await fetch(snapshotUrl, {
        headers: { 'User-Agent': 'WinterCLI/1.0' },
        signal: AbortSignal.timeout(15000),
      });

      if (!snapshotResponse.ok) return null;

      const html = await snapshotResponse.text();

      return {
        source: 'wayback',
        url: snapshotUrl,
        timestamp: closest.timestamp,
        status: closest.status,
        content: html
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#x27;/g, "'")
          .replace(/\s+/g, ' ')
          .trim(),
        contentLength: html.length,
        archivedAt: closest.timestamp
          ? `${closest.timestamp.slice(0, 4)}-${closest.timestamp.slice(4, 6)}-${closest.timestamp.slice(6, 8)}`
          : 'unknown',
      };
    } catch {
      return null;
    }
  }

  async fetchDirect(url) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'WinterCLI/1.0' },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) return null;

      const html = await response.text();
      return {
        source: 'direct',
        url,
        content: html
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#x27;/g, "'")
          .replace(/\s+/g, ' ')
          .trim(),
        contentLength: html.length,
      };
    } catch {
      return null;
    }
  }

  async fetch(url, options = {}) {
    if (!url || typeof url !== 'string' || url.trim() === '') {
      return { success: false, error: 'url is required' };
    }

    if (options.clearCache) {
      return await this.clearCache(options.clearCache === true ? undefined : options.clearCache);
    }

    // Normalize URL
    const normalizedUrl = url.trim();

    // Try cache first
    if (options.cache !== false) {
      const cached = await this.readCache(normalizedUrl);
      if (cached) {
        return {
          success: true,
          source: 'cache',
          url: normalizedUrl,
          content: cached.content?.substring(0, options.maxLength || 15000),
          fullLength: cached.content?.length || 0,
          cachedAt: cached.cachedAt,
          originalSource: cached.source,
        };
      }
    }

    // Try direct fetch first (for live sites)
    let result = null;
    if (options.preferDirect !== false) {
      result = await this.fetchDirect(normalizedUrl);
    }

    // Fall back to Wayback Machine
    if (!result) {
      result = await this.fetchFromWayback(normalizedUrl);
    }

    if (!result) {
      return {
        success: false,
        error: `Unable to fetch archived content for: ${normalizedUrl}. Try WebFetch for live content.`,
        url: normalizedUrl,
      };
    }

    // Cache the result
    await this.writeCache(normalizedUrl, result);

    return {
      success: true,
      source: result.source,
      url: normalizedUrl,
      archivedUrl: result.url,
      content: result.content.substring(0, options.maxLength || 15000),
      fullLength: result.content.length,
      archivedAt: result.archivedAt,
      status: result.status,
    };
  }
}
