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
  'GEMINI_API_KEY',
  'GOOGLE_GENERATIVE_AI_API_KEY',
  'GOOGLE_API_KEY',
  'OLLAMA_HOST',
  'OLLAMA_API_KEY',
  'OPENROUTER_API_KEY',
  'GROQ_API_KEY',
  'DEEPSEEK_API_KEY',
  'MISTRAL_API_KEY',
  'XAI_API_KEY',
  'OPENAI_BASE_URL',
  'OPENAI_COMPATIBLE_API_KEY',
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

  it('saveConfig + loadConfig roundtrip preserves values across providers', async () => {
    await saveConfig({
      chat: {
        provider: 'google',
        googleApiKey: 'AIza-test',
        ollamaApiKey: 'ollama-secret',
        openrouterApiKey: 'or-secret',
        model: 'gemini-2.5-flash',
      },
      embeddings: { provider: 'google', model: 'gemini-embedding-001' },
    });
    const cfg = await loadConfig();
    expect(cfg.chat?.provider).toBe('google');
    expect(cfg.chat?.googleApiKey).toBe('AIza-test');
    expect(cfg.chat?.ollamaApiKey).toBe('ollama-secret');
    expect(cfg.chat?.openrouterApiKey).toBe('or-secret');
    expect(cfg.embeddings?.provider).toBe('google');
    expect(cfg.embeddings?.model).toBe('gemini-embedding-001');
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

  it('maskConfig hides API keys and reports only external env overrides', async () => {
    await saveConfig({
      chat: {
        provider: 'google',
        googleApiKey: 'AIza-secret',
        anthropicApiKey: 'sk-secret',
        ollamaApiKey: 'ollama-tok',
      },
      embeddings: { provider: 'ollama', apiKey: 'sk-secret-2' },
    });
    await applyConfigToEnv();
    process.env.ANTHROPIC_API_KEY = 'env-key';
    const masked = maskConfig(await loadConfig());
    expect(masked.chat.googleApiKey).toBe(true);
    expect(masked.chat.anthropicApiKey).toBe(true);
    expect(masked.chat.ollamaApiKey).toBe(true);
    expect(masked.embeddings.apiKey).toBe(true);
    expect(JSON.stringify(masked)).not.toContain('sk-secret');
    expect(JSON.stringify(masked)).not.toContain('AIza-secret');
    expect(JSON.stringify(masked)).not.toContain('ollama-tok');
    expect(masked.envOverrides).toContain('ANTHROPIC_API_KEY');
    expect(masked.envOverrides).not.toContain('GEMINI_API_KEY');
    expect(masked.envOverrides).not.toContain('LW_AI_PROVIDER');
  });

  it('applyConfigToEnv respects existing external env (env > config)', async () => {
    await saveConfig({
      chat: { provider: 'anthropic', anthropicApiKey: 'from-config' },
    });
    process.env.ANTHROPIC_API_KEY = 'from-env';
    await applyConfigToEnv();
    expect(process.env.ANTHROPIC_API_KEY).toBe('from-env');
    expect(process.env.LW_AI_PROVIDER).toBe('anthropic');
  });

  it('applyConfigToEnv updates and clears config-managed env vars across consecutive saves', async () => {
    await saveConfig({
      chat: {
        provider: 'ollama',
        ollamaHost: 'http://127.0.0.1:11434',
        ollamaApiKey: 'tok-1',
        model: 'llama3.1',
      },
    });
    await applyConfigToEnv();
    expect(process.env.LW_AI_PROVIDER).toBe('ollama');
    expect(process.env.OLLAMA_HOST).toBe('http://127.0.0.1:11434');
    expect(process.env.OLLAMA_API_KEY).toBe('tok-1');

    // Update provider & clear ollamaHost + ollamaApiKey
    await patchConfig({
      chat: {
        provider: 'google',
        googleApiKey: 'AIza-new',
        model: 'gemini-2.5-flash',
        ollamaHost: null,
        ollamaApiKey: null,
      },
    });
    await applyConfigToEnv();
    expect(process.env.LW_AI_PROVIDER).toBe('google');
    expect(process.env.LW_AI_MODEL).toBe('gemini-2.5-flash');
    expect(process.env.GEMINI_API_KEY).toBe('AIza-new');
    expect(process.env.OLLAMA_HOST).toBeUndefined();
    expect(process.env.OLLAMA_API_KEY).toBeUndefined();
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
