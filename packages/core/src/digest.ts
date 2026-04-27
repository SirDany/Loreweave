/**
 * Canon digest — a compact, JSON-serializable snapshot of a Saga designed
 * for LLM system prompts and cheap agent grounding. The digest deliberately
 * omits prose bodies, timelines full of metadata, and the like; callers
 * that need a full snapshot should use `lw dump`.
 *
 * Build from a freshly-loaded Saga with {@link buildDigest}. On the hosted
 * path the digest is also keyed by a commit SHA so caches invalidate
 * atomically on write.
 */
import { buildEntryIndex, resolve } from './resolver.js';
import { linearize } from './timeline.js';
import type { CalendarSpec, Entry, Saga, Thread } from './types.js';

/** Compact record per entry — safe to splat into a system prompt. */
export interface PhoneBookEntry {
  ref: string;
  type: string;
  name: string;
  aliases?: string[];
  tags?: string[];
  relPath: string;
  /** First sentence of the body, capped. Empty when the entry has no prose. */
  summary: string;
  status?: string;
  appearsIn?: string[];
}

export interface DigestWeaveEntry {
  ref: string;
  inheritsChain: string[];
  /** Resolved property keys with provenance (`own`, `override`, `sigil:<id>`). */
  properties: Record<
    string,
    { value: unknown; from: string }
  >;
}

export interface DigestThreadWaypoint {
  id: string;
  label?: string;
  at?: string;
  event: string;
  eventName?: string;
}

export interface DigestThread {
  id: string;
  calendar?: string;
  branchesFrom?: string;
  waypoints: DigestThreadWaypoint[];
  /** Issues surfaced during linearization (broken refs, date contradictions…). */
  issues: Array<{ kind: string; message: string }>;
}

export interface CanonDigest {
  /** Schema version — bump on any non-additive change. */
  version: 1;
  /** Saga id from the manifest, for cross-checking. */
  sagaId: string;
  /** Opaque key callers can use for cache invalidation (commit SHA, content hash, …). */
  revision: string | null;
  /** ISO timestamp the digest was built. */
  builtAt: string;
  counts: {
    entries: number;
    tomes: number;
    threads: number;
    traces: number;
  };
  phoneBook: PhoneBookEntry[];
  weaves: DigestWeaveEntry[];
  threads: DigestThread[];
  tomes: Array<{ id: string; title?: string; chapterCount: number }>;
}

const SUMMARY_CHAR_CAP = 180;

/** Extract a one-sentence summary from a markdown body, stripping headings. */
function summarize(body: string): string {
  if (!body) return '';
  const cleaned = body
    .replace(/^---\s*[\s\S]*?---\s*/, '') // stray frontmatter
    .replace(/^#.*$/gm, '') // headings
    .replace(/`[^`]*`/g, '') // inline code
    .replace(/\!\[[^\]]*\]\([^\)]*\)/g, '') // images
    .replace(/\[[^\]]*\]\([^\)]*\)/g, (m) => m.replace(/\]\([^\)]*\)/, ''))
    .replace(/[*_>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  // First sentence, or first chunk up to the cap.
  const m = cleaned.match(/^[^.!?]+[.!?]/);
  const first = (m ? m[0] : cleaned).trim();
  if (first.length <= SUMMARY_CHAR_CAP) return first;
  return first.slice(0, SUMMARY_CHAR_CAP - 1).trimEnd() + '…';
}

function entryRef(e: Entry): string {
  return `@${e.frontmatter.type}/${e.frontmatter.id}`;
}

function phoneBookFor(e: Entry): PhoneBookEntry {
  const fm = e.frontmatter;
  return {
    ref: entryRef(e),
    type: fm.type,
    name: fm.name ?? fm.id,
    aliases: fm.aliases?.length ? fm.aliases : undefined,
    tags: fm.tags?.length ? fm.tags : undefined,
    relPath: e.relPath,
    summary: summarize(e.body),
    status: fm.status,
    appearsIn: fm.appears_in?.length ? fm.appears_in : undefined,
  };
}

function weaveFor(e: Entry, index: ReturnType<typeof buildEntryIndex>): DigestWeaveEntry {
  try {
    const r = resolve(e, index);
    const properties: DigestWeaveEntry['properties'] = {};
    for (const [k, v] of Object.entries(r.properties)) {
      properties[k] = { value: v, from: r.provenance[k] ?? 'own' };
    }
    return {
      ref: entryRef(e),
      inheritsChain: r.inheritsChain,
      properties,
    };
  } catch {
    // Cycle or other resolver failure — surface an empty weave so the
    // digest still builds; the validator will flag the underlying issue.
    return { ref: entryRef(e), inheritsChain: [], properties: {} };
  }
}

function threadDigest(
  t: Thread,
  threads: Thread[],
  calendars: CalendarSpec[],
  entryByWaypointId: Map<string, Entry>,
): DigestThread {
  const { waypoints, issues } = linearize(t.id, threads, calendars);
  return {
    id: t.id,
    calendar: t.calendar,
    branchesFrom: t.branches_from?.thread,
    waypoints: waypoints.map((w) => {
      const evId = w.event.replace(/^@?waypoint\//, '');
      const entry = entryByWaypointId.get(evId);
      return {
        id: w.id,
        label: w.label,
        at: w.at,
        event: w.event,
        eventName: entry?.frontmatter.name,
      };
    }),
    issues: issues.map((i) => ({ kind: i.kind, message: i.message })),
  };
}

export interface BuildDigestOptions {
  /** Opaque revision tag — typically a git HEAD SHA. */
  revision?: string | null;
}

export function buildDigest(saga: Saga, opts: BuildDigestOptions = {}): CanonDigest {
  const index = buildEntryIndex(saga.entries);
  const waypointEntries = new Map<string, Entry>();
  for (const e of saga.entries) {
    if (e.frontmatter.type === 'waypoint') {
      waypointEntries.set(e.frontmatter.id, e);
    }
  }

  return {
    version: 1,
    sagaId: saga.manifest.id,
    revision: opts.revision ?? null,
    builtAt: new Date().toISOString(),
    counts: {
      entries: saga.entries.length,
      tomes: saga.tomes.length,
      threads: saga.threads.length,
      traces: saga.traces.length,
    },
    phoneBook: saga.entries.map(phoneBookFor),
    // Sigils don't have a meaningful own "weave" (they ARE the source of
    // inherited properties), so we skip them to halve the digest size.
    weaves: saga.entries
      .filter((e) => e.frontmatter.type !== 'sigil')
      .map((e) => weaveFor(e, index))
      .filter((w) => w.inheritsChain.length > 0 || Object.keys(w.properties).length > 0),
    threads: saga.threads.map((t) =>
      threadDigest(t, saga.threads, saga.calendars, waypointEntries),
    ),
    tomes: saga.tomes.map((t) => ({
      id: t.manifest.id,
      title: t.manifest.title,
      chapterCount: t.chapters.length,
    })),
  };
}

/**
 * Render the phone book as a compact markdown table-ish block suitable for
 * a system prompt. Agents get every canonical ref with a one-line summary,
 * which lets them recognize names they see in prose without calling
 * `lw_dump`.
 */
export function renderPhoneBook(digest: CanonDigest): string {
  if (digest.phoneBook.length === 0) return '_(no canon entries yet)_';
  const lines: string[] = [];
  lines.push('| Ref | Name | Type | Summary |');
  lines.push('| --- | --- | --- | --- |');
  for (const p of digest.phoneBook) {
    const aliasPart =
      p.aliases && p.aliases.length > 0 ? ` _(a.k.a. ${p.aliases.join(', ')})_` : '';
    const summary = p.summary.replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
    lines.push(
      `| \`${p.ref}\` | ${p.name}${aliasPart} | ${p.type} | ${summary || '—'} |`,
    );
  }
  return lines.join('\n');
}
