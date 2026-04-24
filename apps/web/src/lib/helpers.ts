/**
 * Pure helpers used across the desktop UI. Keeping them here makes them easy
 * to import without dragging React into a test environment.
 */

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 64);
}

const VALID_ID_RE = /^[a-z0-9][a-z0-9-]*$/;

export function isValidEntryId(id: string): boolean {
  return VALID_ID_RE.test(id);
}

const VALID_BRANCH_RE = /^[A-Za-z0-9._\-/]+$/;

export function isValidBranchName(name: string): boolean {
  return name.length > 0 && VALID_BRANCH_RE.test(name);
}

export interface TargetCandidate {
  value: string;
  label: string;
  detail?: string;
}

/**
 * Filter a target-suggestion list by a free-form query. Matches against value,
 * label and detail (case-insensitive substring). When the query is empty the
 * first `limit` suggestions are returned unchanged.
 */
export function filterTargets<T extends TargetCandidate>(
  suggestions: T[],
  query: string,
  limit = 8,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return suggestions.slice(0, limit);
  return suggestions
    .filter((s) => {
      const hay = `${s.value} ${s.label} ${s.detail ?? ""}`.toLowerCase();
      return hay.includes(q);
    })
    .slice(0, limit);
}

/**
 * Convert an inbound jump-target string (e.g. `@character/aaron` or
 * `chapter:book-one/01-arrival`) into either a chapter selection key
 * (`tome::slug`), an entry key (`type/id`), or null when unrouteable.
 */
export function parseJumpTarget(
  raw: string,
): { kind: "chapter" | "entry"; key: string } | null {
  if (raw.startsWith("chapter:")) {
    return { kind: "chapter", key: raw.slice("chapter:".length).replace("/", "::") };
  }
  if (raw === "saga" || raw.startsWith("tome:")) return null;
  const cleaned = raw.replace(/^@/, "");
  if (!cleaned.includes("/")) return null;
  return { kind: "entry", key: cleaned };
}
