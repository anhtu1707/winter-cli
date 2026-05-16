/**
 * Tests for ResourceLoader - auto-discovery of local resources
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';

let resourceLoader;

describe('ResourceLoader', { concurrency: false }, () => {
  before(async () => {
    resourceLoader = await import('./resource-loader.js');
  });

  it('discovers design brands from awesome-design-md', async () => {
    const brands = await resourceLoader.discoverDesignBrands();
    assert(Array.isArray(brands), 'Should return an array');
    assert(brands.length > 0, 'Should discover at least one design brand');
    assert(brands.includes('vercel'), 'Should find vercel among brands');
  });

  it('loads a specific DESIGN.md by brand name', async () => {
    const design = await resourceLoader.loadDesignMd('vercel');
    assert(design, 'Should load vercel design');
    assert.equal(design.brand, 'vercel');
    assert(design.content.length > 100, 'Design content should be substantial');
  });

  it('returns null for non-existent brand', async () => {
    const design = await resourceLoader.loadDesignMd('nonexistent-brand-xyz');
    assert.equal(design, null);
  });

  it('searches design systems by query', async () => {
    const results = await resourceLoader.searchDesignSystems('ver');
    assert(Array.isArray(results));
    assert(results.includes('vercel'), 'Should find vercel in search results');
  });

  it('loads resource manifest', async () => {
    const manifest = await resourceLoader.loadResourceManifest();
    assert(manifest, 'Should return parsed manifest');
    assert(Array.isArray(manifest.localResources), 'Should have localResources array');
    assert(manifest.localResources.length >= 4, 'Should have multiple resources');
    const names = manifest.localResources.map(r => r.name);
    assert(names.includes('awesome-design-md'), 'Should include awesome-design-md');
    assert(names.includes('claude'), 'Should include claude');
  });

  it('builds resource context string', async () => {
    const context = await resourceLoader.buildResourceContext();
    assert(context.length > 0, 'Should produce non-empty context');
    assert(context.includes('Design Systems'), 'Should mention design systems');
    assert(context.includes('Local Resources'), 'Should mention local resources');
  });

  it('finds relevant design guide by brand name in task text', async () => {
    const guide = await resourceLoader.getRelevantDesignGuide('Build a landing page like vercel');
    assert(guide, 'Should find matching design guide');
    assert.equal(guide.brand, 'vercel', 'Should match vercel brand');
  });

  it('returns design hint object for generic design task', async () => {
    const guide = await resourceLoader.getRelevantDesignGuide('Make it look really good');
    assert(guide, 'Should return design hint');
    assert.equal(guide.type, 'design_hint');
    assert(Array.isArray(guide.brands), 'Should list available brands');
  });

  it('returns null for irrelevant task', async () => {
    const guide = await resourceLoader.getRelevantDesignGuide('run the npm build and check for errors');
    assert.equal(guide, null);
  });
});
