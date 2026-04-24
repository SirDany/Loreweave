/**
 * Opt-in semantic search backed by local embeddings.
 *
 * Design constraints:
 * - **Local-first and off by default.** Nothing here runs unless the writer
 *   sets `LOREWEAVE_EMBEDDINGS=ollama` (or calls `/lw/embed/build`).
 * - **No native deps.** The index lives in a plain JSON file under
 *   `<sagaRoot>/.loreweave/embeddings/index.json`. For a desktop writer
 *   with a few thousand entries this is plenty; we revisit if it ever
 *   stops being.
 * - **Pluggable provider.** Currently speaks the Ollama HTTP embeddings API
 *   (`POST /api/embeddings`) and any OpenAI-compatible endpoint. Picking
 *   the provider is an explicit caller decision — no magic model selection.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { loadSaga } from '@loreweave/core';

const INDEX_REL = '.loreweave/embeddings/index.json';

export interface EmbedProviderConfig {
  provider: 'ollama' | 'openai-compatible';
  /** Base URL. Defaults: Ollama `http://127.0.0.1:11434`, OAI-compat none. */
  endpoint?: string;
  model: string;
  /** Optional bearer token for OpenAI-compatible providers. */
  apiKey?: string;
}

export interface IndexEntry {
  ref: string;
  kind: 'entry' | 'chapter';
  relPath: string;
  text: string;
  vec: number[];
}

export interface IndexFile {
  schema: 1;
  provider: string;
  model: string;
  builtAt: string;
  entries: IndexEntry[];
}

export interface SearchHit {
  ref: string;
  relPath: string;
  score: number;
  snippet: string;
}

/**
 * Embed one text blob through the configured provider. Returns a flat vector.
 */
export async function embed(
  text: string,
  cfg: EmbedProviderConfig,
): Promise<number[]> {
  if (cfg.provider === 'ollama') {
    const base = cfg.endpoint ?? 'http://127.0.0.1:11434';
    const res = await fetch(`${base.replace(/\/$/, '')}/api/embeddings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: cfg.model, prompt: text }),
    });
    if (!res.ok) {
      throw new Error(`ollama embeddings ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as { embedding?: number[] };
    if (!Array.isArray(data.embedding)) {
      throw new Error('ollama embeddings: missing `embedding` field');
    }
    return data.embedding;
  }
  // OpenAI-compatible.
  if (!cfg.endpoint) {
    throw new Error('openai-compatible provider requires `endpoint`');
  }
  const res = await fetch(
    `${cfg.endpoint.replace(/\/$/, '')}/embeddings`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}),
      },
      body: JSON.stringify({ model: cfg.model, input: text }),
    },
  );
  if (!res.ok) {
    throw new Error(`oai embeddings ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as {
    data?: Array<{ embedding?: number[] }>;
  };
  const v = data.data?.[0]?.embedding;
  if (!Array.isArray(v)) {
    throw new Error('oai embeddings: missing `data[0].embedding`');
  }
  return v;
}

export function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Extract a tidy ~1000 char training text from an entry body. */
function truncate(s: string, max = 1000): string {
  if (s.length <= max) return s;
  return s.slice(0, max);
}

/**
 * Read-only: load a previously built index from disk, or null if absent.
 */
export async function loadIndex(absSagaRoot: string): Promise<IndexFile | null> {
  try {
    const raw = await fs.readFile(path.join(absSagaRoot, INDEX_REL), 'utf8');
    return JSON.parse(raw) as IndexFile;
  } catch {
    return null;
  }
}

/**
 * Rebuild the embeddings index for a Saga. Walks every entry + chapter,
 * embeds its body, persists the index. Returns the freshly built index.
 */
export async function buildIndex(
  absSagaRoot: string,
  cfg: EmbedProviderConfig,
): Promise<IndexFile> {
  const saga = await loadSaga(absSagaRoot);
  const items: Array<{
    ref: string;
    kind: 'entry' | 'chapter';
    relPath: string;
    text: string;
  }> = [];
  for (const e of saga.entries) {
    items.push({
      ref: `@${e.frontmatter.type}/${e.frontmatter.id}`,
      kind: 'entry',
      relPath: e.relPath,
      text: `${e.frontmatter.name ?? e.frontmatter.id}\n\n${e.body ?? ''}`,
    });
  }
  for (const t of saga.tomes) {
    for (const c of t.chapters) {
      items.push({
        ref: `chapter:${t.manifest.id}/${c.slug}`,
        kind: 'chapter',
        relPath: c.relPath,
        text: `${c.meta.title ?? c.slug}\n\n${c.body ?? ''}`,
      });
    }
  }

  const entries: IndexEntry[] = [];
  for (const it of items) {
    const vec = await embed(truncate(it.text), cfg);
    entries.push({ ...it, text: truncate(it.text, 240), vec });
  }
  const idx: IndexFile = {
    schema: 1,
    provider: cfg.provider,
    model: cfg.model,
    builtAt: new Date().toISOString(),
    entries,
  };
  const out = path.join(absSagaRoot, INDEX_REL);
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, JSON.stringify(idx), 'utf8');
  return idx;
}

/**
 * Query the index. Requires the same provider/model used at build time;
 * caller is responsible for passing a consistent config.
 */
export async function searchIndex(
  absSagaRoot: string,
  query: string,
  cfg: EmbedProviderConfig,
  k = 8,
): Promise<SearchHit[]> {
  const idx = await loadIndex(absSagaRoot);
  if (!idx || idx.entries.length === 0) {
    throw new Error(
      'no embeddings index found — build it first with /lw/embed/build',
    );
  }
  if (idx.provider !== cfg.provider || idx.model !== cfg.model) {
    throw new Error(
      `index was built with ${idx.provider}/${idx.model}; rebuild to use ${cfg.provider}/${cfg.model}`,
    );
  }
  const q = await embed(query, cfg);
  const scored = idx.entries.map((e) => ({
    ref: e.ref,
    relPath: e.relPath,
    score: cosine(q, e.vec),
    snippet: e.text.replace(/\s+/g, ' ').trim(),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

/**
 * Read provider config from env. Returns null when embeddings are disabled.
 */
export function providerFromEnv(): EmbedProviderConfig | null {
  const p = process.env.LOREWEAVE_EMBEDDINGS;
  if (!p) return null;
  if (p === 'ollama') {
    return {
      provider: 'ollama',
      endpoint: process.env.LOREWEAVE_EMBEDDINGS_ENDPOINT,
      model: process.env.LOREWEAVE_EMBEDDINGS_MODEL ?? 'nomic-embed-text',
    };
  }
  if (p === 'openai' || p === 'openai-compatible') {
    return {
      provider: 'openai-compatible',
      endpoint: process.env.LOREWEAVE_EMBEDDINGS_ENDPOINT,
      model: process.env.LOREWEAVE_EMBEDDINGS_MODEL ?? 'text-embedding-3-small',
      apiKey: process.env.LOREWEAVE_EMBEDDINGS_API_KEY,
    };
  }
  return null;
}
