// Filesystem loader: walk a Saga dir and return a parsed `Saga` object.
import { promises as fs } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import YAML from "yaml";
import {
  ChapterMetaSchema,
  CalendarFileSchema,
  EntryFrontmatterSchema,
  NoteFrontmatterSchema,
  SagaManifestSchema,
  ThreadFileSchema,
  TomeManifestSchema,
} from "./schemas.js";
import type {
  CalendarSpec,
  Chapter,
  Entry,
  Note,
  NoteFrontmatter,
  Saga,
  SagaManifest,
  Thread,
  Tome,
} from "./types.js";

export class LoadError extends Error {
  constructor(message: string, public readonly file: string) {
    super(`${message} (${file})`);
  }
}

async function readText(p: string): Promise<string> {
  return fs.readFile(p, "utf8");
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
  return path.relative(root, p).split(path.sep).join("/");
}

async function parseEntry(file: string, root: string): Promise<Entry> {
  const raw = await readText(file);
  const parsed = matter(raw);
  const result = EntryFrontmatterSchema.safeParse(parsed.data);
  if (!result.success) {
    throw new LoadError(
      `invalid frontmatter: ${result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
      file,
    );
  }
  const fm = result.data;
  const expectedId = path.basename(file, path.extname(file));
  if (fm.id !== expectedId) {
    throw new LoadError(
      `id "${fm.id}" does not match filename stem "${expectedId}"`,
      file,
    );
  }
  return {
    frontmatter: fm,
    body: parsed.content.trim(),
    path: file,
    relPath: toRel(root, file),
  };
}

async function parseYamlFile<T>(
  file: string,
  schema: { safeParse: (v: unknown) => { success: boolean } },
): Promise<T> {
  const raw = await readText(file);
  let data: unknown;
  try {
    data = YAML.parse(raw);
  } catch (err) {
    throw new LoadError(`invalid YAML: ${(err as Error).message}`, file);
  }
  const result = (schema.safeParse(data) as unknown) as {
    success: boolean;
    data?: T;
    error?: { issues: Array<{ path: (string | number)[]; message: string }> };
  };
  if (!result.success || !result.data) {
    const issues = result.error?.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new LoadError(`schema mismatch: ${issues ?? "unknown"}`, file);
  }
  return result.data;
}

async function loadEntriesIn(dir: string, root: string): Promise<Entry[]> {
  const files = (await walk(dir)).filter((f) => f.endsWith(".md"));
  const entries: Entry[] = [];
  for (const f of files) entries.push(await parseEntry(f, root));
  return entries;
}

async function loadNotes(root: string): Promise<Note[]> {
  const dir = path.join(root, "notes");
  if (!(await exists(dir))) return [];
  const files = (await walk(dir)).filter((f) => f.endsWith(".md"));
  const out: Note[] = [];
  for (const f of files) {
    const raw = await readText(f);
    const parsed = matter(raw);
    const result = NoteFrontmatterSchema.safeParse(parsed.data);
    if (!result.success) {
      throw new LoadError(
        `invalid note frontmatter: ${result.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ")}`,
        f,
      );
    }
    const fm = result.data as NoteFrontmatter;
    const expectedId = path.basename(f, path.extname(f));
    if (fm.id !== expectedId) {
      throw new LoadError(
        `note id "${fm.id}" does not match filename stem "${expectedId}"`,
        f,
      );
    }
    out.push({
      frontmatter: fm,
      body: parsed.content.trim(),
      path: f,
      relPath: toRel(root, f),
    });
  }
  return out;
}

async function loadTomes(root: string): Promise<Tome[]> {
  const tomesDir = path.join(root, "tomes");
  if (!(await exists(tomesDir))) return [];
  const names = await fs.readdir(tomesDir, { withFileTypes: true });
  const tomes: Tome[] = [];
  for (const entry of names) {
    if (!entry.isDirectory()) continue;
    const tomePath = path.join(tomesDir, entry.name);
    const manifestPath = path.join(tomePath, "tome.yaml");
    if (!(await exists(manifestPath))) continue;
    const manifest = await parseYamlFile<
      import("./types.js").TomeManifest
    >(manifestPath, TomeManifestSchema);
    const storyDir = path.join(tomePath, "story");
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
  tomeId: string,
): Promise<Chapter[]> {
  if (!(await exists(storyDir))) return [];
  const names = await fs.readdir(storyDir, { withFileTypes: true });
  const chapters: Chapter[] = [];
  for (const entry of names) {
    if (!entry.isDirectory()) continue;
    const chapterDir = path.join(storyDir, entry.name);
    const chapterFile = path.join(chapterDir, "chapter.md");
    if (!(await exists(chapterFile))) continue;
    const body = await readText(chapterFile);
    const metaFile = path.join(chapterDir, "_meta.yaml");
    let meta: import("./types.js").ChapterMeta = {};
    if (await exists(metaFile)) {
      meta = await parseYamlFile<import("./types.js").ChapterMeta>(
        metaFile,
        ChapterMetaSchema,
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
    (a, b) => (a.meta.ordinal ?? 0) - (b.meta.ordinal ?? 0) ||
      a.slug.localeCompare(b.slug),
  );
  return chapters;
}

async function loadThreads(root: string): Promise<Thread[]> {
  const dir = path.join(root, "threads");
  const threads: Thread[] = [];
  if (!(await exists(dir))) return threads;
  const files = (await walk(dir)).filter((f) => f.endsWith(".yaml"));
  for (const f of files) {
    const parsed = await parseYamlFile<{
      id: string;
      calendar?: string;
      branches_from?: { thread: string; at_waypoint: string };
      waypoints: Thread["waypoints"];
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
  const dir = path.join(root, "calendars");
  if (!(await exists(dir))) return [];
  const files = (await walk(dir)).filter((f) => f.endsWith(".yaml"));
  const cals: CalendarSpec[] = [];
  for (const f of files) {
    cals.push(await parseYamlFile<CalendarSpec>(f, CalendarFileSchema));
  }
  return cals;
}

export async function loadSaga(root: string): Promise<Saga> {
  const absRoot = path.resolve(root);
  const manifestPath = path.join(absRoot, "saga.yaml");
  if (!(await exists(manifestPath))) {
    throw new LoadError("saga.yaml not found", manifestPath);
  }
  const manifest = await parseYamlFile<SagaManifest>(
    manifestPath,
    SagaManifestSchema,
  );
  // Canonical layout: codex/ lexicon/ sigils/ threads/ tomes/ notes/.
  // Legacy folders (wiki/ glossary/ tags/ timelines/) are no longer loaded —
  // run `lw migrate` on a legacy saga to rename them first.
  const [codex, lexicon, sigils, tomes, threads, calendars, notes] =
    await Promise.all([
      loadEntriesIn(path.join(absRoot, "codex"), absRoot),
      loadEntriesIn(path.join(absRoot, "lexicon"), absRoot),
      loadEntriesIn(path.join(absRoot, "sigils"), absRoot),
      loadTomes(absRoot),
      loadThreads(absRoot),
      loadCalendars(absRoot),
      loadNotes(absRoot),
    ]);
  return {
    manifest,
    root: absRoot,
    entries: [...codex, ...lexicon, ...sigils],
    tomes,
    threads,
    calendars,
    notes,
  };
}
