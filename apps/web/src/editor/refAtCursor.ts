/**
 * Small pure helpers that walk a chapter document to figure out which
 * `@type/id` echo the cursor is currently sitting in. Kept separate from
 * the CodeMirror editor so it can be unit-tested without jsdom.
 */

const REF_RE = /@([a-zA-Z]+)\/([a-zA-Z0-9\-_]+)/g;

export interface RefAtCursor {
  type: string;
  id: string;
  /** 0-based character offset of the `@` inside the document. */
  from: number;
  /** Exclusive end offset (from + raw.length). */
  to: number;
  raw: string;
}

/**
 * Return the `@type/id` echo containing `pos`, or null if `pos` is outside
 * any echo. The cursor is considered "inside" when `from <= pos <= to` —
 * a position immediately after the id counts, so typing a trailing letter
 * still resolves to the same entry.
 */
export function refAtOffset(doc: string, pos: number): RefAtCursor | null {
  for (const m of doc.matchAll(REF_RE)) {
    const from = m.index ?? 0;
    const to = from + m[0].length;
    if (pos >= from && pos <= to) {
      return { type: m[1]!, id: m[2]!, from, to, raw: m[0] };
    }
  }
  return null;
}
