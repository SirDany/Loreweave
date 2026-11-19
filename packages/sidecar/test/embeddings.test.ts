import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  buildIndex,
  cosine,
  embed,
  loadIndex,
  providerFromEnv,
} from '../src/embeddings.js';

import { existsSync } from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureSaga = path.resolve(here, '../../../fixtures/example-saga');
const exampleSaga = existsSync(fixtureSaga)
  ? fixtureSaga
  : path.resolve(here, '../../../sagas/example-saga');

describe('cosine', () => {
  it('returns 1 for identical unit vectors', () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
  });
  it('returns 0 for orthogonal vectors', () => {
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
  });
  it('returns 0 when either vector is zero', () => {
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });
});

describe('providerFromEnv', () => {
  const TRACKED = [
    'LOREWEAVE_EMBEDDINGS',
    'LOREWEAVE_EMBEDDINGS_ENDPOINT',
    'LOREWEAVE_EMBEDDINGS_MODEL',
    'LOREWEAVE_EMBEDDINGS_API_KEY',
    'OLLAMA_HOST',
    'OLLAMA_API_KEY',
    'OPENAI_API_KEY',
    'GEMINI_API_KEY',
    'OPENAI_BASE_URL',
  ];
  let saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    saved = {};
    for (const k of TRACKED) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of TRACKED) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('is null when unset', () => {
    expect(providerFromEnv()).toBeNull();
  });

  it('returns ollama config with default model and inherits OLLAMA_HOST + OLLAMA_API_KEY', () => {
    process.env.LOREWEAVE_EMBEDDINGS = 'ollama';
    process.env.OLLAMA_HOST = 'https://ollama.example.com';
    process.env.OLLAMA_API_KEY = 'oll-key';
    const cfg = providerFromEnv();
    expect(cfg?.provider).toBe('ollama');
    expect(cfg?.model).toBe('nomic-embed-text');
    expect(cfg?.endpoint).toBe('https://ollama.example.com');
    expect(cfg?.apiKey).toBe('oll-key');
  });

  it('returns google config reusing GEMINI_API_KEY', () => {
    process.env.LOREWEAVE_EMBEDDINGS = 'google';
    process.env.GEMINI_API_KEY = 'AIza-key';
    const cfg = providerFromEnv();
    expect(cfg?.provider).toBe('google');
    expect(cfg?.model).toBe('gemini-embedding-001');
    expect(cfg?.apiKey).toBe('AIza-key');
    expect(cfg?.endpoint).toContain('generativelanguage.googleapis.com');
  });

  it('returns openai config reusing OPENAI_API_KEY', () => {
    process.env.LOREWEAVE_EMBEDDINGS = 'openai';
    process.env.OPENAI_API_KEY = 'sk-openai';
    const cfg = providerFromEnv();
    expect(cfg?.provider).toBe('openai');
    expect(cfg?.model).toBe('text-embedding-3-small');
    expect(cfg?.apiKey).toBe('sk-openai');
  });

  it('returns openai-compatible config inheriting OPENAI_BASE_URL', () => {
    process.env.LOREWEAVE_EMBEDDINGS = 'openai-compatible';
    process.env.OPENAI_BASE_URL = 'http://127.0.0.1:1234/v1';
    const cfg = providerFromEnv();
    expect(cfg?.provider).toBe('openai-compatible');
    expect(cfg?.endpoint).toBe('http://127.0.0.1:1234/v1');
  });
});

describe('embed', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('normalizes Ollama /api suffix and passes Bearer token when apiKey is provided', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ embedding: [0.1, 0.2] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const vec = await embed('hello', {
      provider: 'ollama',
      endpoint: 'https://ollama.com/api/',
      model: 'nomic-embed-text',
      apiKey: 'secret-token',
    });
    expect(vec).toEqual([0.1, 0.2]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://ollama.com/api/embeddings');
    expect((init.headers as Record<string, string>).authorization).toBe(
      'Bearer secret-token',
    );
  });

  it('calls Google OpenAI-compatible embeddings endpoint and strips models/ prefix', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ embedding: [0.5, 0.6] }] }), {
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const vec = await embed('lore text', {
      provider: 'google',
      model: 'models/gemini-embedding-001',
      apiKey: 'AIza-key',
    });
    expect(vec).toEqual([0.5, 0.6]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/openai/embeddings',
    );
    expect(JSON.parse(init.body as string).model).toBe('gemini-embedding-001');
    expect((init.headers as Record<string, string>).authorization).toBe(
      'Bearer AIza-key',
    );
  });
});

describe('buildIndex / loadIndex', () => {
  let dir: string;
  let saga: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'lw-embed-'));
    saga = path.join(dir, 'saga');
    await cp(exampleSaga, saga, { recursive: true });
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('walks entries + chapters and writes a JSON index', async () => {
    // Stub fetch so we don't actually call an embedding service.
    const fakeVec = Array.from({ length: 8 }, (_, i) => i);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ embedding: fakeVec }), { status: 200 }),
      ),
    );

    const idx = await buildIndex(saga, {
      provider: 'ollama',
      model: 'test-model',
    });
    expect(idx.entries.length).toBeGreaterThan(5);
    expect(idx.provider).toBe('ollama');
    expect(idx.model).toBe('test-model');
    expect(idx.entries[0]!.vec).toEqual(fakeVec);

    const reloaded = await loadIndex(saga);
    expect(reloaded?.entries.length).toBe(idx.entries.length);
    expect(reloaded?.entries[0]?.ref).toBe(idx.entries[0]?.ref);
    vi.unstubAllGlobals();
  });
});
