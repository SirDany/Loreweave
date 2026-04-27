// Reference (a.k.a. "Echo") extractor: find @type/id tokens in text.
//
// Phase 1: the prefix is a free kebab-case string. The validator looks
// it up in the loaded Kind catalog (built-ins + saga `kinds/*.md`) to
// decide whether to flag it as a broken-reference.
//
// Phase 5+: an optional `{display text}` suffix overrides the rendered
// label without changing the underlying reference target. For example
// `@character/aaron{the king}` resolves to character/aaron but renders
// as "the king" in previews and exports. The link target is preserved
// so cross-references, audits, and renames keep working.

export interface Reference {
  /**
   * The echo prefix as it appears in source. May be a Kind id, an alias
   * declared in a Kind file, or an unknown prefix (which the validator
   * will flag).
   */
  type: string;
  id: string;
  /** Offset in the source text. */
  offset: number;
  /** 1-based line number. */
  line: number;
  /** 1-based column. */
  column: number;
  /** The raw matched string, e.g. "@character/aaron" or "@character/aaron{the king}". */
  raw: string;
  /**
   * Optional display-text override: the contents of the `{...}` suffix,
   * if present. Undefined means "use the resolved entity's name".
   * Empty strings are preserved so callers can detect explicit blanks.
   */
  display?: string;
}

/**
 * Canonical Echo regex. Match groups:
 *   1: type prefix
 *   2: id
 *   3: optional display-text override (no braces or newlines inside)
 *
 * Exported so the web app and CLI keep their tooling in sync without
 * redefining the pattern. The pattern carries the `g` flag; callers
 * that need a fresh `lastIndex` should `new RegExp(REF_REGEX.source, 'g')`.
 */
export const REF_REGEX =
  /@([a-z][a-z0-9-]*)\/([a-z0-9][a-z0-9-]*)(?:\{([^}\n]*)\})?/g;

export function extractReferences(text: string): Reference[] {
  const out: Reference[] = [];
  let match: RegExpExecArray | null;
  // rebuild per-call to avoid shared lastIndex
  const re = new RegExp(REF_REGEX.source, "g");
  while ((match = re.exec(text))) {
    const offset = match.index;
    const prefix = text.slice(0, offset);
    const line = prefix.split("\n").length;
    const lastNL = prefix.lastIndexOf("\n");
    const column = offset - (lastNL + 1) + 1;
    out.push({
      type: match[1]!,
      id: match[2]!,
      display: match[3],
      offset,
      line,
      column,
      raw: match[0],
    });
  }
  return out;
}

/**
 * Normalizes "@type/id", "type/id", or "@type/id{display}" to the bare
 * "type/id" form so downstream lookups and renames keep working.
 */
export function normalizeRef(ref: string): string {
  // Index-math equivalent of `.replace(/^@/, '').replace(/\{[^}]*\}$/, '')`.
  // Avoids the unbounded `[^}]*` that CodeQL flags as polynomial-redos when
  // the input comes from raw prose / frontmatter.
  let s = ref.charCodeAt(0) === 64 /* @ */ ? ref.slice(1) : ref;
  if (s.length > 0 && s.charCodeAt(s.length - 1) === 125 /* } */) {
    const open = s.lastIndexOf('{');
    if (open !== -1) s = s.slice(0, open);
  }
  return s;
}
