/**
 * Resource Loader - Auto-discovers and indexes local resources
 * (design systems, agent instructions, skills) for contextual injection.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const LOCAL_ROOT = path.join(PROJECT_ROOT, 'resources', 'local');

// ── Design Systems ──────────────────────────────────────────────────────────

const DESIGN_MD_DIR = path.join(LOCAL_ROOT, 'awesome-design-md', 'design-md');

/**
 * Discover all available design system brands.
 */
export async function discoverDesignBrands() {
  try {
    const entries = await fs.readdir(DESIGN_MD_DIR, { withFileTypes: true });
    return entries
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .sort();
  } catch {
    return [];
  }
}

/**
 * Load a DESIGN.md file for a specific brand.
 */
export async function loadDesignMd(brand) {
  try {
    const dir = path.join(DESIGN_MD_DIR, brand);
    const files = ['DESIGN.md', 'README.md'];
    for (const file of files) {
      const filePath = path.join(dir, file);
      await fs.access(filePath);
      return { brand, file, content: await fs.readFile(filePath, 'utf8') };
    }
  } catch {}
  return null;
}

/**
 * Search design systems by keyword (brand name or description).
 */
export async function searchDesignSystems(query) {
  const brands = await discoverDesignBrands();
  const q = query.toLowerCase();
  const matched = brands.filter(b => b.includes(q));
  return matched.slice(0, 10);
}

// ── Resource Manifest ──────────────────────────────────────────────────────

const MANIFEST_PATH = path.join(LOCAL_ROOT, 'manifest.json');

export async function loadResourceManifest() {
  try {
    const raw = await fs.readFile(MANIFEST_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { localResources: [] };
  }
}

// ── Context Builder ─────────────────────────────────────────────────────────

/**
 * Build a concise context summary of all available local resources.
 * Used for automatic injection into system prompts.
 */
export async function buildResourceContext() {
  const manifest = await loadResourceManifest();
  const resources = manifest.localResources || [];
  const designBrands = await discoverDesignBrands();

  const parts = [];

  if (resources.length > 0) {
    parts.push('## Local Resources');
    resources.forEach(r => {
      parts.push(`  - ${r.name}: ${r.fileCount} files, ${(r.size / 1024).toFixed(0)}KB`);
    });
    parts.push('');
  }

  if (designBrands.length > 0) {
    const brandsStr = designBrands.slice(0, 40).join(', ');
    const leftover = designBrands.length - 40;
    parts.push(`## Design Systems (${designBrands.length} available)`);
    parts.push(`  ${brandsStr}${leftover > 0 ? `, +${leftover} more` : ''}`);
    parts.push('');
  }

  return parts.join('\n');
}

/**
 * Get a relevant DESIGN.md content based on the task description.
 * Uses keyword matching between the task text and design system brand names.
 */
export async function getRelevantDesignGuide(taskText) {
  if (!taskText) return null;

  const brands = await discoverDesignBrands();
  const text = taskText.toLowerCase();

  // Match by brand name in task text
  for (const brand of brands) {
    if (text.includes(brand)) {
      const design = await loadDesignMd(brand);
      if (design) return design;
    }
  }

  // Match by context clues (e.g., "design", "ui", "looks like", "brand")
  const designHint = /\b(design|ui|looks? like|brand guide|style guide|make it look)\b/i.test(text);
  if (designHint && brands.length > 0) {
    // Return the first few brands as options
    return {
      brand: null,
      type: 'design_hint',
      brands: brands.slice(0, 5),
      note: 'Design-related task detected. Available design systems listed above.',
    };
  }

  return null;
}
