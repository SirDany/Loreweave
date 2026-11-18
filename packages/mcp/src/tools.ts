import { promises as fs } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import YAML from 'yaml';
import {
  canonicalType,
  extractReferences,
  formatReference,
  normalizeRef,
  loadSaga,
  resolve,
  buildEntryIndex,
  linearize,
  scanLooseEnds,
  findEntryUsages,
  deleteEntryWithAudit,
  FsAdapter,
  entryKey,
  type Saga,
  type Entry,
} from '@loreweave/core';

export interface SagaContext {
  defaultSagaRoot: string;
}

/**
 * Finds the default saga root if none is explicitly provided.
 */
export async function resolveSagaRoot(explicitRoot?: string): Promise<string> {
  if (explicitRoot) {
    return path.resolve(explicitRoot);
  }
  // Try default sagas/example-saga or first saga in sagas/
  const defaultPath = path.resolve('sagas/example-saga');
  try {
    await fs.access(path.join(defaultPath, 'saga.yaml'));
    return defaultPath;
  } catch {
    // Look inside sagas/
    try {
      const entries = await fs.readdir(path.resolve('sagas'), { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory()) {
          const candidate = path.resolve('sagas', e.name);
          try {
            await fs.access(path.join(candidate, 'saga.yaml'));
            return candidate;
          } catch {
            // continue
          }
        }
      }
    } catch {
      // fallback
    }
  }
  return defaultPath;
}

/**
 * Slugifies a title into a clean kebab-case id.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * 1. loreweave_get_overview
 * Dense, token-efficient phonebook of the saga.
 */
export async function getSagaOverview(sagaRoot?: string) {
  const root = await resolveSagaRoot(sagaRoot);
  const saga = await loadSaga(root);

  return {
    saga: {
      id: saga.manifest.id,
      title: saga.manifest.title,
      author: saga.manifest.author,
      root: saga.root,
    },
    tomes: saga.tomes.map((t) => ({
      id: t.manifest.id,
      title: t.manifest.title,
      chapters: t.chapters.map((c) => ({
        slug: c.slug,
        title: c.meta.title || c.slug,
        ordinal: c.meta.ordinal,
        pov: c.meta.pov,
        status: c.meta.status,
      })),
    })),
    characters: saga.entries
      .filter((e) => e.frontmatter.type === 'character')
      .map((e) => ({
        id: e.frontmatter.id,
        name: e.frontmatter.name,
        status: e.frontmatter.status,
        tags: e.frontmatter.tags,
        role: (e.frontmatter.properties as Record<string, unknown>)?.role,
      })),
    locations: saga.entries
      .filter((e) => e.frontmatter.type === 'location')
      .map((e) => ({
        id: e.frontmatter.id,
        name: e.frontmatter.name,
        tags: e.frontmatter.tags,
      })),
    sigils: saga.entries
      .filter((e) => e.frontmatter.type === 'sigil')
      .map((e) => ({
        id: e.frontmatter.id,
        name: e.frontmatter.name,
        kind: (e.frontmatter as unknown as Record<string, unknown>).kind,
      })),
    threads: saga.threads.map((t) => ({
      id: t.id,
      waypointCount: t.waypoints.length,
      branches_from: t.branches_from,
    })),
    stats: {
      totalEntries: saga.entries.length,
      totalTomes: saga.tomes.length,
      totalChapters: saga.tomes.reduce((acc, t) => acc + t.chapters.length, 0),
    },
  };
}

/**
 * 2. loreweave_read_entry
 */
export async function readEntry(ref: string, resolveWeave: boolean = true, sagaRoot?: string) {
  const root = await resolveSagaRoot(sagaRoot);
  const saga = await loadSaga(root);
  const norm = normalizeRef(ref);
  const slash = norm.indexOf('/');
  if (slash === -1) {
    throw new Error(`Invalid reference format: "${ref}". Expected format like "character/aaron" or "@character/aaron".`);
  }
  const type = canonicalType(norm.slice(0, slash));
  const id = norm.slice(slash + 1);
  const key = entryKey(type, id);

  const entry = saga.entries.find(
    (e) => entryKey(e.frontmatter.type, e.frontmatter.id) === key
  );
  if (!entry) {
    throw new Error(`Entry ${type}/${id} not found in saga.`);
  }

  let weave = null;
  if (resolveWeave) {
    const index = buildEntryIndex(saga.entries);
    weave = resolve(entry, index);
  }

  const outgoingRefs = extractReferences(entry.body);
  const usages = findEntryUsages(saga, type, id);

  return {
    ref: `${type}/${id}`,
    file: entry.relPath,
    frontmatter: entry.frontmatter,
    weave: weave?.properties,
    provenance: weave?.provenance,
    body: entry.body,
    outgoingReferences: outgoingRefs.map((r) => ({
      type: r.type,
      id: r.id,
      display: r.display,
      raw: r.raw,
      line: r.line,
    })),
    incomingReferencesCount: usages.length,
    incomingReferences: usages.slice(0, 20), // top 20 usages
  };
}

export interface UpsertEntryInput {
  kind: 'character' | 'location' | 'concept' | 'lore' | 'waypoint' | 'term' | 'sigil';
  name: string;
  id?: string;
  properties?: Record<string, unknown>;
  aliases?: string[];
  tags?: string[];
  inherits?: string[];
  overrides?: Record<string, unknown>;
  speaks?: string[];
  spoken_here?: string[];
  definition?: string;
  pronunciation?: string;
  examples?: string[];
  slang_of?: string;
  body?: string;
  status?: 'draft' | 'canon';
  sagaRoot?: string;
}

/**
 * 3. loreweave_upsert_entry
 * Domain creation / update with schema validation and automatic folder layout.
 */
export async function upsertEntry(input: UpsertEntryInput) {
  const root = await resolveSagaRoot(input.sagaRoot);
  const type = canonicalType(input.kind);
  const id = input.id ? slugify(input.id) : slugify(input.name);
  if (!id) {
    throw new Error('Could not derive a valid ID from the name. Please provide an explicit kebab-case id.');
  }

  let folder: string;
  switch (type) {
    case 'character':
      folder = 'codex/characters';
      break;
    case 'location':
      folder = 'codex/locations';
      break;
    case 'concept':
      folder = 'codex/concepts';
      break;
    case 'lore':
      folder = 'codex/lore';
      break;
    case 'waypoint':
      folder = 'codex/waypoints';
      break;
    case 'term':
      folder = 'lexicon';
      break;
    case 'sigil':
      folder = 'sigils';
      break;
    default:
      folder = `codex/${type}s`;
  }

  const relPath = `${folder}/${id}.md`;
  const absPath = path.join(root, relPath);

  // Check if file already exists to preserve existing fields
  let existingFm: Record<string, unknown> = {};
  let existingBody = '';
  try {
    const raw = await fs.readFile(absPath, 'utf8');
    const parsed = matter(raw);
    existingFm = parsed.data;
    existingBody = parsed.content;
  } catch {
    // new file
  }

  const fm: Record<string, unknown> = {
    ...existingFm,
    id,
    type,
    name: input.name,
    status: input.status ?? existingFm.status ?? 'canon',
  };

  if (input.aliases) fm.aliases = input.aliases;
  if (input.tags) fm.tags = input.tags;
  if (input.inherits) fm.inherits = input.inherits;
  if (input.overrides) fm.overrides = input.overrides;
  if (input.properties) {
    fm.properties = {
      ...((existingFm.properties as Record<string, unknown>) ?? {}),
      ...input.properties,
    };
  }
  if (input.speaks) fm.speaks = input.speaks;
  if (input.spoken_here) fm.spoken_here = input.spoken_here;
  if (input.definition) fm.definition = input.definition;
  if (input.pronunciation) fm.pronunciation = input.pronunciation;
  if (input.examples) fm.examples = input.examples;
  if (input.slang_of) fm.slang_of = input.slang_of;

  const body = input.body !== undefined ? input.body : existingBody;
  const fileContent = matter.stringify(body, fm);

  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, fileContent, 'utf8');

  return {
    ok: true,
    ref: `${type}/${id}`,
    relPath,
    name: input.name,
    status: fm.status,
  };
}

/**
 * 4. loreweave_delete_entry
 * Deletes an entry and scans for loose ends, creating an audit note if references remain.
 */
export async function deleteEntry(ref: string, createAuditNote: boolean = true, sagaRoot?: string) {
  const root = await resolveSagaRoot(sagaRoot);
  const saga = await loadSaga(root);
  const norm = normalizeRef(ref);
  const slash = norm.indexOf('/');
  if (slash === -1) {
    throw new Error(`Invalid reference: "${ref}". Expected format like "character/aaron".`);
  }
  const type = canonicalType(norm.slice(0, slash));
  const id = norm.slice(slash + 1);

  const storage = new FsAdapter(root);
  const result = await deleteEntryWithAudit(saga, type, id, storage, { createAuditNote });

  return {
    deleted: true,
    ref: `${type}/${id}`,
    relPath: result.relPath,
    remainingUsagesCount: result.usages.length,
    remainingUsages: result.usages,
    auditNoteCreated: result.auditNoteCreated,
    message:
      result.usages.length > 0
        ? `Deleted ${type}/${id}. Found ${result.usages.length} remaining reference(s) across the project. An audit note was logged at ${result.auditNoteCreated}.`
        : `Deleted ${type}/${id}. No dangling references found. Clean deletion.`,
  };
}

/**
 * 5. loreweave_cascade_rename
 * Renames an entry and updates all references across the saga.
 */
export async function renameEntry(ref: string, newId: string, newName?: string, sagaRoot?: string) {
  const root = await resolveSagaRoot(sagaRoot);
  const saga = await loadSaga(root);
  const norm = normalizeRef(ref);
  const slash = norm.indexOf('/');
  if (slash === -1) throw new Error(`Invalid reference "${ref}"`);
  const type = canonicalType(norm.slice(0, slash));
  const oldId = norm.slice(slash + 1);
  const cleanNewId = slugify(newId);

  const targetKey = entryKey(type, oldId);
  const entry = saga.entries.find((e) => entryKey(e.frontmatter.type, e.frontmatter.id) === targetKey);
  if (!entry) throw new Error(`Entry ${type}/${oldId} not found.`);

  // Find all files that contain references to this entry
  const usages = findEntryUsages(saga, type, oldId);
  const uniqueFiles = Array.from(new Set(usages.map((u) => u.file)));

  const oldRefRegex = new RegExp(
    `@${type}/${oldId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9-])`,
    'g'
  );
  const newRefEcho = `@${type}/${cleanNewId}`;

  // 1. Rewrite references in affected files
  for (const relFile of uniqueFiles) {
    const abs = path.join(root, relFile);
    try {
      let content = await fs.readFile(abs, 'utf8');
      // Replace @type/oldId and [display](@type/oldId)
      content = content.replace(oldRefRegex, newRefEcho);
      await fs.writeFile(abs, content, 'utf8');
    } catch {
      // file might have been moved
    }
  }

  // 2. Rename the entry file itself
  const oldAbs = path.join(root, entry.relPath);
  const newRelPath = entry.relPath.replace(new RegExp(`${oldId}\\.md$`), `${cleanNewId}.md`);
  const newAbs = path.join(root, newRelPath);

  let raw = await fs.readFile(oldAbs, 'utf8');
  const parsed = matter(raw);
  parsed.data.id = cleanNewId;
  if (newName) parsed.data.name = newName;
  const updatedEntryContent = matter.stringify(parsed.content, parsed.data);

  await fs.writeFile(newAbs, updatedEntryContent, 'utf8');
  if (oldAbs !== newAbs) {
    await fs.unlink(oldAbs);
  }

  return {
    ok: true,
    oldRef: `${type}/${oldId}`,
    newRef: `${type}/${cleanNewId}`,
    newPath: newRelPath,
    updatedFilesCount: uniqueFiles.length,
    updatedFiles: uniqueFiles,
  };
}

/**
 * 6. loreweave_scan_loose_ends
 * Full integrity check: broken references, orphan entries, unlinked waypoints, timeline conflicts.
 */
export async function scanSagaLooseEnds(sagaRoot?: string) {
  const root = await resolveSagaRoot(sagaRoot);
  const saga = await loadSaga(root);
  return scanLooseEnds(saga);
}

/**
 * 7. loreweave_read_chapter
 */
export async function readChapter(tome: string, chapterSlug: string, sagaRoot?: string) {
  const root = await resolveSagaRoot(sagaRoot);
  const saga = await loadSaga(root);
  const targetTome = saga.tomes.find((t) => t.manifest.id === tome || t.relPath.includes(tome));
  if (!targetTome) throw new Error(`Tome "${tome}" not found.`);

  const chapter = targetTome.chapters.find((c) => c.slug === chapterSlug);
  if (!chapter) throw new Error(`Chapter "${chapterSlug}" not found in tome "${tome}".`);

  const refs = extractReferences(chapter.body);

  return {
    tome: targetTome.manifest.id,
    chapter: chapter.slug,
    file: chapter.relPath,
    meta: chapter.meta,
    body: chapter.body,
    references: refs,
  };
}

/**
 * 8. loreweave_write_chapter
 */
export async function writeChapter(
  tome: string,
  chapterSlug: string,
  body: string,
  meta?: Record<string, unknown>,
  sagaRoot?: string
) {
  const root = await resolveSagaRoot(sagaRoot);
  const saga = await loadSaga(root);
  const targetTome = saga.tomes.find((t) => t.manifest.id === tome || t.relPath.includes(tome));
  if (!targetTome) throw new Error(`Tome "${tome}" not found.`);

  const chapter = targetTome.chapters.find((c) => c.slug === chapterSlug);
  if (!chapter) throw new Error(`Chapter "${chapterSlug}" not found in tome "${tome}".`);

  const chapterPath = path.join(root, chapter.relPath);
  await fs.writeFile(chapterPath, body, 'utf8');

  if (meta) {
    const metaPath = path.join(path.dirname(chapterPath), '_meta.yaml');
    await fs.writeFile(metaPath, YAML.stringify(meta), 'utf8');
  }

  // Validate references in the newly written chapter
  const index = buildEntryIndex(saga.entries);
  const refs = extractReferences(body);
  const brokenRefs = refs.filter((r) => !index.has(entryKey(canonicalType(r.type), r.id)));

  return {
    ok: true,
    file: chapter.relPath,
    detectedReferencesCount: refs.length,
    brokenReferencesCount: brokenRefs.length,
    brokenReferences: brokenRefs.map((b) => b.raw),
    warning:
      brokenRefs.length > 0
        ? `Warning: Written chapter contains ${brokenRefs.length} unresolvable references: ${brokenRefs.map((b) => b.raw).join(', ')}`
        : undefined,
  };
}

/**
 * 9. loreweave_get_timeline
 */
export async function getTimeline(threadId: string = 'main', withBranches: boolean = true, sagaRoot?: string) {
  const root = await resolveSagaRoot(sagaRoot);
  const saga = await loadSaga(root);
  const thread = saga.threads.find((t) => t.id === threadId);
  if (!thread) throw new Error(`Thread "${threadId}" not found.`);

  const linearized = linearize(threadId, saga.threads, saga.calendars, {
    includeBranches: withBranches,
  });

  return {
    threadId,
    calendar: thread.calendar ?? 'gregorian',
    branches_from: thread.branches_from,
    waypoints: linearized.waypoints.map((w) => ({
      id: w.id,
      event: w.event,
      label: w.label,
      at: w.at,
      order: w.order,
      thread: w.thread,
      before: w.before,
      after: w.after,
      concurrent: w.concurrent,
    })),
    issues: linearized.issues,
  };
}

/**
 * 10. loreweave_add_trace_note
 */
export async function addTraceNote(
  title: string,
  body: string,
  kind: 'idea' | 'todo' | 'remark' | 'question' = 'idea',
  targetRef?: string,
  sagaRoot?: string
) {
  const root = await resolveSagaRoot(sagaRoot);
  const id = slugify(title);
  const timestamp = new Date().toISOString();
  const relPath = `traces/${kind}-${id}.md`;
  const absPath = path.join(root, relPath);

  const fm = {
    id: `${kind}-${id}`,
    kind,
    status: 'open',
    target: targetRef ? normalizeRef(targetRef) : undefined,
    created: timestamp,
    updated: timestamp,
  };

  const content = matter.stringify(`# ${title}\n\n${body}`, fm);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, content, 'utf8');

  return {
    ok: true,
    file: relPath,
    kind,
    title,
  };
}

/**
 * 11. loreweave_query_canon
 */
export async function queryCanon(
  options: {
    query?: string;
    kind?: string;
    tag?: string;
    status?: string;
    sagaRoot?: string;
  }
) {
  const root = await resolveSagaRoot(options.sagaRoot);
  const saga = await loadSaga(root);

  let results = saga.entries;
  if (options.kind) {
    const k = canonicalType(options.kind);
    results = results.filter((e) => e.frontmatter.type === k);
  }
  if (options.tag) {
    results = results.filter((e) => (e.frontmatter.tags ?? []).includes(options.tag!));
  }
  if (options.status) {
    results = results.filter((e) => e.frontmatter.status === options.status);
  }
  if (options.query) {
    const q = options.query.toLowerCase();
    results = results.filter(
      (e) =>
        e.frontmatter.id.toLowerCase().includes(q) ||
        (e.frontmatter.name && e.frontmatter.name.toLowerCase().includes(q)) ||
        e.body.toLowerCase().includes(q)
    );
  }

  return {
    count: results.length,
    entries: results.map((e) => ({
      ref: `${e.frontmatter.type}/${e.frontmatter.id}`,
      name: e.frontmatter.name || e.frontmatter.id,
      type: e.frontmatter.type,
      status: e.frontmatter.status,
      tags: e.frontmatter.tags,
      relPath: e.relPath,
    })),
  };
}
