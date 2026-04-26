/**
 * In-memory {@link StorageAdapter}. Used by tests, the static GitHub
 * Pages demo, and future CCP smoke-tests. Emits change events for every
 * local write so sidecar SSE wiring can be exercised without touching
 * the real filesystem.
 */
import {
  StorageNotFoundError,
  type ChangeListener,
  type StorageAdapter,
  type StorageEntry,
  type StorageStat,
} from './storage.js';

interface Node {
  content: string;
  mtime: Date;
}

function normalize(p: string): string {
  // Unify separators and strip leading "./" / trailing "/" so keys match.
  const unified = p.replace(/\\/g, '/').replace(/^\.?\/+/, '').replace(/\/+$/, '');
  if (unified.split('/').some((seg) => seg === '..' || seg === '.')) {
    throw new Error(`invalid path: ${p}`);
  }
  return unified;
}

function parentOf(p: string): string {
  const i = p.lastIndexOf('/');
  return i === -1 ? '' : p.slice(0, i);
}

export class MemoryAdapter implements StorageAdapter {
  readonly kind = 'memory';
  private files = new Map<string, Node>();
  /** Explicitly-created directories (separate from implicit ones under files). */
  private dirs = new Set<string>(['']);
  private listeners = new Set<ChangeListener>();

  constructor(seed?: Record<string, string>) {
    if (seed) {
      for (const [k, v] of Object.entries(seed)) {
        const norm = normalize(k);
        this.files.set(norm, { content: v, mtime: new Date() });
        let parent = parentOf(norm);
        while (parent.length > 0) {
          this.dirs.add(parent);
          parent = parentOf(parent);
        }
      }
    }
  }

  private notify(path: string) {
    const ev = { path, ts: Date.now() };
    for (const l of this.listeners) {
      try {
        l(ev);
      } catch {
        /* listener errors don't break the writer */
      }
    }
  }

  async readFile(rel: string): Promise<string> {
    const n = this.files.get(normalize(rel));
    if (!n) throw new StorageNotFoundError(rel);
    return n.content;
  }

  async writeFile(rel: string, content: string): Promise<void> {
    const norm = normalize(rel);
    this.files.set(norm, { content, mtime: new Date() });
    let parent = parentOf(norm);
    while (parent.length > 0) {
      this.dirs.add(parent);
      parent = parentOf(parent);
    }
    this.notify(norm);
  }

  async exists(rel: string): Promise<boolean> {
    const norm = normalize(rel);
    return this.files.has(norm) || this.dirs.has(norm);
  }

  async stat(rel: string): Promise<StorageStat> {
    const norm = normalize(rel);
    const file = this.files.get(norm);
    if (file) {
      return {
        isDirectory: false,
        size: Buffer.byteLength(file.content, 'utf8'),
        mtime: file.mtime,
      };
    }
    if (this.dirs.has(norm)) {
      return { isDirectory: true, size: 0, mtime: new Date(0) };
    }
    throw new StorageNotFoundError(rel);
  }

  async listDir(rel: string): Promise<StorageEntry[]> {
    const norm = normalize(rel);
    if (!this.dirs.has(norm)) throw new StorageNotFoundError(rel);
    const prefix = norm === '' ? '' : norm + '/';
    const out = new Map<string, StorageEntry>();
    for (const key of this.files.keys()) {
      if (!key.startsWith(prefix)) continue;
      const rest = key.slice(prefix.length);
      const slash = rest.indexOf('/');
      if (slash === -1) {
        out.set(rest, { name: rest, isDirectory: false });
      } else {
        const name = rest.slice(0, slash);
        if (!out.has(name)) out.set(name, { name, isDirectory: true });
      }
    }
    for (const dir of this.dirs) {
      if (dir === norm) continue;
      if (!dir.startsWith(prefix)) continue;
      const rest = dir.slice(prefix.length);
      if (rest.includes('/')) continue;
      out.set(rest, { name: rest, isDirectory: true });
    }
    return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async mkdirp(rel: string): Promise<void> {
    let p = normalize(rel);
    while (p.length > 0) {
      this.dirs.add(p);
      p = parentOf(p);
    }
  }

  async deletePath(
    rel: string,
    opts?: { recursive?: boolean },
  ): Promise<void> {
    const norm = normalize(rel);
    if (this.files.has(norm)) {
      this.files.delete(norm);
      this.notify(norm);
      return;
    }
    if (!this.dirs.has(norm)) return;
    const prefix = norm + '/';
    const childFiles = [...this.files.keys()].filter((k) =>
      k.startsWith(prefix),
    );
    const childDirs = [...this.dirs].filter(
      (d) => d !== norm && d.startsWith(prefix),
    );
    if (!opts?.recursive && (childFiles.length > 0 || childDirs.length > 0)) {
      throw new Error(`directory not empty: ${rel}`);
    }
    for (const f of childFiles) this.files.delete(f);
    for (const d of childDirs) this.dirs.delete(d);
    this.dirs.delete(norm);
    this.notify(norm);
  }

  async appendFile(rel: string, content: string): Promise<void> {
    const norm = normalize(rel);
    const prior = this.files.get(norm)?.content ?? '';
    await this.writeFile(norm, prior + content);
  }

  watch(listener: ChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
