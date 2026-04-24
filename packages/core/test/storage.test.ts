/**
 * Adapter-conformance suite: every {@link StorageAdapter} implementation
 * must pass the same scenarios. Run it with a factory so the FS adapter
 * gets a fresh temp directory per test.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  FsAdapter,
  MemoryAdapter,
  StorageNotFoundError,
  type StorageAdapter,
} from '../src/index.js';

type Factory = () => Promise<{
  adapter: StorageAdapter;
  cleanup: () => Promise<void>;
}>;

function runSuite(name: string, factory: Factory) {
  describe(name, () => {
    let adapter: StorageAdapter;
    let cleanup: () => Promise<void>;

    beforeEach(async () => {
      const made = await factory();
      adapter = made.adapter;
      cleanup = made.cleanup;
    });

    afterEach(async () => {
      await cleanup();
    });

    it('round-trips a file write and read', async () => {
      await adapter.writeFile('notes/hello.md', 'hi there');
      expect(await adapter.readFile('notes/hello.md')).toBe('hi there');
    });

    it('creates parent directories implicitly on writeFile', async () => {
      await adapter.writeFile('deep/nested/path/file.txt', 'ok');
      expect(await adapter.exists('deep/nested/path')).toBe(true);
      const listing = await adapter.listDir('deep/nested');
      expect(listing.map((e) => e.name)).toContain('path');
    });

    it('throws StorageNotFoundError for a missing file', async () => {
      await expect(adapter.readFile('nope.md')).rejects.toBeInstanceOf(
        StorageNotFoundError,
      );
    });

    it('stat distinguishes files from directories', async () => {
      await adapter.writeFile('a/b.md', 'x');
      const file = await adapter.stat('a/b.md');
      expect(file.isDirectory).toBe(false);
      expect(file.size).toBe(1);
      const dir = await adapter.stat('a');
      expect(dir.isDirectory).toBe(true);
    });

    it('listDir returns files and subdirectories', async () => {
      await adapter.writeFile('a/one.md', '1');
      await adapter.writeFile('a/two.md', '2');
      await adapter.writeFile('a/sub/inner.md', 'x');
      const entries = await adapter.listDir('a');
      const names = entries.map((e) => e.name).sort();
      expect(names).toEqual(['one.md', 'sub', 'two.md']);
      const sub = entries.find((e) => e.name === 'sub')!;
      expect(sub.isDirectory).toBe(true);
    });

    it('listDir throws on a missing directory', async () => {
      await expect(adapter.listDir('does/not/exist')).rejects.toBeInstanceOf(
        StorageNotFoundError,
      );
    });

    it('mkdirp is idempotent', async () => {
      await adapter.mkdirp('new/empty');
      await adapter.mkdirp('new/empty');
      expect((await adapter.stat('new/empty')).isDirectory).toBe(true);
    });

    it('appendFile creates and extends', async () => {
      await adapter.appendFile('log.txt', 'one\n');
      await adapter.appendFile('log.txt', 'two\n');
      expect(await adapter.readFile('log.txt')).toBe('one\ntwo\n');
    });

    it('rejects traversal outside the root', async () => {
      await expect(adapter.readFile('../escape.md')).rejects.toThrow();
    });

    it('notifies watchers on writeFile', async () => {
      if (!adapter.watch) return;
      const events: string[] = [];
      const unsub = adapter.watch((ev) => events.push(ev.path));
      await adapter.writeFile('watched.md', 'hi');
      // Give FS watchers a beat to fire (memory adapter is synchronous).
      await new Promise((r) => setTimeout(r, 50));
      unsub();
      expect(events.length).toBeGreaterThan(0);
    });
  });
}

runSuite('FsAdapter', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'lw-fs-'));
  return {
    adapter: new FsAdapter(dir),
    cleanup: async () => {
      await rm(dir, { recursive: true, force: true });
    },
  };
});

runSuite('MemoryAdapter', async () => ({
  adapter: new MemoryAdapter(),
  cleanup: async () => {
    /* nothing to clean up */
  },
}));

describe('MemoryAdapter seeding', () => {
  it('accepts an initial file map', async () => {
    const adapter = new MemoryAdapter({
      'codex/characters/aaron.md': '# Aaron',
      'saga.yaml': 'id: demo\n',
    });
    expect(await adapter.readFile('saga.yaml')).toBe('id: demo\n');
    const codex = await adapter.listDir('codex');
    expect(codex.map((e) => e.name)).toContain('characters');
  });
});
