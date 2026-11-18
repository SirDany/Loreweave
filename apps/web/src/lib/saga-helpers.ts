/**
 * Saga-aware UI helpers — pure functions over loaded `DumpPayload` data.
 *
 * Lives in `lib/` so views can import without dragging in components.
 * Not in `helpers.ts` because those are test-only pure utilities and
 * this file imports the dump shape.
 */
import { canonicalType, REF_REGEX } from '@loreweave/core';
import type { DumpChapter, DumpEntry, DumpPayload } from './lw.js';
import type { TargetSuggestion } from '../views/NewTraceDialog.js';
import type { Section, Selection } from '../state/types.js';

/**
 * Count how many `@<entry.type>/<entry.id>` or `[Display](@type/id)` echoes
 * appear across all other entry bodies and chapter prose in the Saga.
 */
export function getUsagesCount(entry: DumpEntry, data: DumpPayload): number {
  const bodies: string[] = [];
  for (const e of data.entries) {
    if (e.type === entry.type && e.id === entry.id) continue;
    bodies.push(e.body);
  }
  for (const t of data.tomes) for (const c of t.chapters) bodies.push(c.body);
  const needle = `${canonicalType(entry.type)}/${entry.id}`;
  let count = 0;
  for (const body of bodies) {
    const re = new RegExp(REF_REGEX.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(body))) {
      const refType =
        m[1] !== undefined ? canonicalType(m[2]!) : canonicalType(m[5]!);
      const refId = m[1] !== undefined ? m[3]! : m[6]!;
      if (`${refType}/${refId}` === needle) count++;
    }
  }
  return count;
}

/**
 * Tome-scope filter: when `tome` is set, drop entries that explicitly
 * declare `appears_in` and don't include this tome.
 */
export function applyTomeFilter(
  entries: DumpEntry[],
  tome: string | null,
): DumpEntry[] {
  if (!tome) return entries;
  return entries.filter(
    (e) =>
      !e.appears_in || e.appears_in.length === 0 || e.appears_in.includes(tome),
  );
}

/**
 * Look up a chapter by `<tomeId>::<chapterSlug>`, `tomeId/chapterSlug`,
 * `tomes/<tomeId>/story/<slug>` (with optional `/chapter.md` or `/_meta.yaml`),
 * or direct `relPath`.
 */
export function findChapter(
  data: DumpPayload,
  key: string,
): { tome: string; chapter: DumpChapter } | null {
  const normalized = key.replace(/\\/g, '/').replace(/\/+$/, '');
  for (const t of data.tomes) {
    for (const c of t.chapters) {
      if (
        c.relPath === normalized ||
        c.relPath.replace(/\/chapter\.md$/, '') === normalized
      ) {
        return { tome: t.id, chapter: c };
      }
    }
  }
  const pathMatch = normalized.match(
    /^tomes\/([^/]+)\/story\/([^/]+)(?:\/(?:chapter\.md|_meta\.yaml))?$/,
  );
  if (pathMatch) {
    const tome = data.tomes.find((t) => t.id === pathMatch[1]);
    if (tome) {
      const chapter = tome.chapters.find((c) => c.slug === pathMatch[2]);
      if (chapter) return { tome: tome.id, chapter };
    }
  }
  const sep = normalized.includes('::') ? '::' : '/';
  const parts = normalized.split(sep);
  if (parts.length >= 2) {
    const [tomeId, slug] = parts;
    const tome = data.tomes.find((t) => t.id === tomeId);
    if (!tome) return null;
    const chapter = tome.chapters.find((c) => c.slug === slug);
    return chapter ? { tome: tome.id, chapter } : null;
  }
  return null;
}

/**
 * Map an entry-key prefix back to its Grimoire section. `term` →
 * lexicon, `sigil` → sigils, everything else → codex.
 */
export function entryTypeToSection(key: string): Section {
  const type = key.split('/')[0];
  if (type === 'term') return 'lexicon';
  if (type === 'sigil') return 'sigils';
  return 'codex';
}

/**
 * Build the target-picker suggestion list for the New Trace dialog.
 */
export function buildTargetSuggestions(data: DumpPayload): TargetSuggestion[] {
  const out: TargetSuggestion[] = [];
  for (const e of data.entries) {
    out.push({ value: `@${e.type}/${e.id}`, label: e.name, detail: e.type });
  }
  for (const t of data.tomes) {
    for (const c of t.chapters) {
      out.push({
        value: `chapter:${t.id}/${c.slug}`,
        label: c.title,
        detail: t.title,
      });
    }
  }
  return out;
}

/**
 * Default Assistant prompt for inline editor actions.
 */
export function assistantPromptFor(action: string): string {
  switch (action) {
    case 'scribe':
    case 'rewrite':
    case 'scribe-rewrite':
      return 'Rewrite the selected passage. Honor existing canon; do not invent new facts.';
    case 'warden':
    case 'audit':
    case 'scribe-audit':
      return 'Does the selected passage contradict anything in the Codex? Check canon and Sigil slang.';
    case 'polisher':
    case 'polish':
    case 'scribe-polish':
      return 'Polish the selected passage for grammar, rhythm, and flow. Do not change meaning or canon.';
    case 'muse':
    case 'brainstorm':
    case 'scribe-brainstorm':
    default:
      return 'What should I think about regarding this passage? Offer 2–4 distinct options, each with tradeoffs.';
  }
}

/**
 * Compute the relevant traces for the currently selected entry.
 */
export function relatedTracesFor(
  entry: DumpEntry | null,
  data: DumpPayload,
): DumpPayload['traces'] {
  if (!entry) return [];
  const needle = `${entry.type}/${entry.id}`;
  return data.traces.filter((n) => {
    const t = n.target;
    if (!t) return false;
    return t.replace(/^@/, '') === needle;
  });
}

export type Jumper = (loc: {
  kind: 'entry' | 'chapter';
  key: string;
  line?: number;
}) => void;

/**
 * Jump to a target string emitted by traces / search results
 * (`@type/id`, `chapter:tome/slug`, `tome:...`, `saga`).
 */
export function jumpToTarget(
  target: string,
  setSelection: (s: Selection | null) => void,
  setSection: (s: Section) => void,
): void {
  if (target.startsWith('chapter:')) {
    const key = target.slice('chapter:'.length).replace('/', '::');
    setSelection({ kind: 'chapter', key });
    setSection('story');
    return;
  }
  if (target.startsWith('tome:')) return;
  if (target === 'saga') return;
  const cleaned = target.replace(/^@/, '');
  setSelection({ kind: 'entry', key: cleaned });
  setSection(entryTypeToSection(cleaned));
}
