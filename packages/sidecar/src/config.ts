/**
 * User-level config for Loreweave (AI providers + keys).
 *
 * Stored at `~/.loreweave/config.json` — outside any Saga so secrets
 * never land in a writer's git repo. Read/write through this module;
 * callers should never touch the file directly.
 *
 * Precedence when resolving effective settings:
 *   1. External process.env (for CI / power users who want to force a value)
 *   2. config file (`~/.loreweave/config.json`)
 *   3. built-in defaults
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const CHAT_PROVIDERS = [
  'anthropic',
  'openai',
  'google',
  'ollama',
  'openrouter',
  'groq',
  'deepseek',
  'mistral',
  'xai',
  'openai-compatible',
] as const;

export type ChatProvider = (typeof CHAT_PROVIDERS)[number];

export const EMBEDDING_PROVIDERS = [
  'ollama',
  'openai',
  'google',
  'openai-compatible',
] as const;

export type EmbeddingsProvider = (typeof EMBEDDING_PROVIDERS)[number];

export interface ChatConfig {
  provider?: ChatProvider;
  model?: string;
  anthropicApiKey?: string;
  openaiApiKey?: string;
  googleApiKey?: string;
  ollamaHost?: string;
  ollamaApiKey?: string;
  openrouterApiKey?: string;
  groqApiKey?: string;
  deepseekApiKey?: string;
  mistralApiKey?: string;
  xaiApiKey?: string;
  customBaseUrl?: string;
  customApiKey?: string;
}

export interface EmbeddingsConfig {
  provider?: EmbeddingsProvider;
  model?: string;
  endpoint?: string;
  apiKey?: string;
}

export interface LoreweaveConfig {
  skin?: string;
  sagaRoot?: string;
  activeSaga?: string;
  activeTomeLens?: string;
  activeSection?: string;
  chat?: ChatConfig;
  embeddings?: EmbeddingsConfig;
}

/** Safe-for-UI view: API keys replaced with `true`/`false` booleans. */
export interface MaskedConfig {
  skin?: string;
  sagaRoot?: string;
  activeSaga?: string;
  activeTomeLens?: string;
  activeSection?: string;
  chat: {
    provider?: ChatProvider;
    model?: string;
    anthropicApiKey: boolean;
    openaiApiKey: boolean;
    googleApiKey: boolean;
    ollamaHost?: string;
    ollamaApiKey: boolean;
    openrouterApiKey: boolean;
    groqApiKey: boolean;
    deepseekApiKey: boolean;
    mistralApiKey: boolean;
    xaiApiKey: boolean;
    customBaseUrl?: string;
    customApiKey: boolean;
  };
  embeddings: {
    provider?: EmbeddingsProvider;
    model?: string;
    endpoint?: string;
    apiKey: boolean;
  };
  /** Which external env overrides are currently active (names only, never values). */
  envOverrides: string[];
  /** Absolute path of the config file on this machine. */
  path: string;
}

const CHAT_STRING_KEYS = [
  'model',
  'anthropicApiKey',
  'openaiApiKey',
  'googleApiKey',
  'ollamaHost',
  'ollamaApiKey',
  'openrouterApiKey',
  'groqApiKey',
  'deepseekApiKey',
  'mistralApiKey',
  'xaiApiKey',
  'customBaseUrl',
  'customApiKey',
] as const;

const TRACKED_ENV_NAMES = [
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
] as const;

/**
 * Tracks exact key/value pairs written into `process.env` by `applyConfigToEnv()`.
 * This lets us distinguish config-managed env vars (which must update or clear
 * when the user edits Settings in the UI) from external env vars set by the
 * launching shell or CI.
 */
const appliedEnvValues = new Map<string, string>();

function isExternalEnvOverride(name: string): boolean {
  const current = process.env[name];
  if (!current) return false;
  if (!appliedEnvValues.has(name)) return true;
  return current !== appliedEnvValues.get(name);
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

const TOP_STRING_KEYS = [
  'skin',
  'sagaRoot',
  'activeSaga',
  'activeTomeLens',
  'activeSection',
] as const;

type TopStringKey = (typeof TOP_STRING_KEYS)[number];

/**
 * Merge a partial patch into the existing config. Keys set to `null` or `""`
 * are deleted; keys omitted are left untouched.
 */
export async function patchConfig(
  patch: Partial<{
    skin: string | null;
    sagaRoot: string | null;
    activeSaga: string | null;
    activeTomeLens: string | null;
    activeSection: string | null;
    chat: Partial<Record<keyof ChatConfig, string | null>>;
    embeddings: Partial<Record<keyof EmbeddingsConfig, string | null>>;
  }>,
): Promise<LoreweaveConfig> {
  const current = await loadConfig();
  const next: LoreweaveConfig = {
    skin: current.skin,
    sagaRoot: current.sagaRoot,
    activeSaga: current.activeSaga,
    activeTomeLens: current.activeTomeLens,
    activeSection: current.activeSection,
    chat: { ...current.chat },
    embeddings: { ...current.embeddings },
  };
  for (const key of TOP_STRING_KEYS) {
    const val = patch[key as TopStringKey];
    if (val === null || val === '') {
      delete next[key];
    } else if (typeof val === 'string') {
      const trimmed = val.trim();
      if (!trimmed) delete next[key];
      else next[key] = trimmed;
    }
  }
  if (patch.chat) {
    for (const [k, v] of Object.entries(patch.chat)) {
      const key = k as keyof ChatConfig;
      if (v === null || v === '') delete next.chat![key];
      else if (typeof v === 'string') {
        const trimmed = v.trim();
        if (!trimmed) delete next.chat![key];
        else (next.chat as Record<string, unknown>)[key] = trimmed;
      }
    }
  }
  if (patch.embeddings) {
    for (const [k, v] of Object.entries(patch.embeddings)) {
      const key = k as keyof EmbeddingsConfig;
      if (v === null || v === '') delete next.embeddings![key];
      else if (typeof v === 'string') {
        const trimmed = v.trim();
        if (!trimmed) delete next.embeddings![key];
        else (next.embeddings as Record<string, unknown>)[key] = trimmed;
      }
    }
  }
  const clean = sanitize(next);
  await saveConfig(clean);
  return clean;
}

/** Produce a key-free view safe to ship to the web UI. */
export function maskConfig(cfg: LoreweaveConfig): MaskedConfig {
  const envOverrides: string[] = [];
  for (const name of TRACKED_ENV_NAMES) {
    if (isExternalEnvOverride(name)) envOverrides.push(name);
  }
  return {
    skin: cfg.skin,
    sagaRoot: cfg.sagaRoot,
    activeSaga: cfg.activeSaga,
    activeTomeLens: cfg.activeTomeLens,
    activeSection: cfg.activeSection,
    chat: {
      provider: cfg.chat?.provider,
      model: cfg.chat?.model,
      anthropicApiKey: !!cfg.chat?.anthropicApiKey,
      openaiApiKey: !!cfg.chat?.openaiApiKey,
      googleApiKey: !!cfg.chat?.googleApiKey,
      ollamaHost: cfg.chat?.ollamaHost,
      ollamaApiKey: !!cfg.chat?.ollamaApiKey,
      openrouterApiKey: !!cfg.chat?.openrouterApiKey,
      groqApiKey: !!cfg.chat?.groqApiKey,
      deepseekApiKey: !!cfg.chat?.deepseekApiKey,
      mistralApiKey: !!cfg.chat?.mistralApiKey,
      xaiApiKey: !!cfg.chat?.xaiApiKey,
      customBaseUrl: cfg.chat?.customBaseUrl,
      customApiKey: !!cfg.chat?.customApiKey,
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

function syncEnvVar(envName: string, configValue: string | undefined): void {
  if (isExternalEnvOverride(envName)) return;
  if (configValue) {
    process.env[envName] = configValue;
    appliedEnvValues.set(envName, configValue);
  } else if (appliedEnvValues.has(envName)) {
    delete process.env[envName];
    appliedEnvValues.delete(envName);
  }
}

/**
 * Resolve effective AI settings: external env wins, then config, then nothing.
 * Mutates `process.env` so downstream code (`model.ts`, `embeddings.ts`, SDK
 * clients) picks them up transparently, while allowing UI updates to overwrite
 * or clear config-managed values.
 */
export async function applyConfigToEnv(): Promise<void> {
  const cfg = await loadConfig();
  const c = cfg.chat ?? {};
  const e = cfg.embeddings ?? {};

  const mappings: Array<[string, string | undefined]> = [
    ['LW_AI_PROVIDER', c.provider],
    ['LW_AI_MODEL', c.model],
    ['ANTHROPIC_API_KEY', c.anthropicApiKey],
    ['OPENAI_API_KEY', c.openaiApiKey],
    ['GEMINI_API_KEY', c.googleApiKey],
    ['OLLAMA_HOST', c.ollamaHost],
    ['OLLAMA_API_KEY', c.ollamaApiKey],
    ['OPENROUTER_API_KEY', c.openrouterApiKey],
    ['GROQ_API_KEY', c.groqApiKey],
    ['DEEPSEEK_API_KEY', c.deepseekApiKey],
    ['MISTRAL_API_KEY', c.mistralApiKey],
    ['XAI_API_KEY', c.xaiApiKey],
    ['OPENAI_BASE_URL', c.customBaseUrl],
    ['OPENAI_COMPATIBLE_API_KEY', c.customApiKey],
    ['LOREWEAVE_EMBEDDINGS', e.provider],
    ['LOREWEAVE_EMBEDDINGS_MODEL', e.model],
    ['LOREWEAVE_EMBEDDINGS_ENDPOINT', e.endpoint],
    ['LOREWEAVE_EMBEDDINGS_API_KEY', e.apiKey],
  ];

  for (const [envName, val] of mappings) {
    syncEnvVar(envName, val);
  }
}

function sanitize(cfg: LoreweaveConfig): LoreweaveConfig {
  const out: LoreweaveConfig = {};
  for (const key of TOP_STRING_KEYS) {
    const val = cfg[key];
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (trimmed) out[key] = trimmed;
    }
  }
  if (cfg.chat && typeof cfg.chat === 'object') {
    const c: ChatConfig = {};
    if (
      typeof cfg.chat.provider === 'string' &&
      (CHAT_PROVIDERS as readonly string[]).includes(cfg.chat.provider)
    ) {
      c.provider = cfg.chat.provider as ChatProvider;
    }
    for (const k of CHAT_STRING_KEYS) {
      const v = cfg.chat[k];
      if (typeof v === 'string') {
        const trimmed = v.trim();
        if (trimmed) c[k] = trimmed;
      }
    }
    out.chat = c;
  }
  if (cfg.embeddings && typeof cfg.embeddings === 'object') {
    const e: EmbeddingsConfig = {};
    if (
      typeof cfg.embeddings.provider === 'string' &&
      (EMBEDDING_PROVIDERS as readonly string[]).includes(
        cfg.embeddings.provider,
      )
    ) {
      e.provider = cfg.embeddings.provider as EmbeddingsProvider;
    }
    for (const k of ['model', 'endpoint', 'apiKey'] as const) {
      const v = cfg.embeddings[k];
      if (typeof v === 'string') {
        const trimmed = v.trim();
        if (trimmed) e[k] = trimmed;
      }
    }
    out.embeddings = e;
  }
  return out;
}

export { configPath };
