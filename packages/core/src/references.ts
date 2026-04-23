// Reference (a.k.a. "Echo") extractor: find @type/id tokens in text.
import type { EntryType } from "./types.js";

export interface Reference {
  type: EntryType;
  id: string;
  /** Offset in the source text. */
  offset: number;
  /** 1-based line number. */
  line: number;
  /** 1-based column. */
  column: number;
  /** The raw matched string, e.g. "@character/aaron". */
  raw: string;
}

const REF_RE =
  /@(character|location|concept|lore|waypoint|term|sigil)\/([a-z0-9][a-z0-9-]*)/g;

export function extractReferences(text: string): Reference[] {
  const out: Reference[] = [];
  let match: RegExpExecArray | null;
  // rebuild per-call to avoid shared lastIndex
  const re = new RegExp(REF_RE.source, "g");
  while ((match = re.exec(text))) {
    const offset = match.index;
    const prefix = text.slice(0, offset);
    const line = prefix.split("\n").length;
    const lastNL = prefix.lastIndexOf("\n");
    const column = offset - (lastNL + 1) + 1;
    out.push({
      type: match[1]! as EntryType,
      id: match[2]!,
      offset,
      line,
      column,
      raw: match[0],
    });
  }
  return out;
}

/** Normalizes "@type/id" or "type/id" to "type/id". */
export function normalizeRef(ref: string): string {
  return ref.replace(/^@/, "");
}
