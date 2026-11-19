import { createServer, type Server } from 'node:http';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  detectActiveProvider,
  discoverModels,
  getModelProfile,
  normalizeOllamaBase,
  resolveModel,
} from '../src/model.js';
import {
  compactChatHistory,
  registerSidecar,
  type MiddlewareHost,
} from '../src/middleware.js';

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
];

let envBackup: Record<string, string | undefined> = {};

beforeEach(() => {
  envBackup = {};
  for (const k of TRACKED_ENV) {
    envBackup[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const k of TRACKED_ENV) {
    const v = envBackup[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('normalizeOllamaBase', () => {
  it('defaults to 127.0.0.1:11434 when blank', () => {
    expect(normalizeOllamaBase()).toBe('http://127.0.0.1:11434');
    expect(normalizeOllamaBase('   ')).toBe('http://127.0.0.1:11434');
  });

  it('strips trailing slashes and /api or /v1 suffixes', () => {
    expect(normalizeOllamaBase('http://localhost:11434/')).toBe(
      'http://localhost:11434',
    );
    expect(normalizeOllamaBase('http://localhost:11434/api/')).toBe(
      'http://localhost:11434',
    );
    expect(normalizeOllamaBase('https://ollama.com/v1')).toBe(
      'https://ollama.com',
    );
  });

  it('prepends http:// when scheme is omitted', () => {
    expect(normalizeOllamaBase('192.168.1.50:11434/api')).toBe(
      'http://192.168.1.50:11434',
    );
  });
});

describe('detectActiveProvider', () => {
  it('prefers explicit LW_AI_PROVIDER', () => {
    process.env.OPENAI_API_KEY = 'sk-oai';
    process.env.LW_AI_PROVIDER = 'google';
    expect(detectActiveProvider()).toBe('google');
  });

  it('auto-detects Google, OpenRouter, Groq, DeepSeek, Mistral, xAI, Custom, Ollama', () => {
    process.env.GEMINI_API_KEY = 'AIza';
    expect(detectActiveProvider()).toBe('google');
    delete process.env.GEMINI_API_KEY;

    process.env.OPENROUTER_API_KEY = 'sk-or';
    expect(detectActiveProvider()).toBe('openrouter');
    delete process.env.OPENROUTER_API_KEY;

    process.env.GROQ_API_KEY = 'gsk';
    expect(detectActiveProvider()).toBe('groq');
    delete process.env.GROQ_API_KEY;

    process.env.DEEPSEEK_API_KEY = 'sk-ds';
    expect(detectActiveProvider()).toBe('deepseek');
    delete process.env.DEEPSEEK_API_KEY;

    process.env.MISTRAL_API_KEY = 'ms';
    expect(detectActiveProvider()).toBe('mistral');
    delete process.env.MISTRAL_API_KEY;

    process.env.XAI_API_KEY = 'xai';
    expect(detectActiveProvider()).toBe('xai');
    delete process.env.XAI_API_KEY;

    process.env.OPENAI_BASE_URL = 'http://127.0.0.1:1234/v1';
    expect(detectActiveProvider()).toBe('openai-compatible');
    delete process.env.OPENAI_BASE_URL;

    process.env.OLLAMA_API_KEY = 'oll';
    expect(detectActiveProvider()).toBe('ollama');
  });
});

describe('resolveModel', () => {
  it('throws when no provider is configured', async () => {
    await expect(resolveModel()).rejects.toThrow(/No LLM provider configured/);
  });

  it('throws on unknown LW_AI_PROVIDER', async () => {
    process.env.LW_AI_PROVIDER = 'unknown-provider';
    await expect(resolveModel()).rejects.toThrow(/Unknown LW_AI_PROVIDER/);
  });

  it('resolves models for every supported provider', async () => {
    const cases: Array<[string, Record<string, string>, string]> = [
      ['anthropic', { ANTHROPIC_API_KEY: 'sk-ant' }, 'claude-sonnet-4-20250514'],
      ['openai', { OPENAI_API_KEY: 'sk-oai' }, 'gpt-4o-mini'],
      ['google', { GEMINI_API_KEY: 'AIza' }, 'gemini-2.5-flash'],
      ['openrouter', { OPENROUTER_API_KEY: 'sk-or' }, 'google/gemini-2.5-flash'],
      ['groq', { GROQ_API_KEY: 'gsk' }, 'llama-3.3-70b-versatile'],
      ['deepseek', { DEEPSEEK_API_KEY: 'sk-ds' }, 'deepseek-chat'],
      ['mistral', { MISTRAL_API_KEY: 'ms' }, 'mistral-small-latest'],
      ['xai', { XAI_API_KEY: 'xai' }, 'grok-3-mini'],
      ['openai-compatible', { OPENAI_BASE_URL: 'http://127.0.0.1:1234/v1' }, 'local-model'],
      ['ollama', { OLLAMA_HOST: 'http://127.0.0.1:11434' }, 'llama3.1'],
    ];
    for (const [provider, env, expectedDefault] of cases) {
      for (const k of TRACKED_ENV) delete process.env[k];
      process.env.LW_AI_PROVIDER = provider;
      Object.assign(process.env, env);
      const model = (await resolveModel()) as { modelId?: string };
      expect(model.modelId).toBe(expectedDefault);
    }
  });

  it('strips models/ prefix for Google models', async () => {
    process.env.LW_AI_PROVIDER = 'google';
    process.env.GEMINI_API_KEY = 'AIza';
    process.env.LW_AI_MODEL = 'models/gemini-2.5-pro';
    const model = (await resolveModel()) as { modelId?: string };
    expect(model.modelId).toBe('gemini-2.5-pro');
  });
});

describe('discoverModels', () => {
  it('discovers Ollama models from /api/tags with Bearer header and splits embedding models', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          models: [
            {
              name: 'qwen3:8b',
              details: { parameter_size: '8.2B', quantization_level: 'Q4_K_M' },
            },
            { name: 'nomic-embed-text:latest', size: 274_000_000 },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await discoverModels({
      provider: 'ollama',
      ollamaHost: 'https://remote-ollama.example.com/api',
      ollamaApiKey: 'oll-secret',
    });

    expect(res.source).toBe('live');
    expect(res.connected).toBe(true);
    expect(res.resolvedEndpoint).toBe('https://remote-ollama.example.com');
    expect(res.models.map((m) => m.id)).toEqual(['qwen3:8b']);
    expect(res.models[0]?.description).toBe('8.2B · Q4_K_M');
    expect(res.embeddingModels.map((m) => m.id)).toEqual([
      'nomic-embed-text:latest',
    ]);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://remote-ollama.example.com/api/tags');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer oll-secret',
    );
  });

  it('falls back to /v1/models when Ollama /api/tags returns 404', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('Not Found', { status: 404 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: [{ id: 'llama3.3:70b' }] }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    const res = await discoverModels({
      provider: 'ollama',
      ollamaHost: 'https://ollama-proxy.example.com',
    });
    expect(res.source).toBe('live');
    expect(res.connected).toBe(true);
    expect(res.models.map((m) => m.id)).toEqual(['llama3.3:70b']);
  });

  it('auto-probes https://ollama.com when ollamaHost is omitted, ollamaApiKey is set, and local fails', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith('http://127.0.0.1:11434')) {
        throw new Error('ECONNREFUSED');
      }
      return new Response(
        JSON.stringify({ models: [{ name: 'deepseek-v3.1:671b-cloud' }] }),
        { status: 200 },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await discoverModels({
      provider: 'ollama',
      ollamaApiKey: 'cloud-key',
    });
    expect(res.source).toBe('live');
    expect(res.resolvedEndpoint).toBe('https://ollama.com');
    expect(res.models.map((m) => m.id)).toEqual(['deepseek-v3.1:671b-cloud']);
  });

  it('returns curated fallback with error when Ollama is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('connect ECONNREFUSED');
      }),
    );

    const res = await discoverModels({
      provider: 'ollama',
      ollamaHost: 'http://127.0.0.1:11434',
    });
    expect(res.source).toBe('curated');
    expect(res.connected).toBe(false);
    expect(res.error).toContain('ECONNREFUSED');
    expect(res.models.length).toBeGreaterThan(0);
  });

  it('discovers Google Gemini models via /v1beta/models and splits embeddings', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          models: [
            {
              name: 'models/gemini-2.0-flash',
              displayName: 'Gemini 2.0 Flash',
              supportedGenerationMethods: ['generateContent'],
            },
            {
              name: 'models/gemini-2.5-pro',
              displayName: 'Gemini 2.5 Pro',
              supportedGenerationMethods: ['generateContent'],
            },
            {
              name: 'models/gemini-embedding-001',
              displayName: 'Gemini Embedding 001',
              supportedGenerationMethods: ['embedContent'],
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await discoverModels({
      provider: 'google',
      apiKey: 'AIza-test',
    });
    expect(res.source).toBe('live');
    expect(res.connected).toBe(true);
    expect(res.models.map((m) => m.id)).toEqual([
      'gemini-2.5-pro',
      'gemini-2.0-flash',
    ]);
    expect(res.embeddingModels.map((m) => m.id)).toEqual([
      'gemini-embedding-001',
    ]);
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models?key=AIza-test',
    );
  });

  it('discovers Anthropic models using x-api-key and anthropic-version headers', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: [
            { id: 'claude-sonnet-4-5-20250929', display_name: 'Claude Sonnet 4.5' },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await discoverModels({
      provider: 'anthropic',
      apiKey: 'sk-ant-test',
    });
    expect(res.source).toBe('live');
    expect(res.models[0]?.id).toBe('claude-sonnet-4-5-20250929');
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)['x-api-key']).toBe(
      'sk-ant-test',
    );
    expect((init.headers as Record<string, string>)['anthropic-version']).toBe(
      '2023-06-01',
    );
  });

  it('discovers OpenAI models, filtering non-chat models and separating embeddings', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [
              { id: 'gpt-4.1' },
              { id: 'whisper-1' },
              { id: 'dall-e-3' },
              { id: 'text-embedding-3-small' },
            ],
          }),
          { status: 200 },
        ),
      ),
    );

    const res = await discoverModels({ provider: 'openai', apiKey: 'sk-oai' });
    expect(res.source).toBe('live');
    expect(res.models.map((m) => m.id)).toEqual(['gpt-4.1']);
    expect(res.embeddingModels.map((m) => m.id)).toEqual([
      'text-embedding-3-small',
    ]);
  });

  it('discovers OpenRouter models without requiring an API key', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                id: 'meta-llama/llama-3.3-70b-instruct:free',
                name: 'Llama 3.3 70B',
                context_length: 131072,
                pricing: { prompt: '0', completion: '0' },
              },
              {
                id: 'anthropic/claude-sonnet-4',
                name: 'Claude Sonnet 4',
                context_length: 200000,
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );

    const res = await discoverModels({ provider: 'openrouter' });
    expect(res.source).toBe('live');
    expect(res.models.map((m) => m.id)).toEqual([
      'anthropic/claude-sonnet-4',
      'meta-llama/llama-3.3-70b-instruct:free',
    ]);
    expect(res.models[1]?.description).toContain('free');
  });
});

describe('sidecar /lw/models endpoint', () => {
  let dir: string;
  let server: Server | null = null;
  let prevHome: string | undefined;
  let prevUserProfile: string | undefined;

  function makeHost(): {
    host: MiddlewareHost;
    server: Server;
    port: Promise<number>;
  } {
    const routes: Array<{
      prefix: string;
      handler: (req: any, res: any) => unknown;
    }> = [];
    const host: MiddlewareHost = {
      use(prefix, handler) {
        routes.push({ prefix, handler });
        return host;
      },
    };
    const srv = createServer((req, res) => {
      const pathname = (req.url ?? '').split('?')[0] ?? '';
      const match = routes
        .filter((r) => pathname === r.prefix || pathname.startsWith(r.prefix + '/'))
        .sort((a, b) => b.prefix.length - a.prefix.length)[0];
      if (!match) {
        res.statusCode = 404;
        res.end('not found');
        return;
      }
      match.handler(req, res);
    });
    const port = new Promise<number>((resolve) => {
      srv.listen(0, '127.0.0.1', () => {
        const addr = srv.address();
        if (addr && typeof addr === 'object') resolve(addr.port);
      });
    });
    return { host, server: srv, port };
  }

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lw-models-http-'));
    prevHome = process.env.HOME;
    prevUserProfile = process.env.USERPROFILE;
    process.env.HOME = dir;
    process.env.USERPROFILE = dir;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = null;
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
    if (prevUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = prevUserProfile;
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('rejects invalid provider with 400 and returns discovery JSON on valid POST', async () => {
    const h = makeHost();
    server = h.server;
    registerSidecar(h.host, { repoRoot: dir, cliBin: '/nonexistent/bin.js' });
    const port = await h.port;

    const bad = await fetch(`http://127.0.0.1:${port}/lw/models?provider=nope`);
    expect(bad.status).toBe(400);

    // Call with a mocked upstream fetch? Note: Node's fetch to localhost:port
    // also goes through global fetch if stubbed, so call directly without
    // stubbing fetch for an unconfigured cloud provider (returns curated fast!).
    const ok = await fetch(`http://127.0.0.1:${port}/lw/models`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'google' }),
    });
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as {
      provider: string;
      source: string;
      models: Array<{ id: string }>;
    };
    expect(body.provider).toBe('google');
    expect(body.source).toBe('curated');
    expect(body.models.some((m) => m.id === 'gemini-2.5-flash')).toBe(true);
  });

  it('serves GET /lw/model-profile with adaptive limits', async () => {
    const h = makeHost();
    server = h.server;
    registerSidecar(h.host, { repoRoot: dir, cliBin: '/nonexistent/bin.js' });
    const port = await h.port;

    const res = await fetch(`http://127.0.0.1:${port}/lw/model-profile`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; profile: { tier: string; maxToolStepsPerTurn: number } };
    expect(body.ok).toBe(true);
    expect(typeof body.profile.tier).toBe('string');
    expect(typeof body.profile.maxToolStepsPerTurn).toBe('number');
  });
});

describe('model capability profiling & context compaction', () => {
  it('accurately profiles compact local models vs frontier high-capacity models', () => {
    const ollamaCompact = getModelProfile('ollama', 'qwen2.5:7b');
    expect(ollamaCompact.tier).toBe('local-compact');
    expect(ollamaCompact.maxToolStepsPerTurn).toBe(6);
    expect(ollamaCompact.recommendedBatchSize).toBe(3);

    const geminiLarge = getModelProfile('google', 'gemini-2.5-pro');
    expect(geminiLarge.tier).toBe('high-capacity');
    expect(geminiLarge.contextWindow).toBeGreaterThanOrEqual(1_000_000);
    expect(geminiLarge.maxToolStepsPerTurn).toBe(35);
    expect(geminiLarge.recommendedBatchSize).toBe(8);

    const claudeStandard = getModelProfile('anthropic', 'claude-3-5-haiku-20241022');
    expect(claudeStandard.tier).toBe('standard');
    expect(claudeStandard.maxToolStepsPerTurn).toBe(15);
  });

  it('compacts earlier chat turns to protect context budget while preserving current prompt', () => {
    const profile = getModelProfile('ollama', 'qwen3:8b');
    const messages = [
      { role: 'user' as const, content: 'A'.repeat(8000) },
      { role: 'assistant' as const, content: 'B'.repeat(8000) },
      { role: 'user' as const, content: 'Please harvest the next 3 items.' },
    ];

    const compacted = compactChatHistory(messages, profile);
    // Last user message must remain untouched
    expect(compacted[compacted.length - 1]!.content).toBe('Please harvest the next 3 items.');
    // Total characters across all compacted messages should be well within the budget
    const totalChars = compacted.reduce((sum, m) => sum + m.content.length, 0);
    expect(totalChars).toBeLessThan(12000);
  });
});
