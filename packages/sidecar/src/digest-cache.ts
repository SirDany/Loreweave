/**
 * Canon-digest cache for the sidecar. Builds a compact {@link CanonDigest}
 * from a Saga on first access and stores it under
 * `<sagaRoot>/.loreweave/cache/digest.json`, keyed by a cheap revision
 * token (git HEAD SHA when available, otherwise a content-hash over every
 * entry's `mtime` + `size`).
 *
 * Agents receive the rendered phone book via the system prompt so they can
 * recognize every canonical ref without calling `lw_dump` each turn.
 */
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  buildDigest,
  loadSaga,
  renderPhoneBook,
  type CanonDigest,
} from '@loreweave/core';

const CACHE_REL = '.loreweave/cache/digest.json';

interface CacheRecord {
  revision: string;
  digest: CanonDigest;
}

function runGit(cwd: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      'git',
      args,
      { cwd, encoding: 'utf8', windowsHide: true, maxBuffer: 1024 * 1024 },
      (err, stdout) => {
        if (err) resolve(null);
        else resolve(stdout.trim());
      },
    );
  });
}

/** git HEAD SHA, or null if not a repo / git not on PATH. */
async function gitHead(dir: string): Promise<string | null> {
  return runGit(dir, ['rev-parse', 'HEAD']);
}

/**
 * Fallback revision token when the Saga isn't a git repo. Hashes the
 * (path, mtime, size) tuple for every markdown / yaml file under the root.
 * Cheap enough to run per chat request.
 */
async function contentRevision(root: string): Promise<string> {
  const h = createHash('sha1');
  async function walk(dir: string): Promise<void> {
    let entries: { name: string; isDirectory(): boolean }[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      if (e.name === 'node_modules') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else if (/\.(md|ya?ml)$/i.test(e.name)) {
        try {
          const s = await fs.stat(full);
          h.update(`${full}:${s.mtimeMs}:${s.size}\n`);
        } catch {
          /* ignore */
        }
      }
    }
  }
  await walk(root);
  return 'content:' + h.digest('hex').slice(0, 16);
}

async function readCache(abs: string): Promise<CacheRecord | null> {
  try {
    const raw = await fs.readFile(path.join(abs, CACHE_REL), 'utf8');
    const parsed = JSON.parse(raw) as CacheRecord;
    if (
      typeof parsed.revision !== 'string' ||
      !parsed.digest ||
      typeof parsed.digest !== 'object'
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function writeCache(abs: string, record: CacheRecord): Promise<void> {
  const file = path.join(abs, CACHE_REL);
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(record), 'utf8');
  } catch {
    // Writing the cache is a pure optimization; a read-only filesystem
    // shouldn't break the agent.
  }
}

/**
 * Compute the current revision for a Saga. Prefers the git HEAD SHA; falls
 * back to a content hash. Exposed for tests and for the `/lw/cache` debug
 * route.
 */
export async function revisionFor(absSagaRoot: string): Promise<string> {
  const head = await gitHead(absSagaRoot);
  return head ?? (await contentRevision(absSagaRoot));
}

export interface GetDigestOptions {
  /**
   * When true, ignore any on-disk cache and rebuild. The fresh digest is
   * written back for subsequent calls.
   */
  force?: boolean;
}

/**
 * Return the current canon digest for `absSagaRoot`, building (and caching)
 * it on miss. A single in-process Promise is memoized per root so concurrent
 * chat turns don't race to build the same digest.
 */
export async function getDigest(
  absSagaRoot: string,
  opts: GetDigestOptions = {},
): Promise<CanonDigest> {
  const cached = await readCache(absSagaRoot);
  const revision = await revisionFor(absSagaRoot);
  if (!opts.force && cached && cached.revision === revision) {
    return cached.digest;
  }
  return buildAndCache(absSagaRoot, revision);
}

const inflight = new Map<string, Promise<CanonDigest>>();

async function buildAndCache(
  absSagaRoot: string,
  revision: string,
): Promise<CanonDigest> {
  const existing = inflight.get(absSagaRoot);
  if (existing) return existing;
  const p = (async () => {
    try {
      const saga = await loadSaga(absSagaRoot);
      const digest = buildDigest(saga, { revision });
      await writeCache(absSagaRoot, { revision, digest });
      return digest;
    } finally {
      inflight.delete(absSagaRoot);
    }
  })();
  inflight.set(absSagaRoot, p);
  return p;
}

/**
 * Invalidate the on-disk + in-process cache for `absSagaRoot`. Called by
 * `/lw/apply` after successful writes so the next chat turn sees fresh
 * canon.
 */
export async function invalidateDigest(absSagaRoot: string): Promise<void> {
  inflight.delete(absSagaRoot);
  try {
    await fs.unlink(path.join(absSagaRoot, CACHE_REL));
  } catch {
    /* nothing to invalidate */
  }
}

/** Build a small "Canon phone book" section ready to paste into a prompt. */
export function renderDigestForPrompt(digest: CanonDigest): string {
  const counts = digest.counts;
  const head = [
    `## Canon phone book`,
    '',
    `Revision: \`${digest.revision ?? 'unknown'}\` — ${counts.entries} entries, ${counts.threads} threads, ${counts.tomes} tomes.`,
    '',
    renderPhoneBook(digest),
  ];
  if (digest.threads.length > 0) {
    head.push('', '### Threads');
    for (const t of digest.threads.slice(0, 6)) {
      const marks = t.waypoints
        .slice(0, 8)
        .map(
          (w) =>
            `${w.eventName ?? w.event}${w.at ? ` @ ${w.at}` : ''}`,
        )
        .join(' → ');
      head.push(
        `- \`${t.id}\`${t.calendar ? ` (${t.calendar})` : ''}: ${marks || '_(empty)_'}`,
      );
    }
  }
  head.push(
    '',
    '_Refs are machine-readable; quote them verbatim (e.g. `@character/aaron`) when referring to an entry. Use `lw_weave` for inherited properties, `lw_echoes` for cross-references, and `lw_thread` for full timelines._',
  );
  return head.join('\n');
}
