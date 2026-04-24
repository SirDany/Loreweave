import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, stat, utimes } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  getDigest,
  invalidateDigest,
  renderDigestForPrompt,
  revisionFor,
} from '../src/digest-cache.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const exampleSaga = path.resolve(here, '../../../sagas/example-saga');

describe('sidecar digest cache', () => {
  let dir: string;
  let saga: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'lw-digest-'));
    saga = path.join(dir, 'saga');
    await cp(exampleSaga, saga, { recursive: true });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('builds, caches, and reuses the digest on matching revision', async () => {
    const first = await getDigest(saga);
    expect(first.phoneBook.length).toBeGreaterThan(0);
    const cacheFile = path.join(saga, '.loreweave/cache/digest.json');
    await stat(cacheFile); // exists

    const cached = JSON.parse(await readFile(cacheFile, 'utf8')) as {
      revision: string;
    };
    const rev = await revisionFor(saga);
    expect(cached.revision).toBe(rev);

    const second = await getDigest(saga);
    expect(second.revision).toBe(first.revision);
  });

  it('rebuilds when the revision changes (content hash bumps on mtime)', async () => {
    const first = await getDigest(saga);
    // Bump an entry's mtime so the content-hash revision changes.
    const target = path.join(saga, 'codex', 'characters', 'aaron.md');
    const future = new Date(Date.now() + 60_000);
    await utimes(target, future, future);

    const second = await getDigest(saga);
    // Revisions must differ; the digest is rebuilt transparently.
    expect(second.revision).not.toBe(first.revision);
  });

  it('invalidate removes the cache file', async () => {
    await getDigest(saga);
    await invalidateDigest(saga);
    const cacheFile = path.join(saga, '.loreweave/cache/digest.json');
    await expect(stat(cacheFile)).rejects.toThrow();
  });

  it('renders a phone-book prompt including known refs', async () => {
    const digest = await getDigest(saga);
    const rendered = renderDigestForPrompt(digest);
    expect(rendered).toContain('Canon phone book');
    expect(rendered).toContain('@character/aaron');
  });

  it('keys by git HEAD when the saga is a git repo', async () => {
    // Make the temp saga a git repo with one commit.
    const run = (args: string[]) =>
      execFileSync('git', args, { cwd: saga, encoding: 'utf8' });
    run(['init', '-q', '-b', 'main']);
    run(['config', 'user.name', 'Loreweave Test']);
    run(['config', 'user.email', 'test@loreweave.local']);
    run(['add', '.']);
    run(['commit', '-q', '-m', 'seed']);

    const rev = await revisionFor(saga);
    const head = run(['rev-parse', 'HEAD']).trim();
    expect(rev).toBe(head);
  });
});
