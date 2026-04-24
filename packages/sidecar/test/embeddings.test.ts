import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  buildIndex,
  cosine,
  loadIndex,
  providerFromEnv,
} from '../src/embeddings.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const exampleSaga = path.resolve(here, '../../../sagas/example-saga');

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
  const saved = process.env.LOREWEAVE_EMBEDDINGS;
  afterEach(() => {
    if (saved === undefined) delete process.env.LOREWEAVE_EMBEDDINGS;
    else process.env.LOREWEAVE_EMBEDDINGS = saved;
  });

  it('is null when unset', () => {
    delete process.env.LOREWEAVE_EMBEDDINGS;
    expect(providerFromEnv()).toBeNull();
  });
  it('returns ollama config with default model', () => {
    process.env.LOREWEAVE_EMBEDDINGS = 'ollama';
    const cfg = providerFromEnv();
    expect(cfg?.provider).toBe('ollama');
    expect(cfg?.model).toBe('nomic-embed-text');
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
