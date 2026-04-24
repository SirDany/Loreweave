import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  applyConfigToEnv,
  configPath,
  loadConfig,
  maskConfig,
  patchConfig,
  saveConfig,
} from '../src/config.js';

let sandbox: string;
let prevHome: string | undefined;
let prevUserProfile: string | undefined;
let prevEnvSnapshot: Record<string, string | undefined>;

const TRACKED_ENV = [
  'LW_AI_PROVIDER',
  'LW_AI_MODEL',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'OLLAMA_HOST',
  'LOREWEAVE_EMBEDDINGS',
  'LOREWEAVE_EMBEDDINGS_MODEL',
  'LOREWEAVE_EMBEDDINGS_ENDPOINT',
  'LOREWEAVE_EMBEDDINGS_API_KEY',
];

beforeEach(async () => {
  sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'lw-config-'));
  prevHome = process.env.HOME;
  prevUserProfile = process.env.USERPROFILE;
  process.env.HOME = sandbox;
  process.env.USERPROFILE = sandbox;
  prevEnvSnapshot = {};
  for (const k of TRACKED_ENV) {
    prevEnvSnapshot[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(async () => {
  if (prevHome === undefined) delete process.env.HOME;
  else process.env.HOME = prevHome;
  if (prevUserProfile === undefined) delete process.env.USERPROFILE;
  else process.env.USERPROFILE = prevUserProfile;
  for (const k of TRACKED_ENV) {
    const v = prevEnvSnapshot[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  await fs.rm(sandbox, { recursive: true, force: true });
});

describe('config module', () => {
  it('configPath lives under homedir/.loreweave/config.json', () => {
    expect(configPath()).toBe(path.join(sandbox, '.loreweave', 'config.json'));
  });

  it('loadConfig returns empty object when file is absent', async () => {
    const cfg = await loadConfig();
    expect(cfg).toEqual({});
  });

  it('saveConfig + loadConfig roundtrip preserves values', async () => {
    await saveConfig({
      chat: { provider: 'anthropic', anthropicApiKey: 'sk-xxx', model: 'claude' },
      embeddings: { provider: 'ollama', model: 'nomic-embed-text' },
    });
    const cfg = await loadConfig();
    expect(cfg.chat?.provider).toBe('anthropic');
    expect(cfg.chat?.anthropicApiKey).toBe('sk-xxx');
    expect(cfg.embeddings?.provider).toBe('ollama');
  });

  it('sanitize drops unknown providers and non-string values', async () => {
    const bogus = {
      chat: { provider: 'evil-corp', model: 42, anthropicApiKey: 'keep-me' },
      embeddings: { provider: 'openai-compatible', endpoint: 'https://x' },
    } as unknown as Parameters<typeof saveConfig>[0];
    await saveConfig(bogus);
    const cfg = await loadConfig();
    expect(cfg.chat?.provider).toBeUndefined();
    expect(cfg.chat?.model).toBeUndefined();
    expect(cfg.chat?.anthropicApiKey).toBe('keep-me');
    expect(cfg.embeddings?.provider).toBe('openai-compatible');
  });

  it('patchConfig merges and clears fields on null/empty', async () => {
    await saveConfig({
      chat: { provider: 'openai', openaiApiKey: 'sk-one', model: 'gpt-4o' },
    });
    await patchConfig({
      chat: { openaiApiKey: 'sk-two', model: null },
      embeddings: { provider: 'ollama', model: 'nomic-embed-text' },
    });
    const cfg = await loadConfig();
    expect(cfg.chat?.openaiApiKey).toBe('sk-two');
    expect(cfg.chat?.model).toBeUndefined();
    expect(cfg.chat?.provider).toBe('openai');
    expect(cfg.embeddings?.provider).toBe('ollama');
  });

  it('maskConfig hides API keys and reports env overrides', async () => {
    await saveConfig({
      chat: { provider: 'anthropic', anthropicApiKey: 'sk-secret' },
      embeddings: { provider: 'ollama', apiKey: 'sk-secret-2' },
    });
    process.env.ANTHROPIC_API_KEY = 'env-key';
    const masked = maskConfig(await loadConfig());
    expect(masked.chat.anthropicApiKey).toBe(true);
    expect(masked.embeddings.apiKey).toBe(true);
    expect(JSON.stringify(masked)).not.toContain('sk-secret');
    expect(masked.envOverrides).toContain('ANTHROPIC_API_KEY');
  });

  it('applyConfigToEnv respects existing env (env > config)', async () => {
    await saveConfig({
      chat: { provider: 'anthropic', anthropicApiKey: 'from-config' },
    });
    process.env.ANTHROPIC_API_KEY = 'from-env';
    await applyConfigToEnv();
    expect(process.env.ANTHROPIC_API_KEY).toBe('from-env');
    expect(process.env.LW_AI_PROVIDER).toBe('anthropic');
  });

  it('applyConfigToEnv fills missing env from config', async () => {
    await saveConfig({
      chat: { provider: 'ollama', ollamaHost: 'http://127.0.0.1:11434' },
      embeddings: {
        provider: 'openai-compatible',
        endpoint: 'https://api.openai.com/v1',
        apiKey: 'sk-embed',
        model: 'text-embedding-3-small',
      },
    });
    await applyConfigToEnv();
    expect(process.env.LW_AI_PROVIDER).toBe('ollama');
    expect(process.env.OLLAMA_HOST).toBe('http://127.0.0.1:11434');
    expect(process.env.LOREWEAVE_EMBEDDINGS).toBe('openai-compatible');
    expect(process.env.LOREWEAVE_EMBEDDINGS_API_KEY).toBe('sk-embed');
  });

  it('loadConfig throws on corrupt JSON instead of wiping it', async () => {
    await fs.mkdir(path.join(sandbox, '.loreweave'), { recursive: true });
    await fs.writeFile(
      path.join(sandbox, '.loreweave', 'config.json'),
      '{not json',
      'utf8',
    );
    await expect(loadConfig()).rejects.toThrow(/failed to read/);
  });
});
