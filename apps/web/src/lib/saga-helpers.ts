/**
 * Saga-aware UI helpers — pure functions over loaded `DumpPayload` data.
 *
 * Lives in `lib/` so views can import without dragging in components.
 * Not in `helpers.ts` because those are test-only pure utilities and
 * this file imports the dump shape.
 */
import type { DumpChapter, DumpEntry, DumpPayload } from './lw.js';
import type { TargetSuggestion } from '../views/NewTraceDialog.js';
import type { Section, Selection } from '../state/types.js';

const REF_RE =
  /@([a-z][a-z0-9-]*)\/([a-z0-9][a-z0-9-]*)(?:\{([^}\n]*)\})?/g;

/**
 * Count how many `@<entry.type>/<entry.id>` echoes appear across all
 * entry bodies and chapter prose in the Saga.
 */
export function getUsagesCount(entry: DumpEntry, data: DumpPayload): number {
  const bodies: string[] = [];
  for (const e of data.entries) bodies.push(e.body);
  for (const t of data.tomes) for (const c of t.chapters) bodies.push(c.body);
  const needle = `${entry.type}/${entry.id}`;
  let count = 0;
  for (const body of bodies) {
    for (const m of body.matchAll(REF_RE)) {
      if (`${m[1]}/${m[2]}` === needle) count++;
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
 * Look up a chapter by `<tomeId>::<chapterSlug>` selection key.
 */
export function findChapter(
  data: DumpPayload,
  key: string,
): { tome: string; chapter: DumpChapter } | null {
  const [tomeId, slug] = key.split('::');
  const tome = data.tomes.find((t) => t.id === tomeId);
  if (!tome) return null;
  const chapter = tome.chapters.find((c) => c.slug === slug);
  return chapter ? { tome: tome.id, chapter } : null;
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
      return 'Rewrite the selected passage. Honor existing canon; do not invent new facts.';
    case 'warden':
      return 'Does the selected passage contradict anything in the Codex? Check canon and Sigil slang.';
    case 'polisher':
      return 'Polish the selected passage for grammar and flow. Do not change meaning or canon.';
    case 'muse':
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
