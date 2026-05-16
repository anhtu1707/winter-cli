import { promises as fs } from 'fs';

const SECRET_PATTERN = /(api[-_]?key|auth[-_]?token|access[-_]?token|refresh[-_]?token|secret|password)/i;

export function providerEnvName(provider, field = 'apiKey') {
  const normalizedProvider = String(provider || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_');
  const normalizedField = String(field || 'apiKey')
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_');
  return `WINTER_${normalizedProvider}_${normalizedField}`;
}

export function readEnvFileText(text = '') {
  const values = {};
  for (const line of String(text || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    values[key] = rawValue.replace(/^"|"$/g, '').replace(/^'|'$/g, '');
  }
  return values;
}

export async function loadEnvFile(filePath) {
  try {
    const text = await fs.readFile(filePath, 'utf8');
    const values = readEnvFileText(text);
    for (const [key, value] of Object.entries(values)) {
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
    return values;
  } catch {
    return {};
  }
}

export function redactSecrets(value) {
  if (Array.isArray(value)) return value.map(item => redactSecrets(item));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
    key,
    SECRET_PATTERN.test(key) ? '[redacted]' : redactSecrets(entry),
  ]));
}

export function stripInlineSecrets(config = {}) {
  const next = structuredClone(config);
  for (const [provider, section] of Object.entries(next)) {
    if (!section || typeof section !== 'object' || Array.isArray(section)) continue;
    if (typeof section.apiKey === 'string' && section.apiKey) {
      section.apiKeyEnv = section.apiKeyEnv || providerEnvName(provider, 'apiKey');
      delete section.apiKey;
    }
    if (typeof section.authToken === 'string' && section.authToken) {
      section.authTokenEnv = section.authTokenEnv || providerEnvName(provider, 'authToken');
      delete section.authToken;
    }
  }
  return next;
}

