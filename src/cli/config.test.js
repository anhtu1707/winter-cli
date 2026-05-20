import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { ConfigLoader } from './config.js';

test('ConfigLoader save strips inline API keys and stores env references', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'winter-config-'));
  const config = new ConfigLoader();
  config.winterDir = root;
  config.configFile = path.join(root, 'winter.json');
  config.envFile = path.join(root, 'secrets.env');

  await config.save({
    defaultProvider: 'custom',
    custom: {
      baseURL: 'http://localhost:4000/v1',
      apiKey: 'secret',
      model: 'test-model',
    },
  });

  const raw = await readFile(config.configFile, 'utf8');
  const saved = JSON.parse(raw);

  assert.equal(saved.custom.apiKey, undefined);
  assert.equal(saved.custom.apiKeyEnv, 'WINTER_CUSTOM_API_KEY');
});

test('ConfigLoader migrateSecrets moves existing keys into secrets env file', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'winter-config-'));
  const config = new ConfigLoader();
  config.winterDir = root;
  config.configFile = path.join(root, 'winter.json');
  config.envFile = path.join(root, 'secrets.env');

  await writeFile(config.configFile, JSON.stringify({
    defaultProvider: 'custom',
    custom: {
      baseURL: 'http://localhost:4000/v1',
      apiKey: 'existing-secret',
      model: 'test-model',
    },
  }, null, 2));
  await config.migrateSecrets();

  const loaded = await config.load();

  assert.equal(loaded.custom.apiKey, 'existing-secret');
  const envText = await readFile(config.envFile, 'utf8');
  assert.match(envText, /WINTER_CUSTOM_API_KEY=existing-secret/);
});

test('ConfigLoader load accepts UTF-8 BOM winter.json files', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'winter-config-'));
  const config = new ConfigLoader();
  config.winterDir = root;
  config.configFile = path.join(root, 'winter.json');
  config.envFile = path.join(root, 'secrets.env');

  await writeFile(config.configFile, `\uFEFF${JSON.stringify({
    defaultProvider: 'custom2',
    custom2: {
      baseURL: 'https://api.example.test/v1',
      model: 'example-model',
    },
  }, null, 2)}`);

  const loaded = await config.load();

  assert.equal(loaded.defaultProvider, 'custom2');
  assert.equal(loaded.custom2.baseURL, 'https://api.example.test/v1');
});

test('applyEnv falls back to raw apiKeyEnv value when no matching env variable exists', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'winter-config-'));
  const config = new ConfigLoader();
  config.winterDir = root;
  config.configFile = path.join(root, 'winter.json');
  config.envFile = path.join(root, 'secrets.env');

  // Simulate a config where apiKeyEnv contains the raw key (not an env var name)
  await writeFile(config.configFile, JSON.stringify({
    defaultProvider: 'custom',
    custom: {
      baseURL: 'http://localhost:4000/v1',
      apiKeyEnv: 'sk-86df996cc2568bdf-a2c1ar-851c1731',
      model: 'test-model',
    },
    claude: {
      baseURL: 'http://localhost:4000/v1',
      apiKeyEnv: 'sk-86df996cc2568bdf-a2c1ar-851c1731',
      model: 'claude-model',
    },
  }, null, 2));

  const loaded = await config.load();

  // Both providers should get the API key from the apiKeyEnv fallback
  assert.equal(loaded.custom.apiKey, 'sk-86df996cc2568bdf-a2c1ar-851c1731');
  assert.equal(loaded.claude.apiKey, 'sk-86df996cc2568bdf-a2c1ar-851c1731');
});

test('applyEnv prefers process.env[apiKeyEnv] over raw apiKeyEnv fallback', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'winter-config-'));
  const config = new ConfigLoader();
  config.winterDir = root;
  config.configFile = path.join(root, 'winter.json');
  config.envFile = path.join(root, 'secrets.env');

  const prevEnv = process.env['TEST_WINTER_API_KEY'];
  process.env['TEST_WINTER_API_KEY'] = 'correct-key-from-env';

  try {
    await writeFile(config.configFile, JSON.stringify({
      defaultProvider: 'custom',
      custom: {
        baseURL: 'http://localhost:4000/v1',
        apiKeyEnv: 'TEST_WINTER_API_KEY',
        model: 'test-model',
      },
    }, null, 2));

    const loaded = await config.load();

    // Should use process.env value, not the raw apiKeyEnv
    assert.equal(loaded.custom.apiKey, 'correct-key-from-env');
  } finally {
    if (prevEnv) {
      process.env['TEST_WINTER_API_KEY'] = prevEnv;
    } else {
      delete process.env['TEST_WINTER_API_KEY'];
    }
  }
});
