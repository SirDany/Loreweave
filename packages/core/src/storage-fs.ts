/**
 * Node filesystem-backed {@link StorageAdapter}. All paths are resolved
 * relative to a root directory supplied at construction; attempting to
 * escape that root with `..` throws, mirroring the `safeJoin` helper the
 * sidecar has been using ad-hoc.
 *
 * This is the adapter the desktop app, the CLI, and the Vite sidecar
 * use today. Cloud-hosted deployments substitute an S3/R2-backed adapter
 * without the rest of the code noticing.
 */
import { promises as fs, watch as fsWatch, type FSWatcher } from 'node:fs';
import path from 'node:path';

import {
  StorageNotFoundError,
  type ChangeListener,
  type StorageAdapter,
  type StorageEntry,
  type StorageStat,
} from './storage.js';

export class FsAdapter implements StorageAdapter {
  readonly kind = 'fs';
  readonly rootAbs: string;

  constructor(root: string) {
    this.rootAbs = path.resolve(root);
  }

  /** Resolve a tenant-relative path inside the adapter's root. */
  private resolve(rel: string): string {
    const joined = path.resolve(this.rootAbs, rel);
    if (
      joined !== this.rootAbs &&
      !joined.startsWith(this.rootAbs + path.sep)
    ) {
      throw new Error(
        `path escape detected: ${joined} is outside ${this.rootAbs}`,
      );
    }
    return joined;
  }

  async readFile(rel: string): Promise<string> {
    try {
      return await fs.readFile(this.resolve(rel), 'utf8');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new StorageNotFoundError(rel);
      }
      throw e;
    }
  }

  async writeFile(rel: string, content: string): Promise<void> {
    const abs = this.resolve(rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content, 'utf8');
  }

  async exists(rel: string): Promise<boolean> {
    try {
      await fs.stat(this.resolve(rel));
      return true;
    } catch {
      return false;
    }
  }

  async stat(rel: string): Promise<StorageStat> {
    try {
      const s = await fs.stat(this.resolve(rel));
      return {
        isDirectory: s.isDirectory(),
        size: Number(s.size),
        mtime: s.mtime,
      };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new StorageNotFoundError(rel);
      }
      throw e;
    }
  }

  async listDir(rel: string): Promise<StorageEntry[]> {
    try {
      const entries = await fs.readdir(this.resolve(rel), {
        withFileTypes: true,
      });
      return entries.map((e) => ({
        name: e.name,
        isDirectory: e.isDirectory(),
      }));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new StorageNotFoundError(rel);
      }
      throw e;
    }
  }

  async mkdirp(rel: string): Promise<void> {
    await fs.mkdir(this.resolve(rel), { recursive: true });
  }

  async appendFile(rel: string, content: string): Promise<void> {
    const abs = this.resolve(rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.appendFile(abs, content, 'utf8');
  }

  watch(listener: ChangeListener): () => void {
    let watcher: FSWatcher | null = null;
    try {
      watcher = fsWatch(
        this.rootAbs,
        { recursive: true, persistent: false },
        (_event, filename) => {
          if (!filename) return;
          listener({ path: filename.toString(), ts: Date.now() });
        },
      );
      watcher.on('error', () => {
        watcher?.close();
        watcher = null;
      });
    } catch {
      // Recursive watch unsupported on some platforms — silently no-op.
      watcher = null;
    }
    return () => {
      watcher?.close();
      watcher = null;
    };
  }
}
