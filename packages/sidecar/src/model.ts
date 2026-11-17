/**
 * LLM provider resolution and live model discovery.
 *
 * Settings come from two sources, in order of precedence:
 *   1. External environment variables (for CI / power users)
 *   2. The user config file at `~/.loreweave/config.json`
 *      (managed from the web UI's Settings dialog; applied to
 *      `process.env` at sidecar startup and on save by `applyConfigToEnv()`).
 */
import type { ChatProvider } from './config.js';

export interface ModelDescriptor {
  id: string;
  name: string;
  description?: string;
  capability?: 'chat' | 'embedding';
  recommended?: boolean;
}

export interface ProviderMeta {
  id: ChatProvider;
  label: string;
  kind: 'cloud' | 'local';
  defaultModel: string;
  defaultEmbeddingModel?: string;
  baseUrl?: string;
  models: ModelDescriptor[];
  embeddingModels: ModelDescriptor[];
}

export interface DiscoverModelsOptions {
  provider: ChatProvider;
  apiKey?: string;
  ollamaHost?: string;
  ollamaApiKey?: string;
  baseUrl?: string;
}

export interface ModelsDiscoveryResult {
  provider: ChatProvider;
  source: 'live' | 'curated';
  connected: boolean;
  models: ModelDescriptor[];
  embeddingModels: ModelDescriptor[];
  defaultModel: string;
  defaultEmbeddingModel?: string;
  resolvedEndpoint?: string;
  error?: string;
}

const DISCOVERY_TIMEOUT_MS = 6000;

export const PROVIDER_CATALOG: Record<ChatProvider, ProviderMeta> = {
  google: {
    id: 'google',
    label: 'Google Gemini (AI Studio)',
    kind: 'cloud',
    defaultModel: 'gemini-2.5-flash',
    defaultEmbeddingModel: 'gemini-embedding-001',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    models: [
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Fast & versatile', recommended: true },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: 'Deep reasoning & prose', recommended: true },
      { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite', description: 'Lightweight & economical' },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: 'Previous generation fast model' },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: 'Long-context legacy model' },
    ],
    embeddingModels: [
      { id: 'gemini-embedding-001', name: 'gemini-embedding-001', capability: 'embedding', recommended: true },
      { id: 'text-embedding-004', name: 'text-embedding-004', capability: 'embedding' },
    ],
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    kind: 'cloud',
    defaultModel: 'claude-sonnet-4-20250514',
    models: [
      { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5', description: 'Balanced intelligence & speed', recommended: true },
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', description: 'Strong writing & tool use', recommended: true },
      { id: 'claude-opus-4-1-20250805', name: 'Claude Opus 4.1', description: 'Highest capability' },
      { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', description: 'Fast & low-cost' },
      { id: 'claude-3-5-sonnet-latest', name: 'Claude 3.5 Sonnet', description: 'Legacy Sonnet alias' },
    ],
    embeddingModels: [],
  },
  openai: {
    id: 'openai',
    label: 'OpenAI (GPT / Reasoning)',
    kind: 'cloud',
    defaultModel: 'gpt-4o-mini',
    defaultEmbeddingModel: 'text-embedding-3-small',
    baseUrl: 'https://api.openai.com/v1',
    models: [
      { id: 'gpt-4o-mini', name: 'GPT-4o mini', description: 'Fast & affordable default', recommended: true },
      { id: 'gpt-4.1', name: 'GPT-4.1', description: 'Flagship non-reasoning model', recommended: true },
      { id: 'gpt-4.1-mini', name: 'GPT-4.1 mini', description: 'Fast & capable' },
      { id: 'gpt-4o', name: 'GPT-4o', description: 'Multimodal generalist' },
      { id: 'o4-mini', name: 'o4-mini', description: 'Fast reasoning model' },
      { id: 'o3', name: 'o3', description: 'Deep reasoning model' },
    ],
    embeddingModels: [
      { id: 'text-embedding-3-small', name: 'text-embedding-3-small', capability: 'embedding', recommended: true },
      { id: 'text-embedding-3-large', name: 'text-embedding-3-large', capability: 'embedding' },
      { id: 'text-embedding-ada-002', name: 'text-embedding-ada-002', capability: 'embedding' },
    ],
  },
  ollama: {
    id: 'ollama',
    label: 'Ollama (Local / Remote / Cloud)',
    kind: 'local',
    defaultModel: 'llama3.1',
    defaultEmbeddingModel: 'nomic-embed-text',
    baseUrl: 'http://127.0.0.1:11434',
    models: [
      { id: 'llama3.1', name: 'Llama 3.1', description: 'General purpose local model' },
      { id: 'llama3.2', name: 'Llama 3.2', description: 'Compact local model' },
      { id: 'qwen3:8b', name: 'Qwen 3 8B', description: 'Strong multilingual & tool use' },
      { id: 'gemma3:12b', name: 'Gemma 3 12B', description: 'Google open weights' },
      { id: 'mistral', name: 'Mistral', description: 'Fast 7B local model' },
      { id: 'deepseek-r1:8b', name: 'DeepSeek R1 8B', description: 'Local reasoning' },
    ],
    embeddingModels: [
      { id: 'nomic-embed-text', name: 'nomic-embed-text', capability: 'embedding', recommended: true },
      { id: 'mxbai-embed-large', name: 'mxbai-embed-large', capability: 'embedding' },
      { id: 'all-minilm', name: 'all-minilm', capability: 'embedding' },
      { id: 'snowflake-arctic-embed', name: 'snowflake-arctic-embed', capability: 'embedding' },
    ],
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter (300+ Models)',
    kind: 'cloud',
    defaultModel: 'google/gemini-2.5-flash',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: [
      { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Fast via OpenRouter', recommended: true },
      { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', description: 'Anthropic via OpenRouter' },
      { id: 'openai/gpt-4.1-mini', name: 'GPT-4.1 mini', description: 'OpenAI via OpenRouter' },
      { id: 'deepseek/deepseek-chat-v3-0324:free', name: 'DeepSeek V3 (Free)', description: 'Free tier' },
      { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B (Free)', description: 'Free tier' },
    ],
    embeddingModels: [],
  },
  groq: {
    id: 'groq',
    label: 'Groq (Ultra-Fast Inference)',
    kind: 'cloud',
    defaultModel: 'llama-3.3-70b-versatile',
    baseUrl: 'https://api.groq.com/openai/v1',
    models: [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile', description: 'Fast flagship', recommended: true },
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant', description: 'Sub-second responses' },
      { id: 'deepseek-r1-distill-llama-70b', name: 'DeepSeek R1 Distill 70B', description: 'Fast reasoning' },
      { id: 'qwen-qwq-32b', name: 'Qwen QwQ 32B', description: 'Reasoning model' },
    ],
    embeddingModels: [],
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    kind: 'cloud',
    defaultModel: 'deepseek-chat',
    baseUrl: 'https://api.deepseek.com/v1',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat (V3)', description: 'General purpose & tool calling', recommended: true },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner (R1)', description: 'Step-by-step reasoning' },
    ],
    embeddingModels: [],
  },
  mistral: {
    id: 'mistral',
    label: 'Mistral AI',
    kind: 'cloud',
    defaultModel: 'mistral-small-latest',
    defaultEmbeddingModel: 'mistral-embed',
    baseUrl: 'https://api.mistral.ai/v1',
    models: [
      { id: 'mistral-small-latest', name: 'Mistral Small', description: 'Fast & economical', recommended: true },
      { id: 'mistral-large-latest', name: 'Mistral Large', description: 'Flagship model' },
      { id: 'open-mistral-nemo', name: 'Mistral Nemo', description: 'Compact 12B model' },
    ],
    embeddingModels: [
      { id: 'mistral-embed', name: 'mistral-embed', capability: 'embedding', recommended: true },
    ],
  },
  xai: {
    id: 'xai',
    label: 'xAI (Grok)',
    kind: 'cloud',
    defaultModel: 'grok-3-mini',
    baseUrl: 'https://api.x.ai/v1',
    models: [
      { id: 'grok-3-mini', name: 'Grok 3 Mini', description: 'Fast & capable', recommended: true },
      { id: 'grok-3', name: 'Grok 3', description: 'Flagship model' },
      { id: 'grok-2-latest', name: 'Grok 2', description: 'Previous generation' },
    ],
    embeddingModels: [],
  },
  'openai-compatible': {
    id: 'openai-compatible',
    label: 'Custom OpenAI-Compatible (LM Studio / vLLM / llama.cpp)',
    kind: 'local',
    defaultModel: 'local-model',
    defaultEmbeddingModel: 'text-embedding-3-small',
    baseUrl: 'http://127.0.0.1:1234/v1',
    models: [
      { id: 'local-model', name: 'local-model', description: 'Default server model' },
    ],
    embeddingModels: [
      { id: 'text-embedding-3-small', name: 'text-embedding-3-small', capability: 'embedding' },
    ],
  },
};

/**
 * Normalize an Ollama server URL to its bare origin/base without trailing
 * slashes or `/api` / `/v1` path suffixes.
 */
export function normalizeOllamaBase(host?: string): string {
  const trimmed = (host ?? '').trim();
  if (!trimmed) return 'http://127.0.0.1:11434';
  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `http://${trimmed}`;
  return withScheme
    .replace(/\/+$/, '')
    .replace(/\/(?:api|v1)$/i, '')
    .replace(/\/+$/, '');
}

/** Resolve the Google Gemini API key from common env variable conventions. */
export function getGoogleApiKey(): string | undefined {
  return (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    undefined
  );
}

/** Determine the active chat provider from `LW_AI_PROVIDER` or configured keys/hosts. */
export function detectActiveProvider(): ChatProvider | undefined {
  const explicit = process.env.LW_AI_PROVIDER?.toLowerCase().trim();
  if (explicit) return explicit as ChatProvider;
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (getGoogleApiKey()) return 'google';
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.OPENROUTER_API_KEY) return 'openrouter';
  if (process.env.GROQ_API_KEY) return 'groq';
  if (process.env.DEEPSEEK_API_KEY) return 'deepseek';
  if (process.env.MISTRAL_API_KEY) return 'mistral';
  if (process.env.XAI_API_KEY) return 'xai';
  if (process.env.OPENAI_BASE_URL) return 'openai-compatible';
  if (process.env.OLLAMA_HOST || process.env.OLLAMA_API_KEY) return 'ollama';
  return undefined;
}

/** Resolve the configured AI SDK LanguageModel instance for `/lw/chat`. */
export async function resolveModel() {
  const provider = detectActiveProvider();
  if (!provider) {
    throw new Error(
      'No LLM provider configured. Open Settings -> AI Engine & Models, or set an API key / OLLAMA_HOST in the environment.',
    );
  }

  const explicitModel = process.env.LW_AI_MODEL?.trim() || undefined;

  if (provider === 'anthropic') {
    const { createAnthropic } = await import('@ai-sdk/anthropic');
    const client = createAnthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    return client(explicitModel ?? PROVIDER_CATALOG.anthropic.defaultModel);
  }

  if (provider === 'openai') {
    const { createOpenAI } = await import('@ai-sdk/openai');
    const client = createOpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    return client(explicitModel ?? PROVIDER_CATALOG.openai.defaultModel);
  }

  if (provider === 'google') {
    const { createOpenAI } = await import('@ai-sdk/openai');
    const client = createOpenAI({
      name: 'google',
      baseURL: PROVIDER_CATALOG.google.baseUrl,
      apiKey: getGoogleApiKey(),
    });
    const modelId = (
      explicitModel ?? PROVIDER_CATALOG.google.defaultModel
    ).replace(/^models\//, '');
    return client.chat(modelId);
  }

  if (provider === 'ollama') {
    const base = normalizeOllamaBase(process.env.OLLAMA_HOST);
    const apiKey = process.env.OLLAMA_API_KEY?.trim() || undefined;
    const modelId = explicitModel ?? PROVIDER_CATALOG.ollama.defaultModel;
    // `ollama-ai-provider-v2` is an optional runtime dependency compatible with
    // AI SDK v5. Fall back to Ollama's OpenAI-compatible `/v1` endpoint if
    // the package isn't installed.
    try {
      const mod = (await import('ollama-ai-provider-v2')) as unknown as {
        createOllama: (opts: {
          baseURL: string;
          headers?: Record<string, string>;
        }) => (model: string) => unknown;
      };
      const ollama = mod.createOllama({
        baseURL: `${base}/api`,
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
      });
      return ollama(modelId);
    } catch {
      const { createOpenAI } = await import('@ai-sdk/openai');
      const client = createOpenAI({
        name: 'ollama',
        baseURL: `${base}/v1`,
        apiKey: apiKey ?? 'ollama',
      });
      return client.chat(modelId);
    }
  }

  if (provider === 'openrouter') {
    const { createOpenAI } = await import('@ai-sdk/openai');
    const client = createOpenAI({
      name: 'openrouter',
      baseURL: PROVIDER_CATALOG.openrouter.baseUrl,
      apiKey: process.env.OPENROUTER_API_KEY,
      headers: {
        'HTTP-Referer': 'https://loreweave.local',
        'X-Title': 'Loreweave',
      },
    });
    return client.chat(
      explicitModel ?? PROVIDER_CATALOG.openrouter.defaultModel,
    );
  }

  if (provider === 'groq') {
    const { createOpenAI } = await import('@ai-sdk/openai');
    const client = createOpenAI({
      name: 'groq',
      baseURL: PROVIDER_CATALOG.groq.baseUrl,
      apiKey: process.env.GROQ_API_KEY,
    });
    return client.chat(explicitModel ?? PROVIDER_CATALOG.groq.defaultModel);
  }

  if (provider === 'deepseek') {
    const { createOpenAI } = await import('@ai-sdk/openai');
    const client = createOpenAI({
      name: 'deepseek',
      baseURL: PROVIDER_CATALOG.deepseek.baseUrl,
      apiKey: process.env.DEEPSEEK_API_KEY,
    });
    return client.chat(explicitModel ?? PROVIDER_CATALOG.deepseek.defaultModel);
  }

  if (provider === 'mistral') {
    const { createOpenAI } = await import('@ai-sdk/openai');
    const client = createOpenAI({
      name: 'mistral',
      baseURL: PROVIDER_CATALOG.mistral.baseUrl,
      apiKey: process.env.MISTRAL_API_KEY,
    });
    return client.chat(explicitModel ?? PROVIDER_CATALOG.mistral.defaultModel);
  }

  if (provider === 'xai') {
    const { createOpenAI } = await import('@ai-sdk/openai');
    const client = createOpenAI({
      name: 'xai',
      baseURL: PROVIDER_CATALOG.xai.baseUrl,
      apiKey: process.env.XAI_API_KEY,
    });
    return client.chat(explicitModel ?? PROVIDER_CATALOG.xai.defaultModel);
  }

  if (provider === 'openai-compatible') {
    const { createOpenAI } = await import('@ai-sdk/openai');
    const baseURL = (
      process.env.OPENAI_BASE_URL?.trim() ||
      PROVIDER_CATALOG['openai-compatible'].baseUrl!
    ).replace(/\/+$/, '');
    const client = createOpenAI({
      name: 'openai-compatible',
      baseURL,
      apiKey:
        process.env.OPENAI_COMPATIBLE_API_KEY ||
        process.env.OPENAI_API_KEY ||
        'no-key-required',
    });
    return client.chat(
      explicitModel ?? PROVIDER_CATALOG['openai-compatible'].defaultModel,
    );
  }

  throw new Error(`Unknown LW_AI_PROVIDER: ${provider}`);
}

// ---------- live model discovery -------------------------------------------

const EMBEDDING_ID_RE = /embed|minilm|bge-|mxbai|arctic-embed|nomic/i;

function isEmbeddingModelId(id: string): boolean {
  return EMBEDDING_ID_RE.test(id);
}

async function fetchJsonWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = DISCOVERY_TIMEOUT_MS,
): Promise<{ ok: boolean; status: number; data: unknown; text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    return { ok: res.ok, status: res.status, data, text };
  } finally {
    clearTimeout(timer);
  }
}

function curatedResult(
  provider: ChatProvider,
  opts: { resolvedEndpoint?: string; error?: string } = {},
): ModelsDiscoveryResult {
  const meta = PROVIDER_CATALOG[provider];
  return {
    provider,
    source: 'curated',
    connected: false,
    models: meta.models,
    embeddingModels: meta.embeddingModels,
    defaultModel: meta.defaultModel,
    defaultEmbeddingModel: meta.defaultEmbeddingModel,
    resolvedEndpoint: opts.resolvedEndpoint ?? meta.baseUrl,
    ...(opts.error ? { error: opts.error } : {}),
  };
}

function formatByteSize(bytes?: number): string | undefined {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) {
    return undefined;
  }
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${Math.round(mb)} MB`;
}

function parseOpenAIStyleModels(
  data: unknown,
  provider: ChatProvider,
): { chat: ModelDescriptor[]; embedding: ModelDescriptor[] } {
  const rawList = Array.isArray(data)
    ? data
    : Array.isArray((data as { data?: unknown })?.data)
      ? ((data as { data: unknown[] }).data)
      : [];

  const chat: ModelDescriptor[] = [];
  const embedding: ModelDescriptor[] = [];
  const seen = new Set<string>();

  for (const item of rawList) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as {
      id?: unknown;
      name?: unknown;
      context_length?: unknown;
      pricing?: { prompt?: string; completion?: string };
    };
    const id = typeof rec.id === 'string' ? rec.id.trim() : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);

    if (provider === 'openai') {
      if (isEmbeddingModelId(id) || id.startsWith('text-embedding-')) {
        embedding.push({
          id,
          name: id,
          capability: 'embedding',
          recommended: id === 'text-embedding-3-small',
        });
        continue;
      }
      if (
        /whisper|tts|dall-e|moderation|babbage|davinci|audio|realtime|sora|transcribe|gpt-image/i.test(
          id,
        )
      ) {
        continue;
      }
    } else if (isEmbeddingModelId(id)) {
      embedding.push({
        id,
        name: typeof rec.name === 'string' && rec.name ? rec.name : id,
        capability: 'embedding',
      });
      continue;
    }

    const parts: string[] = [];
    if (
      typeof rec.context_length === 'number' &&
      Number.isFinite(rec.context_length) &&
      rec.context_length > 0
    ) {
      parts.push(`${Math.round(rec.context_length / 1024)}k ctx`);
    }
    if (rec.pricing?.prompt === '0' && rec.pricing?.completion === '0') {
      parts.push('free');
    }
    chat.push({
      id,
      name: typeof rec.name === 'string' && rec.name ? rec.name : id,
      description: parts.length > 0 ? parts.join(' · ') : undefined,
      capability: 'chat',
    });
  }

  if (provider === 'openai') {
    const priority = ['gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'o4-mini', 'o3'];
    chat.sort((a, b) => {
      const ai = priority.indexOf(a.id);
      const bi = priority.indexOf(b.id);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.id.localeCompare(b.id);
    });
    for (const m of chat) {
      if (m.id === 'gpt-4o-mini' || m.id === 'gpt-4.1') m.recommended = true;
    }
  } else if (provider === 'openrouter') {
    const priority = [
      'google/gemini-2.5-flash',
      'google/gemini-2.5-pro',
      'anthropic/claude-sonnet-4',
      'openai/gpt-4.1-mini',
    ];
    chat.sort((a, b) => {
      const ai = priority.indexOf(a.id);
      const bi = priority.indexOf(b.id);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      const aFree = a.id.endsWith(':free') ? 0 : 1;
      const bFree = b.id.endsWith(':free') ? 0 : 1;
      if (aFree !== bFree) return aFree - bFree;
      return a.id.localeCompare(b.id);
    });
  } else {
    chat.sort((a, b) => a.id.localeCompare(b.id));
  }

  return { chat, embedding };
}

async function discoverOllamaModels(
  opts: DiscoverModelsOptions,
): Promise<ModelsDiscoveryResult> {
  const apiKey = opts.ollamaApiKey?.trim() || opts.apiKey?.trim() || process.env.OLLAMA_API_KEY?.trim();
  const explicitHost = opts.ollamaHost?.trim() || process.env.OLLAMA_HOST?.trim();

  const candidates = explicitHost
    ? [normalizeOllamaBase(explicitHost)]
    : apiKey
      ? ['http://127.0.0.1:11434', 'https://ollama.com']
      : ['http://127.0.0.1:11434'];

  const headers: Record<string, string> = apiKey
    ? { Authorization: `Bearer ${apiKey}` }
    : {};

  let lastError = 'Could not reach Ollama server';

  for (const base of candidates) {
    try {
      const tagsRes = await fetchJsonWithTimeout(`${base}/api/tags`, { headers });
      if (
        tagsRes.ok &&
        tagsRes.data &&
        typeof tagsRes.data === 'object' &&
        Array.isArray((tagsRes.data as { models?: unknown }).models)
      ) {
        const rawModels = (
          tagsRes.data as {
            models: Array<{
              name?: string;
              model?: string;
              size?: number;
              details?: {
                parameter_size?: string;
                quantization_level?: string;
              };
            }>;
          }
        ).models;

        const all: ModelDescriptor[] = [];
        const chat: ModelDescriptor[] = [];
        const embedding: ModelDescriptor[] = [];

        for (const m of rawModels) {
          const id = (m.name ?? m.model ?? '').trim();
          if (!id) continue;
          const descParts = [
            m.details?.parameter_size,
            m.details?.quantization_level,
          ].filter((s): s is string => typeof s === 'string' && s.length > 0);
          if (descParts.length === 0) {
            const sizeStr = formatByteSize(m.size);
            if (sizeStr) descParts.push(sizeStr);
          }
          const isEmb = isEmbeddingModelId(id);
          const desc: ModelDescriptor = {
            id,
            name: id,
            description: descParts.length > 0 ? descParts.join(' · ') : undefined,
            capability: isEmb ? 'embedding' : 'chat',
          };
          all.push(desc);
          if (isEmb) embedding.push(desc);
          else chat.push(desc);
        }

        const models = chat.length > 0 ? chat : all;
        const embeddingModels = embedding.length > 0 ? embedding : all;

        return {
          provider: 'ollama',
          source: 'live',
          connected: true,
          models,
          embeddingModels,
          defaultModel: models[0]?.id ?? PROVIDER_CATALOG.ollama.defaultModel,
          defaultEmbeddingModel:
            embeddingModels[0]?.id ??
            PROVIDER_CATALOG.ollama.defaultEmbeddingModel,
          resolvedEndpoint: base,
        };
      }

      // Fallback to OpenAI-compatible `/v1/models` if `/api/tags` isn't available
      // (e.g., certain reverse proxies or Ollama Cloud gateways).
      if (tagsRes.status === 404 || !tagsRes.data) {
        const v1Res = await fetchJsonWithTimeout(`${base}/v1/models`, { headers });
        if (v1Res.ok && v1Res.data) {
          const parsed = parseOpenAIStyleModels(v1Res.data, 'ollama');
          const all = [...parsed.chat, ...parsed.embedding];
          const models = parsed.chat.length > 0 ? parsed.chat : all;
          const embeddingModels =
            parsed.embedding.length > 0 ? parsed.embedding : all;
          return {
            provider: 'ollama',
            source: 'live',
            connected: true,
            models,
            embeddingModels,
            defaultModel: models[0]?.id ?? PROVIDER_CATALOG.ollama.defaultModel,
            defaultEmbeddingModel:
              embeddingModels[0]?.id ??
              PROVIDER_CATALOG.ollama.defaultEmbeddingModel,
            resolvedEndpoint: base,
          };
        }
        lastError = `HTTP ${v1Res.status} from ${base}/v1/models`;
      } else {
        lastError = `HTTP ${tagsRes.status} from ${base}/api/tags`;
      }
    } catch (e) {
      lastError =
        e instanceof Error && e.name === 'AbortError'
          ? `Timed out connecting to ${base}`
          : `${base}: ${(e as Error).message}`;
    }
  }

  return curatedResult('ollama', {
    resolvedEndpoint: candidates[0],
    error: lastError,
  });
}

async function discoverGoogleModels(
  opts: DiscoverModelsOptions,
): Promise<ModelsDiscoveryResult> {
  const apiKey = opts.apiKey?.trim() || getGoogleApiKey();
  if (!apiKey) return curatedResult('google');

  try {
    const res = await fetchJsonWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
    );
    if (!res.ok) {
      const errMsg =
        (res.data as { error?: { message?: string } })?.error?.message ??
        `HTTP ${res.status}`;
      return curatedResult('google', { error: errMsg });
    }
    const rawModels = (
      res.data as {
        models?: Array<{
          name?: string;
          displayName?: string;
          description?: string;
          supportedGenerationMethods?: string[];
        }>;
      }
    )?.models;
    if (!Array.isArray(rawModels)) {
      return curatedResult('google', { error: 'Unexpected Google API response' });
    }

    const chat: ModelDescriptor[] = [];
    const embedding: ModelDescriptor[] = [];

    for (const m of rawModels) {
      const id = (m.name ?? '').replace(/^models\//, '').trim();
      if (!id) continue;
      const methods = m.supportedGenerationMethods ?? [];
      if (methods.includes('embedContent') || isEmbeddingModelId(id)) {
        embedding.push({
          id,
          name: m.displayName ?? id,
          description: m.description,
          capability: 'embedding',
          recommended: id === 'gemini-embedding-001',
        });
        continue;
      }
      if (
        methods.includes('generateContent') &&
        !/^(imagen|veo|aqa)/i.test(id)
      ) {
        chat.push({
          id,
          name: m.displayName ?? id,
          description: m.description,
          capability: 'chat',
          recommended: id === 'gemini-2.5-flash' || id === 'gemini-2.5-pro',
        });
      }
    }

    const rankGoogle = (id: string) => {
      if (id === 'gemini-2.5-flash') return 0;
      if (id === 'gemini-2.5-pro') return 1;
      if (id.startsWith('gemini-2.5')) return 2;
      if (id.startsWith('gemini-2.0')) return 3;
      if (id.startsWith('gemini-1.5')) return 4;
      return 5;
    };
    chat.sort((a, b) => rankGoogle(a.id) - rankGoogle(b.id) || a.id.localeCompare(b.id));

    return {
      provider: 'google',
      source: 'live',
      connected: true,
      models: chat.length > 0 ? chat : PROVIDER_CATALOG.google.models,
      embeddingModels:
        embedding.length > 0 ? embedding : PROVIDER_CATALOG.google.embeddingModels,
      defaultModel: chat[0]?.id ?? PROVIDER_CATALOG.google.defaultModel,
      defaultEmbeddingModel:
        embedding[0]?.id ?? PROVIDER_CATALOG.google.defaultEmbeddingModel,
      resolvedEndpoint: PROVIDER_CATALOG.google.baseUrl,
    };
  } catch (e) {
    return curatedResult('google', { error: (e as Error).message });
  }
}

async function discoverAnthropicModels(
  opts: DiscoverModelsOptions,
): Promise<ModelsDiscoveryResult> {
  const apiKey = opts.apiKey?.trim() || process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return curatedResult('anthropic');

  try {
    const res = await fetchJsonWithTimeout('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    });
    if (!res.ok) {
      const errMsg =
        (res.data as { error?: { message?: string } })?.error?.message ??
        `HTTP ${res.status}`;
      return curatedResult('anthropic', { error: errMsg });
    }
    const rawModels = (
      res.data as {
        data?: Array<{ id?: string; display_name?: string }>;
      }
    )?.data;
    if (!Array.isArray(rawModels)) {
      return curatedResult('anthropic', {
        error: 'Unexpected Anthropic API response',
      });
    }
    const models: ModelDescriptor[] = rawModels
      .filter((m): m is { id: string; display_name?: string } => typeof m.id === 'string' && m.id.length > 0)
      .map((m, i) => ({
        id: m.id,
        name: m.display_name ?? m.id,
        capability: 'chat' as const,
        recommended: i < 2,
      }));

    return {
      provider: 'anthropic',
      source: 'live',
      connected: true,
      models: models.length > 0 ? models : PROVIDER_CATALOG.anthropic.models,
      embeddingModels: [],
      defaultModel: models[0]?.id ?? PROVIDER_CATALOG.anthropic.defaultModel,
      resolvedEndpoint: 'https://api.anthropic.com/v1',
    };
  } catch (e) {
    return curatedResult('anthropic', { error: (e as Error).message });
  }
}

function envKeyForOpenAIStyle(provider: ChatProvider): string | undefined {
  switch (provider) {
    case 'openai':
      return process.env.OPENAI_API_KEY;
    case 'openrouter':
      return process.env.OPENROUTER_API_KEY;
    case 'groq':
      return process.env.GROQ_API_KEY;
    case 'deepseek':
      return process.env.DEEPSEEK_API_KEY;
    case 'mistral':
      return process.env.MISTRAL_API_KEY;
    case 'xai':
      return process.env.XAI_API_KEY;
    case 'openai-compatible':
      return process.env.OPENAI_COMPATIBLE_API_KEY || process.env.OPENAI_API_KEY;
    default:
      return undefined;
  }
}

async function discoverOpenAIStyleModels(
  opts: DiscoverModelsOptions,
): Promise<ModelsDiscoveryResult> {
  const { provider } = opts;
  const meta = PROVIDER_CATALOG[provider];
  const baseUrl = (
    (provider === 'openai-compatible'
      ? opts.baseUrl?.trim() || process.env.OPENAI_BASE_URL?.trim()
      : undefined) ||
    meta.baseUrl ||
    ''
  ).replace(/\/+$/, '');

  const apiKey = opts.apiKey?.trim() || envKeyForOpenAIStyle(provider)?.trim();
  const keyOptional = provider === 'openrouter' || provider === 'openai-compatible';

  if (!baseUrl) {
    return curatedResult(provider, { error: 'Base URL is required' });
  }
  if (!apiKey && !keyOptional) {
    return curatedResult(provider, { resolvedEndpoint: baseUrl });
  }

  try {
    const headers: Record<string, string> = {};
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const res = await fetchJsonWithTimeout(`${baseUrl}/models`, { headers });
    if (!res.ok) {
      const errMsg =
        (res.data as { error?: { message?: string } })?.error?.message ??
        `HTTP ${res.status}`;
      return curatedResult(provider, { resolvedEndpoint: baseUrl, error: errMsg });
    }
    const { chat, embedding } = parseOpenAIStyleModels(res.data, provider);
    const models = chat.length > 0 ? chat : meta.models;
    const embeddingModels =
      embedding.length > 0 ? embedding : meta.embeddingModels;
    return {
      provider,
      source: 'live',
      connected: true,
      models,
      embeddingModels,
      defaultModel: models[0]?.id ?? meta.defaultModel,
      defaultEmbeddingModel: embeddingModels[0]?.id ?? meta.defaultEmbeddingModel,
      resolvedEndpoint: baseUrl,
    };
  } catch (e) {
    return curatedResult(provider, {
      resolvedEndpoint: baseUrl,
      error: (e as Error).message,
    });
  }
}

/**
 * Probe a provider's live model catalog (or fall back to curated defaults when
 * unconfigured or unreachable). Never throws for network/auth failures — instead
 * returns `{ source: 'curated', connected: false, error }`.
 */
export async function discoverModels(
  opts: DiscoverModelsOptions,
): Promise<ModelsDiscoveryResult> {
  const { provider } = opts;
  if (!(provider in PROVIDER_CATALOG)) {
    throw new Error(`Unknown provider: ${provider}`);
  }
  if (provider === 'ollama') return discoverOllamaModels(opts);
  if (provider === 'google') return discoverGoogleModels(opts);
  if (provider === 'anthropic') return discoverAnthropicModels(opts);
  return discoverOpenAIStyleModels(opts);
}
