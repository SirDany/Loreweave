/**
 * Builds the `RefCatalog` the CodeMirror editor uses for completion, broken-ref
 * decorations, and hover previews. Blends two data sources:
 *
 * - `DumpPayload` from `lw dump` — authoritative entry list, names, body.
 * - `CanonDigestPayload` from `/lw/digest` — resolved-weave cache (aliases,
 *   inherited properties, status). Optional; the catalog degrades gracefully
 *   when the digest is still loading or unavailable.
 */
import type {
  CanonDigestPayload,
  DumpEntry,
  DumpPayload,
} from './lw.js';
import type {
  RefCatalog,
  RefCatalogEntry,
} from '../editor/ReferenceExtension.js';

/** Extract a short summary (first prose sentence, capped) from an entry. */
export function entrySummary(e: DumpEntry): string | undefined {
  const fm = e.frontmatter as Record<string, unknown>;
  if (e.type === 'term' && typeof fm.definition === 'string') {
    return fm.definition as string;
  }
  const first = e.body
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !l.startsWith('#'));
  if (first && first.length > 200) return first.slice(0, 200) + '…';
  return first;
}

/** Pick the properties most useful in a hover card (bounded for UI sanity). */
const HOVER_PROP_LIMIT = 6;

function topProperties(
  props: Record<string, { value: unknown; from: string }> | undefined,
): Array<{ key: string; value: unknown; from: string }> | undefined {
  if (!props) return undefined;
  const pairs = Object.entries(props);
  if (pairs.length === 0) return undefined;
  // Stable ordering: alphabetical by key, drop objects/arrays past limit.
  return pairs
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, HOVER_PROP_LIMIT)
    .map(([key, v]) => ({ key, value: v.value, from: v.from }));
}

export function buildCatalog(
  data: DumpPayload,
  digest?: CanonDigestPayload | null,
): RefCatalog {
  const sigils = data.entries
    .filter((e) => e.type === 'sigil')
    .map((e) => e.id);

  const byRef = new Map<string, CanonDigestPayload['phoneBook'][number]>();
  const weaveByRef = new Map<string, CanonDigestPayload['weaves'][number]>();
  if (digest) {
    for (const p of digest.phoneBook) byRef.set(p.ref, p);
    for (const w of digest.weaves) weaveByRef.set(w.ref, w);
  }

  const entries: RefCatalogEntry[] = data.entries.map((e) => {
    const ref = `@${e.type}/${e.id}`;
    const phone = byRef.get(ref);
    const weave = weaveByRef.get(ref);
    return {
      type: e.type,
      id: e.id,
      name: e.name,
      // Prefer the digest's stripped summary; fall back to the body-based one.
      summary: phone?.summary || entrySummary(e),
      aliases: (phone?.aliases ?? e.aliases).length
        ? phone?.aliases ?? e.aliases
        : undefined,
      tags: phone?.tags ?? (e.tags.length > 0 ? e.tags : undefined),
      status: phone?.status ?? e.status ?? undefined,
      inheritsChain: weave?.inheritsChain,
      properties: topProperties(weave?.properties),
    };
  });

  return { entries, sigils };
}
