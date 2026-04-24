/**
 * Storage abstraction used by the Loreweave sidecar and CLI.
 *
 * The desktop experience today pokes `node:fs` directly; hosting the app
 * means the same read/write code must run against cloud object stores
 * (R2/S3), an in-memory fake (tests, demo), or a Git-backed FUSE-style
 * layer. Routing every filesystem operation through a `StorageAdapter`
 * lets us swap that backend without touching callers.
 *
 * The surface is intentionally tight: everything Loreweave does reduces
 * to text reads, text writes, directory listings, and (optionally) a
 * change-event stream. No streams, no partial reads — a Saga is plain
 * markdown + YAML and fits comfortably in memory.
 */
export interface StorageStat {
  /** True if the entry is a directory. Files are the common case. */
  isDirectory: boolean;
  /** Size in bytes. Directories report 0. */
  size: number;
  /** Last-modified wall-clock time. */
  mtime: Date;
}

export interface StorageEntry {
  name: string;
  isDirectory: boolean;
}

export interface ChangeEvent {
  /** Path relative to the adapter's root. */
  path: string;
  /** Monotonic-ish timestamp; callers should not rely on strict ordering. */
  ts: number;
}

export type ChangeListener = (event: ChangeEvent) => void;

/**
 * Minimal error thrown when a requested path does not exist. Mirrors
 * Node's `ENOENT` so callers can branch on `err.code === 'ENOENT'` in
 * either backend without a custom `instanceof` check.
 */
export class StorageNotFoundError extends Error {
  readonly code = 'ENOENT';
  constructor(readonly path: string) {
    super(`not found: ${path}`);
    this.name = 'StorageNotFoundError';
  }
}

export interface StorageAdapter {
  /** Short identifier for diagnostics (e.g. "fs", "memory", "s3"). */
  readonly kind: string;

  /**
   * Read a text file. Throws {@link StorageNotFoundError} if missing.
   * All content is UTF-8.
   */
  readFile(relPath: string): Promise<string>;

  /**
   * Write a text file, creating parent directories as needed. Overwrites
   * any existing file at `relPath`. Content is UTF-8.
   */
  writeFile(relPath: string, content: string): Promise<void>;

  /** True if a file or directory exists at `relPath`. */
  exists(relPath: string): Promise<boolean>;

  /** Stat a path. Throws {@link StorageNotFoundError} if missing. */
  stat(relPath: string): Promise<StorageStat>;

  /**
   * List direct children of a directory. Names are returned without any
   * leading path. Throws {@link StorageNotFoundError} if the directory
   * doesn't exist. Returns an empty array for empty directories.
   */
  listDir(relPath: string): Promise<StorageEntry[]>;

  /** Create a directory (and any missing parents). No-op if it exists. */
  mkdirp(relPath: string): Promise<void>;

  /**
   * Append a line of text to a file, creating it if absent. Used by the
   * assistant session log; not all backends need to implement this
   * efficiently (default implementation is read-modify-write).
   */
  appendFile(relPath: string, content: string): Promise<void>;

  /**
   * Subscribe to change events for this adapter. Returns an unsubscribe
   * function. Adapters without native change notifications may emit
   * events only on local writes (see {@link MemoryAdapter}).
   */
  watch?(listener: ChangeListener): () => void;
}
