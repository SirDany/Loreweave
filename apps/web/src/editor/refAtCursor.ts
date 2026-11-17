/**
 * Small pure helpers that walk a chapter document to figure out which
 * `@type/id` echo the cursor is currently sitting in. Kept separate from
 * the CodeMirror editor so it can be unit-tested without jsdom.
 */

import { REF_REGEX, canonicalType } from '@loreweave/core';

export interface RefAtCursor {
  type: string;
  id: string;
  /** Optional display-text override extracted from `{...}` or `[...]`. */
  display?: string;
  /** 0-based character offset of the reference inside the document. */
  from: number;
  /** Exclusive end offset (from + raw.length). */
  to: number;
  raw: string;
}

/**
 * Return the echo / reference containing `pos`, or null if `pos` is outside
 * any echo. The cursor is considered "inside" when `from <= pos <= to`.
 */
export function refAtOffset(doc: string, pos: number): RefAtCursor | null {
  const re = new RegExp(REF_REGEX.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(doc))) {
    const from = m.index;
    const to = from + m[0].length;
    if (pos >= from && pos <= to) {
      if (m[1] !== undefined) {
        return {
          type: canonicalType(m[2]!),
          id: m[3]!,
          display: m[1],
          from,
          to,
          raw: m[0],
        };
      }
      return {
        type: canonicalType(m[5]!),
        id: m[6]!,
        display: m[8],
        from,
        to,
        raw: m[0],
      };
    }
  }
  return null;
}
