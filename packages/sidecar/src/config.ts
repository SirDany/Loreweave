/**
 * User-level config for Loreweave (AI providers + keys).
 *
 * Stored at `~/.loreweave/config.json` — outside any Saga so secrets
 * never land in a writer's git repo. Read/write through this module;
 * callers should never touch the file directly.
 *
 * Precedence when resolving effective settings:
 *   1. process.env (for CI / power users who want to force a value)
 *   2. config file
 *   3. built-in defaults
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface ChatConfig {
  provider?: 'anthropic' | 'openai' | 'ollama';
  model?: string;
  anthropicApiKey?: string;
  openaiApiKey?: string;
  ollamaHost?: string;
}

export interface EmbeddingsConfig {
  provider?: 'ollama' | 'openai-compatible';
  model?: string;
  endpoint?: string;
  apiKey?: string;
}

export interface LoreweaveConfig {
  chat?: ChatConfig;
  embeddings?: EmbeddingsConfig;
}

/** Safe-for-UI view: API keys replaced with `true`/`false` booleans. */
export interface MaskedConfig {
  chat: {
    provider?: ChatConfig['provider'];
    model?: string;
    anthropicApiKey: boolean;
    openaiApiKey: boolean;
    ollamaHost?: string;
  };
  embeddings: {
    provider?: EmbeddingsConfig['provider'];
    model?: string;
    endpoint?: string;
    apiKey: boolean;
  };
  /** Which env overrides are currently active (names only, never values). */
  envOverrides: string[];
  /** Absolute path of the config file on this machine. */
  path: string;
}

function configPath(): string {
  return path.join(os.homedir(), '.loreweave', 'config.json');
}

export async function loadConfig(): Promise<LoreweaveConfig> {
  try {
    const raw = await fs.readFile(configPath(), 'utf8');
    const parsed = JSON.parse(raw) as LoreweaveConfig;
    return sanitize(parsed);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
    // Corrupt file — surface rather than silently wiping user data.
    throw new Error(
      `failed to read ${configPath()}: ${(err as Error).message}`,
    );
  }
}

export async function saveConfig(cfg: LoreweaveConfig): Promise<void> {
  const p = configPath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  const clean = sanitize(cfg);
  // 0o600 so other users on the machine can't read the keys.
  await fs.writeFile(p, JSON.stringify(clean, null, 2), { mode: 0o600 });
}

/**
 * Merge a partial patch into the existing config. Keys set to `null`
 * are deleted; keys omitted are left untouched.
 */
export async function patchConfig(
  patch: Partial<{
    chat: Partial<Record<keyof ChatConfig, string | null>>;
    embeddings: Partial<Record<keyof EmbeddingsConfig, string | null>>;
  }>,
): Promise<LoreweaveConfig> {
  const current = await loadConfig();
  const next: LoreweaveConfig = {
    chat: { ...current.chat },
    embeddings: { ...current.embeddings },
  };
  if (patch.chat) {
    for (const [k, v] of Object.entries(patch.chat)) {
      const key = k as keyof ChatConfig;
      if (v === null || v === '') delete next.chat![key];
      else (next.chat as Record<string, unknown>)[key] = v;
    }
  }
  if (patch.embeddings) {
    for (const [k, v] of Object.entries(patch.embeddings)) {
      const key = k as keyof EmbeddingsConfig;
      if (v === null || v === '') delete next.embeddings![key];
      else (next.embeddings as Record<string, unknown>)[key] = v;
    }
  }
  await saveConfig(next);
  return next;
}

/** Produce a key-free view safe to ship to the web UI. */
export function maskConfig(cfg: LoreweaveConfig): MaskedConfig {
  const envOverrides: string[] = [];
  for (const name of [
    'LW_AI_PROVIDER',
    'LW_AI_MODEL',
    'ANTHROPIC_API_KEY',
    'OPENAI_API_KEY',
    'OLLAMA_HOST',
    'LOREWEAVE_EMBEDDINGS',
    'LOREWEAVE_EMBEDDINGS_MODEL',
    'LOREWEAVE_EMBEDDINGS_ENDPOINT',
    'LOREWEAVE_EMBEDDINGS_API_KEY',
  ]) {
    if (process.env[name]) envOverrides.push(name);
  }
  return {
    chat: {
      provider: cfg.chat?.provider,
      model: cfg.chat?.model,
      anthropicApiKey: !!cfg.chat?.anthropicApiKey,
      openaiApiKey: !!cfg.chat?.openaiApiKey,
      ollamaHost: cfg.chat?.ollamaHost,
    },
    embeddings: {
      provider: cfg.embeddings?.provider,
      model: cfg.embeddings?.model,
      endpoint: cfg.embeddings?.endpoint,
      apiKey: !!cfg.embeddings?.apiKey,
    },
    envOverrides,
    path: configPath(),
  };
}

/**
 * Resolve effective chat settings: env wins, then config, then nothing.
 * Mutates `process.env` so downstream code (`model.ts`, SDK clients)
 * picks them up without further plumbing.
 */
export async function applyConfigToEnv(): Promise<void> {
  const cfg = await loadConfig();
  const c = cfg.chat ?? {};
  if (c.provider && !process.env.LW_AI_PROVIDER) {
    process.env.LW_AI_PROVIDER = c.provider;
  }
  if (c.model && !process.env.LW_AI_MODEL) {
    process.env.LW_AI_MODEL = c.model;
  }
  if (c.anthropicApiKey && !process.env.ANTHROPIC_API_KEY) {
    process.env.ANTHROPIC_API_KEY = c.anthropicApiKey;
  }
  if (c.openaiApiKey && !process.env.OPENAI_API_KEY) {
    process.env.OPENAI_API_KEY = c.openaiApiKey;
  }
  if (c.ollamaHost && !process.env.OLLAMA_HOST) {
    process.env.OLLAMA_HOST = c.ollamaHost;
  }

  const e = cfg.embeddings ?? {};
  if (e.provider && !process.env.LOREWEAVE_EMBEDDINGS) {
    process.env.LOREWEAVE_EMBEDDINGS = e.provider;
  }
  if (e.model && !process.env.LOREWEAVE_EMBEDDINGS_MODEL) {
    process.env.LOREWEAVE_EMBEDDINGS_MODEL = e.model;
  }
  if (e.endpoint && !process.env.LOREWEAVE_EMBEDDINGS_ENDPOINT) {
    process.env.LOREWEAVE_EMBEDDINGS_ENDPOINT = e.endpoint;
  }
  if (e.apiKey && !process.env.LOREWEAVE_EMBEDDINGS_API_KEY) {
    process.env.LOREWEAVE_EMBEDDINGS_API_KEY = e.apiKey;
  }
}

function sanitize(cfg: LoreweaveConfig): LoreweaveConfig {
  const out: LoreweaveConfig = {};
  if (cfg.chat && typeof cfg.chat === 'object') {
    const c: ChatConfig = {};
    if (
      cfg.chat.provider === 'anthropic' ||
      cfg.chat.provider === 'openai' ||
      cfg.chat.provider === 'ollama'
    ) {
      c.provider = cfg.chat.provider;
    }
    for (const k of [
      'model',
      'anthropicApiKey',
      'openaiApiKey',
      'ollamaHost',
    ] as const) {
      const v = cfg.chat[k];
      if (typeof v === 'string' && v) c[k] = v;
    }
    out.chat = c;
  }
  if (cfg.embeddings && typeof cfg.embeddings === 'object') {
    const e: EmbeddingsConfig = {};
    if (
      cfg.embeddings.provider === 'ollama' ||
      cfg.embeddings.provider === 'openai-compatible'
    ) {
      e.provider = cfg.embeddings.provider;
    }
    for (const k of ['model', 'endpoint', 'apiKey'] as const) {
      const v = cfg.embeddings[k];
      if (typeof v === 'string' && v) e[k] = v;
    }
    out.embeddings = e;
  }
  return out;
}

export { configPath };
