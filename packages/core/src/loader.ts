// Filesystem loader: walk a Saga dir and return a parsed `Saga` object.
import matter from 'gray-matter';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { BUILTIN_KIND_IDS } from './builtin-kinds.js';
import { loadKindCatalog, type KindCatalog } from './kind-loader.js';
import {
  normalizeEntryMarkdown,
  normalizeTraceMarkdown,
  stripOuterCodeFence,
} from './normalizer.js';
import {
  CalendarFileSchema,
  ChapterMetaSchema,
  CustomKindEntryFrontmatterSchema,
  EntryFrontmatterSchema,
  SagaManifestSchema,
  ThreadFileSchema,
  TomeManifestSchema,
  TraceFrontmatterSchema,
} from './schemas.js';
import type {
  CalendarSpec,
  Chapter,
  Entry,
  Saga,
  SagaManifest,
  Thread,
  Tome,
  Trace,
  TraceFrontmatter,
} from './types.js';

export class LoadError extends Error {
  constructor(message: string, public readonly file: string) {
    super(`${message} (${file})`);
  }
}

async function readText(p: string): Promise<string> {
  return fs.readFile(p, 'utf8');
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  if (!(await exists(dir))) return out;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

function toRel(root: string, p: string): string {
  return path.relative(root, p).split(path.sep).join('/');
}

async function parseEntry(file: string, root: string): Promise<Entry> {
  const raw = await readText(file);
  const relPath = toRel(root, file);
  const expectedId = path.basename(file, path.extname(file));
  const hasCodeFence = raw.trimStart().startsWith('```');

  if (!hasCodeFence) {
    try {
      const parsed = matter(raw);
      // Try the strict discriminated union first (built-in kinds). Fall
      // back to the permissive custom-kind schema for entries belonging
      // to a saga-defined Kind.
      const strict = EntryFrontmatterSchema.safeParse(parsed.data);
      let candidate: Entry['frontmatter'] | null = null;
      if (strict.success) {
        candidate = strict.data;
      } else {
        const loose = CustomKindEntryFrontmatterSchema.safeParse(parsed.data);
        if (loose.success) {
          candidate = loose.data as unknown as Entry['frontmatter'];
        }
      }
      if (candidate && candidate.id === expectedId) {
        return {
          frontmatter: candidate,
          body: parsed.content.trim(),
          path: file,
          relPath,
        };
      }
    } catch {
      // Malformed YAML frontmatter — fall through to the resilient normalizer.
    }
  }

  const normalized = normalizeEntryMarkdown(raw, relPath);
  const parsedNorm = matter(normalized.content);
  const strictNorm = EntryFrontmatterSchema.safeParse(parsedNorm.data);
  let fm: Entry['frontmatter'];
  if (strictNorm.success) {
    fm = strictNorm.data;
  } else {
    const looseNorm = CustomKindEntryFrontmatterSchema.safeParse(parsedNorm.data);
    if (!looseNorm.success) {
      throw new LoadError(
        `invalid frontmatter: ${strictNorm.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ')}`,
        file,
      );
    }
    fm = looseNorm.data as unknown as Entry['frontmatter'];
  }
  return {
    frontmatter: fm,
    body: normalized.body.trim(),
    path: file,
    relPath,
  };
}

async function parseYamlFile<T>(
  file: string,
  schema: { safeParse: (v: unknown) => { success: boolean } }
): Promise<T> {
  const raw = stripOuterCodeFence(await readText(file));
  let data: unknown;
  try {
    data = YAML.parse(raw);
  } catch (err) {
    throw new LoadError(`invalid YAML: ${(err as Error).message}`, file);
  }
  const result = schema.safeParse(data) as unknown as {
    success: boolean;
    data?: T;
    error?: { issues: Array<{ path: (string | number)[]; message: string }> };
  };
  if (!result.success || !result.data) {
    const issues = result.error?.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new LoadError(`schema mismatch: ${issues ?? 'unknown'}`, file);
  }
  return result.data;
}

async function loadEntriesIn(dir: string, root: string): Promise<Entry[]> {
  const files = (await walk(dir)).filter((f) => f.endsWith('.md'));
  const entries: Entry[] = [];
  for (const f of files) entries.push(await parseEntry(f, root));
  return entries;
}

async function loadTraces(root: string): Promise<Trace[]> {
  const dir = path.join(root, 'traces');
  if (!(await exists(dir))) return [];
  const files = (await walk(dir)).filter((f) => f.endsWith('.md'));
  const out: Trace[] = [];
  for (const f of files) {
    const raw = await readText(f);
    const relPath = toRel(root, f);
    const expectedId = path.basename(f, path.extname(f));
    let fm: TraceFrontmatter | null = null;
    let body = '';

    if (!raw.trimStart().startsWith('```')) {
      try {
        const parsed = matter(raw);
        const result = TraceFrontmatterSchema.safeParse(parsed.data);
        if (result.success && result.data.id === expectedId) {
          fm = result.data as TraceFrontmatter;
          body = parsed.content.trim();
        }
      } catch {
        // Fall through to trace normalization.
      }
    }

    if (!fm) {
      const normalized = normalizeTraceMarkdown(raw, relPath);
      const parsedNorm = matter(normalized.content);
      const normResult = TraceFrontmatterSchema.safeParse(parsedNorm.data);
      if (!normResult.success) {
        throw new LoadError(
          `invalid trace frontmatter: ${normResult.error.issues
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .join('; ')}`,
          f,
        );
      }
      fm = normResult.data as TraceFrontmatter;
      body = normalized.body.trim();
    }

    out.push({
      frontmatter: fm,
      body,
      path: f,
      relPath,
    });
  }
  return out;
}

async function loadTomes(root: string): Promise<Tome[]> {
  const tomesDir = path.join(root, 'tomes');
  if (!(await exists(tomesDir))) return [];
  const names = await fs.readdir(tomesDir, { withFileTypes: true });
  const tomes: Tome[] = [];
  for (const entry of names) {
    if (!entry.isDirectory()) continue;
    const tomePath = path.join(tomesDir, entry.name);
    const manifestPath = path.join(tomePath, 'tome.yaml');
    if (!(await exists(manifestPath))) continue;
    const manifest = await parseYamlFile<import('./types.js').TomeManifest>(
      manifestPath,
      TomeManifestSchema
    );
    const storyDir = path.join(tomePath, 'story');
    const chapters = await loadChapters(storyDir, root, manifest.id);
    tomes.push({
      manifest,
      path: tomePath,
      relPath: toRel(root, tomePath),
      chapters,
    });
  }
  return tomes;
}

async function loadChapters(
  storyDir: string,
  root: string,
  tomeId: string
): Promise<Chapter[]> {
  if (!(await exists(storyDir))) return [];
  const names = await fs.readdir(storyDir, { withFileTypes: true });
  const chapters: Chapter[] = [];
  for (const entry of names) {
    if (!entry.isDirectory()) continue;
    const chapterDir = path.join(storyDir, entry.name);
    const chapterFile = path.join(chapterDir, 'chapter.md');
    if (!(await exists(chapterFile))) continue;
    const body = await readText(chapterFile);
    const metaFile = path.join(chapterDir, '_meta.yaml');
    let meta: import('./types.js').ChapterMeta = {};
    if (await exists(metaFile)) {
      meta = await parseYamlFile<import('./types.js').ChapterMeta>(
        metaFile,
        ChapterMetaSchema
      );
    }
    chapters.push({
      meta,
      body,
      path: chapterFile,
      relPath: toRel(root, chapterFile),
      tome: tomeId,
      slug: entry.name,
    });
  }
  chapters.sort(
    (a, b) =>
      (a.meta.ordinal ?? 0) - (b.meta.ordinal ?? 0) ||
      a.slug.localeCompare(b.slug)
  );
  return chapters;
}

async function loadThreads(root: string): Promise<Thread[]> {
  const dir = path.join(root, 'threads');
  const threads: Thread[] = [];
  if (!(await exists(dir))) return threads;
  const files = (await walk(dir)).filter((f) => f.endsWith('.yaml'));
  for (const f of files) {
    const parsed = await parseYamlFile<{
      id: string;
      calendar?: string;
      branches_from?: { thread: string; at_waypoint: string };
      waypoints: Thread['waypoints'];
    }>(f, ThreadFileSchema);
    threads.push({
      ...parsed,
      path: f,
      relPath: toRel(root, f),
    });
  }
  return threads;
}

async function loadCalendars(root: string): Promise<CalendarSpec[]> {
  const dir = path.join(root, 'calendars');
  if (!(await exists(dir))) return [];
  const files = (await walk(dir)).filter((f) => f.endsWith('.yaml'));
  const cals: CalendarSpec[] = [];
  for (const f of files) {
    cals.push(await parseYamlFile<CalendarSpec>(f, CalendarFileSchema));
  }
  return cals;
}

export async function loadSaga(root: string): Promise<Saga> {
  const absRoot = path.resolve(root);
  const manifestPath = path.join(absRoot, 'saga.yaml');
  if (!(await exists(manifestPath))) {
    throw new LoadError('saga.yaml not found', manifestPath);
  }
  const manifest = await parseYamlFile<SagaManifest>(
    manifestPath,
    SagaManifestSchema
  );
  // Resolve the Kind catalog first — built-ins seeded, saga `kinds/*.md`
  // overrides applied, extends chains resolved.
  const kinds = await loadKindCatalog(absRoot);
  // Canonical layout: codex/ lexicon/ sigils/ threads/ tomes/ traces/.
  // Legacy folders (wiki/ glossary/ tags/ timelines/) are no longer loaded —
  // run `lw migrate` on a legacy saga to rename them first.
  const [codex, lexicon, sigils, tomes, threads, calendars, traces] =
    await Promise.all([
      loadEntriesIn(path.join(absRoot, 'codex'), absRoot),
      loadEntriesIn(path.join(absRoot, 'lexicon'), absRoot),
      loadEntriesIn(path.join(absRoot, 'sigils'), absRoot),
      loadTomes(absRoot),
      loadThreads(absRoot),
      loadCalendars(absRoot),
      loadTraces(absRoot),
    ]);
  // Saga-defined Kinds (non-builtin) bring their own storage folders.
  // Walk each unique folder once.
  const customEntries: Entry[] = [];
  const seenStorage = new Set<string>(['codex', 'lexicon', 'sigils']);
  for (const k of kinds.byId.values()) {
    if (BUILTIN_KIND_IDS.has(k.id)) continue;
    const storage = k.storage;
    if (seenStorage.has(storage)) continue;
    seenStorage.add(storage);
    const dir = path.join(absRoot, storage);
    customEntries.push(...(await loadEntriesIn(dir, absRoot)));
  }
  return {
    manifest,
    root: absRoot,
    entries: [...codex, ...lexicon, ...sigils, ...customEntries],
    tomes,
    threads,
    calendars,
    traces,
    kinds,
  };
}

export type { KindCatalog };
