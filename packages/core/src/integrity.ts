import { extractReferences, normalizeRef, canonicalType } from './references.js';
import { entryKey } from './types.js';
import type { Entry, EntryKey, Saga, Trace } from './types.js';
import type { StorageAdapter } from './storage.js';
import { buildEntryIndex } from './resolver.js';
import { linearize, type TimelineIssue } from './timeline.js';

export interface BrokenReference {
  raw: string;
  type: string;
  id: string;
  file: string;
  line: number;
  column?: number;
  sourceType: 'chapter' | 'scene' | 'entry' | 'thread' | 'note' | 'meta';
}

export interface OrphanEntry {
  type: string;
  id: string;
  name: string;
  file: string;
  status?: string | null;
}

export interface UnlinkedWaypoint {
  id: string;
  name: string;
  file: string;
}

export interface LooseEndsReport {
  brokenReferences: BrokenReference[];
  orphanEntries: OrphanEntry[];
  unlinkedWaypoints: UnlinkedWaypoint[];
  timelineIssues: TimelineIssue[];
  totalIssues: number;
}

export interface EntryUsage {
  file: string;
  line: number;
  column?: number;
  raw: string;
  sourceType: 'chapter' | 'scene' | 'entry' | 'thread' | 'note' | 'meta';
  contextSnippet?: string;
}

/**
 * Scans a Saga for loose ends:
 * 1. Broken references (links to nonexistent entities)
 * 2. Orphan entries (entries with 0 references across the entire project)
 * 3. Unlinked waypoints (codex waypoints not placed on any thread)
 * 4. Timeline issues (chronological contradictions or cycles)
 */
export function scanLooseEnds(saga: Saga): LooseEndsReport {
  const index = buildEntryIndex(saga.entries);
  const byEcho = saga.kinds?.byEcho;
  const brokenReferences: BrokenReference[] = [];
  const incomingRefCounts = new Map<EntryKey, number>();

  for (const e of saga.entries) {
    incomingRefCounts.set(entryKey(e.frontmatter.type, e.frontmatter.id), 0);
  }

  function recordRef(rawTarget: string, file: string, line: number, column: number | undefined, raw: string, sourceType: BrokenReference['sourceType']) {
    const normalized = normalizeRef(rawTarget);
    const slash = normalized.indexOf('/');
    if (slash === -1) return;
    const rawType = normalized.slice(0, slash);
    const id = normalized.slice(slash + 1);
    const resolvedType = byEcho?.get(rawType) ?? canonicalType(rawType);
    const key = entryKey(resolvedType, id);

    if (index.has(key)) {
      const curr = incomingRefCounts.get(key) ?? 0;
      incomingRefCounts.set(key, curr + 1);
    } else {
      brokenReferences.push({
        raw,
        type: resolvedType,
        id,
        file,
        line,
        column,
        sourceType,
      });
    }
  }

  // 1. Scan Chapter bodies
  for (const t of saga.tomes) {
    for (const c of t.chapters) {
      for (const ref of extractReferences(c.body)) {
        recordRef(ref.raw, c.relPath, ref.line, ref.column, ref.raw, 'chapter');
      }
      // Scan chapter metadata (_meta.yaml)
      const meta = c.meta as Record<string, unknown> | undefined;
      if (meta) {
        if (Array.isArray(meta.pov)) {
          for (const item of meta.pov) {
            if (typeof item === 'string') {
              recordRef(item, `${c.relPath}/_meta.yaml`, 1, 1, item, 'meta');
            }
          }
        }
        if (Array.isArray(meta.linked_events)) {
          for (const item of meta.linked_events) {
            if (typeof item === 'string') {
              recordRef(item, `${c.relPath}/_meta.yaml`, 1, 1, item, 'meta');
            }
          }
        }
      }
    }
  }

  // 2. Scan Entry bodies and frontmatter
  for (const e of saga.entries) {
    const fm = e.frontmatter;
    for (const ref of extractReferences(e.body)) {
      recordRef(ref.raw, e.relPath, ref.line, ref.column, ref.raw, 'entry');
    }
    // inherits & tags (sigils)
    for (const sigilId of fm.inherits ?? []) {
      recordRef(`sigil/${sigilId}`, e.relPath, 1, 1, `inherits: ${sigilId}`, 'entry');
    }
    for (const sigilId of fm.tags ?? []) {
      recordRef(`sigil/${sigilId}`, e.relPath, 1, 1, `tags: ${sigilId}`, 'entry');
    }
    // speaks / spoken_here
    for (const sigilId of fm.speaks ?? []) {
      recordRef(`sigil/${sigilId}`, e.relPath, 1, 1, `speaks: ${sigilId}`, 'entry');
    }
    for (const sigilId of fm.spoken_here ?? []) {
      recordRef(`sigil/${sigilId}`, e.relPath, 1, 1, `spoken_here: ${sigilId}`, 'entry');
    }
    // slang_of
    const slangOf = (fm as { slang_of?: string }).slang_of;
    if (slangOf) {
      recordRef(`sigil/${slangOf}`, e.relPath, 1, 1, `slang_of: ${slangOf}`, 'entry');
    }
  }

  // 3. Scan Threads & Waypoints
  const waypointsPlacedOnThreads = new Set<string>();
  for (const t of saga.threads) {
    for (const wp of t.waypoints) {
      const normalizedEvent = normalizeRef(wp.event);
      recordRef(normalizedEvent, t.relPath, 1, 1, wp.event, 'thread');
      const eventId = normalizedEvent.startsWith('waypoint/')
        ? normalizedEvent.slice('waypoint/'.length)
        : normalizedEvent;
      waypointsPlacedOnThreads.add(eventId);
    }
  }

  // 4. Scan Notes / Traces
  for (const trace of saga.traces ?? []) {
    for (const ref of extractReferences(trace.body)) {
      recordRef(ref.raw, trace.relPath, ref.line, ref.column, ref.raw, 'note');
    }
  }

  // 5. Detect Orphan Entries
  const orphanEntries: OrphanEntry[] = [];
  for (const e of saga.entries) {
    const key = entryKey(e.frontmatter.type, e.frontmatter.id);
    const count = incomingRefCounts.get(key) ?? 0;
    if (count === 0) {
      orphanEntries.push({
        type: e.frontmatter.type,
        id: e.frontmatter.id,
        name: e.frontmatter.name || e.frontmatter.id,
        file: e.relPath,
        status: e.frontmatter.status ?? null,
      });
    }
  }

  // 6. Detect Unlinked Waypoints
  const unlinkedWaypoints: UnlinkedWaypoint[] = [];
  for (const e of saga.entries) {
    if (e.frontmatter.type === 'waypoint') {
      if (!waypointsPlacedOnThreads.has(e.frontmatter.id)) {
        unlinkedWaypoints.push({
          id: e.frontmatter.id,
          name: e.frontmatter.name || e.frontmatter.id,
          file: e.relPath,
        });
      }
    }
  }

  // 7. Detect Timeline Issues
  const timelineIssues: TimelineIssue[] = [];
  for (const t of saga.threads) {
    const res = linearize(t.id, saga.threads, saga.calendars, {
      includeBranches: Boolean(t.branches_from),
    });
    timelineIssues.push(...res.issues);
  }

  const totalIssues =
    brokenReferences.length +
    orphanEntries.length +
    unlinkedWaypoints.length +
    timelineIssues.length;

  return {
    brokenReferences,
    orphanEntries,
    unlinkedWaypoints,
    timelineIssues,
    totalIssues,
  };
}

/**
 * Finds all references to a specific entry (by type and id) across the entire Saga.
 */
export function findEntryUsages(saga: Saga, type: string, id: string): EntryUsage[] {
  const normTarget = `${canonicalType(type)}/${id}`;
  const usages: EntryUsage[] = [];

  function checkText(body: string, file: string, sourceType: EntryUsage['sourceType']) {
    const lines = body.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i] ?? '';
      const refs = extractReferences(lineText);
      for (const ref of refs) {
        if (`${canonicalType(ref.type)}/${ref.id}` === normTarget) {
          usages.push({
            file,
            line: i + 1,
            column: ref.column,
            raw: ref.raw,
            sourceType,
            contextSnippet: lineText.trim(),
          });
        }
      }
    }
  }

  // Chapters
  for (const t of saga.tomes) {
    for (const c of t.chapters) {
      checkText(c.body, c.relPath, 'chapter');
      const meta = c.meta as Record<string, unknown> | undefined;
      if (meta) {
        const metaRefs = [
          ...(Array.isArray(meta.pov) ? meta.pov : []),
          ...(Array.isArray(meta.linked_events) ? meta.linked_events : []),
        ];
        for (const m of metaRefs) {
          if (typeof m === 'string' && normalizeRef(m) === normTarget) {
            usages.push({
              file: `${c.relPath}/_meta.yaml`,
              line: 1,
              raw: m,
              sourceType: 'meta',
              contextSnippet: m,
            });
          }
        }
      }
    }
  }

  // Entries
  for (const e of saga.entries) {
    checkText(e.body, e.relPath, 'entry');
    const fm = e.frontmatter;
    if (type === 'sigil') {
      const sigilLists = [
        ...(fm.tags ?? []),
        ...(fm.inherits ?? []),
        ...(fm.speaks ?? []),
        ...(fm.spoken_here ?? []),
      ];
      if (sigilLists.includes(id)) {
        usages.push({
          file: e.relPath,
          line: 1,
          raw: id,
          sourceType: 'entry',
          contextSnippet: `sigil reference: ${id}`,
        });
      }
    }
  }

  // Threads
  for (const t of saga.threads) {
    for (const wp of t.waypoints) {
      if (normalizeRef(wp.event) === normTarget) {
        usages.push({
          file: t.relPath,
          line: 1,
          raw: wp.event,
          sourceType: 'thread',
          contextSnippet: `waypoint ${wp.id}: ${wp.event}`,
        });
      }
    }
  }

  // Traces / Notes
  for (const tr of saga.traces ?? []) {
    checkText(tr.body, tr.relPath, 'note');
  }

  return usages;
}

export interface DeleteWithAuditResult {
  deleted: boolean;
  relPath: string;
  type: string;
  id: string;
  usages: EntryUsage[];
  auditNoteCreated?: string;
}

/**
 * Deletes an entry and scans the entire Saga for any remaining references.
 * If any references remain, generates an audit note so the author/agent can clean them up.
 */
export async function deleteEntryWithAudit(
  saga: Saga,
  type: string,
  id: string,
  storage: StorageAdapter,
  opts?: { createAuditNote?: boolean }
): Promise<DeleteWithAuditResult> {
  const normType = canonicalType(type);
  const targetKey = entryKey(normType, id);
  const entry = saga.entries.find(
    (e) => entryKey(e.frontmatter.type, e.frontmatter.id) === targetKey
  );

  if (!entry) {
    throw new Error(`Entry ${normType}/${id} does not exist in saga.`);
  }

  // 1. Scan for all usages before deleting
  const usages = findEntryUsages(saga, normType, id);

  // 2. Delete the entry file
  if (typeof storage.deletePath === 'function') {
    await storage.deletePath(entry.relPath);
  }

  // 3. If there are dangling usages, create a trace note
  let auditNoteCreated: string | undefined;
  if (usages.length > 0 && (opts?.createAuditNote ?? true)) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const auditRelPath = `notes/audit-deleted-${normType}-${id}-${timestamp}.md`;
    const content = [
      `---`,
      `id: audit-deleted-${normType}-${id}`,
      `title: "Audit: Deleted ${normType}/${id}"`,
      `type: note`,
      `status: todo`,
      `created_at: "${new Date().toISOString()}"`,
      `---`,
      `# Loose Ends Audit: Deleted @${normType}/${id}`,
      ``,
      `The entity \`@${normType}/${id}\` (${entry.frontmatter.name || id}) was deleted.`,
      `The following ${usages.length} references were found across the saga and require attention:`,
      ``,
      ...usages.map(
        (u) => `- [ ] \`${u.file}\` (line ${u.line}): \`${u.raw}\` ${u.contextSnippet ? `— *"${u.contextSnippet}"*` : ''}`
      ),
      ``,
    ].join('\n');

    await storage.writeFile(auditRelPath, content);
    auditNoteCreated = auditRelPath;
  }

  return {
    deleted: true,
    relPath: entry.relPath,
    type: normType,
    id,
    usages,
    auditNoteCreated,
  };
}
