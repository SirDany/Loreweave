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
  /** The raw matched string, e.g. "@character/aaron", "[The King](@character/aaron)", or "@character/aaron{the king}". */
  raw: string;
  /**
   * Optional display-text override: the contents of the `{...}` suffix,
   * or the markdown link label `[...]`, if present.
   * Undefined means "use the resolved entity's name".
   * Empty strings are preserved so callers can detect explicit blanks.
   */
  display?: string;
  /** Optional section anchor (#heading-slug). */
  anchor?: string;
}

/**
 * Shorthand alias resolver for common type prefixes.
 */
export function canonicalType(rawType: string): string {
  switch (rawType.toLowerCase()) {
    case 'char':
      return 'character';
    case 'loc':
      return 'location';
    case 'wp':
      return 'waypoint';
    default:
      return rawType;
  }
}

/**
 * Format a reference into canonical display/link syntax.
 * Uses Markdown link style `[Display](@type/id)` when display text is provided,
 * or bare `@type/id` when omitted.
 */
export function formatReference(type: string, id: string, display?: string): string {
  const normType = canonicalType(type);
  if (display !== undefined && display !== null && display.length > 0) {
    return `[${display}](@${normType}/${id})`;
  }
  return `@${normType}/${id}`;
}

/**
 * Canonical Echo regex supporting both:
 * 1. Standard Markdown link format: [display text](@type/id) or [display text](@type/id#anchor) or [display](@char-id)
 * 2. Legacy / inline Echo format: @type/id, @type/id{display}, or @type/id#anchor{display}
 *
 * Exported so the web app and CLI keep their tooling in sync without
 * redefining the pattern. The pattern carries the `g` flag; callers
 * that need a fresh `lastIndex` should `new RegExp(REF_REGEX.source, 'g')`.
 */
export const REF_REGEX =
  /(?:\[([^\]\n]+)\]\(@([a-z][a-z0-9-]*)[/-]([a-z0-9][a-z0-9-]*)(?:#([a-z0-9-]*))?\))|@([a-z][a-z0-9-]*)\/([a-z0-9][a-z0-9-]*)(?:#([a-z0-9-]*))?(?:\{([^}\n]*)\})?/g;

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

    let type: string;
    let id: string;
    let display: string | undefined;
    let anchor: string | undefined;

    if (match[1] !== undefined) {
      // Branch 1: Markdown link style: [display](@type/id)
      display = match[1];
      type = canonicalType(match[2]!);
      id = match[3]!;
      anchor = match[4];
    } else {
      // Branch 2: Echo style: @type/id or @type/id{display}
      type = canonicalType(match[5]!);
      id = match[6]!;
      anchor = match[7];
      display = match[8];
    }

    out.push({
      type,
      id,
      display,
      anchor,
      offset,
      line,
      column,
      raw: match[0],
    });
  }
  return out;
}

/**
 * Normalizes "@type/id", "[Display](@type/id)", "type/id", "@type/id{display}", or
 * "@type/id#anchor" to the bare "type/id" form so downstream lookups and
 * renames keep working. Anchor and display-text suffixes are stripped.
 */
export function normalizeRef(ref: string): string {
  let s = ref.trim();
  if (s.startsWith('[') && s.includes('](') && s.endsWith(')')) {
    const openParen = s.indexOf('](') + 2;
    s = s.slice(openParen, -1).trim();
  }
  if (s.startsWith('@')) s = s.slice(1);
  if (s.endsWith('}')) {
    const open = s.lastIndexOf('{');
    if (open !== -1) s = s.slice(0, open);
  }
  const hash = s.indexOf('#');
  if (hash !== -1) s = s.slice(0, hash);

  const slash = s.indexOf('/');
  if (slash !== -1) {
    const type = canonicalType(s.slice(0, slash));
    const id = s.slice(slash + 1);
    return `${type}/${id}`;
  }
  const dash = s.indexOf('-');
  if (dash !== -1) {
    const prefix = s.slice(0, dash);
    if (['character', 'char', 'location', 'loc', 'waypoint', 'wp', 'term', 'sigil', 'concept', 'lore'].includes(prefix.toLowerCase())) {
      const type = canonicalType(prefix);
      const id = s.slice(dash + 1);
      return `${type}/${id}`;
    }
  }
  return s;
}

/**
 * A block transclusion: an Echo with a `#anchor` suffix that selects a
 * subsection of the target entry's body. The anchor is the slugified
 * heading text (lowercase, non-alphanumeric → `-`, collapsed). Empty
 * anchor (just `#`) means "from the top".
 */
export interface Transclusion extends Reference {
  /** The raw anchor (without the leading `#`). Empty string means "top". */
  anchor: string;
}

/**
 * Canonical transclusion regex. Match groups:
 *   1: type prefix
 *   2: id
 *   3: anchor (without the leading `#`; may be empty)
 *   4: optional display-text override
 *
 * Carries the `g` flag; rebuild with `new RegExp(TRANSCLUSION_REGEX.source, 'g')`
 * before calling `.exec()` repeatedly to avoid shared `lastIndex`.
 */
export const TRANSCLUSION_REGEX =
  /@([a-z][a-z0-9-]*)\/([a-z0-9][a-z0-9-]*)#([a-z0-9-]*)(?:\{([^}\n]*)\})?/g;

/**
 * Extract block transclusions (`@type/id#anchor[{display}]`) from text.
 * Returns them as a superset of {@link Reference} so existing tooling can
 * treat them as ordinary echoes when the anchor doesn't matter.
 */
export function extractTransclusions(text: string): Transclusion[] {
  const out: Transclusion[] = [];
  const re = new RegExp(TRANSCLUSION_REGEX.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const offset = match.index;
    const prefix = text.slice(0, offset);
    const line = prefix.split('\n').length;
    const lastNL = prefix.lastIndexOf('\n');
    const column = offset - (lastNL + 1) + 1;
    out.push({
      type: match[1]!,
      id: match[2]!,
      anchor: match[3] ?? '',
      display: match[4],
      offset,
      line,
      column,
      raw: match[0],
    });
  }
  return out;
}

/**
 * Slugify a markdown heading the same way transclusion anchors do.
 * Lowercase, replace non-alphanumeric with `-`, collapse runs, trim `-`.
 * Done with a single linear scan to avoid regex-backtracking surprises
 * on attacker-controlled input.
 */
export function slugifyHeading(heading: string): string {
  let out = '';
  let lastDash = true; // suppress leading dashes
  for (let i = 0; i < heading.length; i++) {
    const c = heading.charCodeAt(i);
    // a-z
    if (c >= 97 && c <= 122) {
      out += heading[i];
      lastDash = false;
      continue;
    }
    // A-Z → lower
    if (c >= 65 && c <= 90) {
      out += String.fromCharCode(c + 32);
      lastDash = false;
      continue;
    }
    // 0-9
    if (c >= 48 && c <= 57) {
      out += heading[i];
      lastDash = false;
      continue;
    }
    if (!lastDash) {
      out += '-';
      lastDash = true;
    }
  }
  // trim trailing dash
  if (out.length > 0 && out.charCodeAt(out.length - 1) === 45 /* - */) {
    out = out.slice(0, -1);
  }
  return out;
}

/**
 * Resolve a transclusion's anchor against a target entry's body, returning
 * the markdown slice from the matching heading up to (but not including)
 * the next heading of the same-or-higher level. An empty anchor returns
 * the whole body. Returns `null` if the anchor isn't found.
 */
export function resolveTransclusion(body: string, anchor: string): string | null {
  if (!anchor) return body;
  const lines = body.split('\n');
  let startIdx = -1;
  let level = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    // Headings: 1-6 leading `#` then a space.
    let h = 0;
    while (h < 6 && line.charCodeAt(h) === 35 /* # */) h++;
    if (h === 0 || line.charCodeAt(h) !== 32 /* space */) continue;
    const text = line.slice(h + 1).trim();
    if (slugifyHeading(text) === anchor) {
      startIdx = i;
      level = h;
      break;
    }
  }
  if (startIdx === -1) return null;
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i] ?? '';
    let h = 0;
    while (h < 6 && line.charCodeAt(h) === 35) h++;
    if (h > 0 && h <= level && line.charCodeAt(h) === 32) {
      endIdx = i;
      break;
    }
  }
  return lines.slice(startIdx, endIdx).join('\n').trim();
}
