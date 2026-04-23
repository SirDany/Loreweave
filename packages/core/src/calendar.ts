// Minimal calendar engine.
// Supports two kinds:
//   - "gregorian": ISO-8601 date strings (YYYY-MM-DD). Compared lexicographically.
//     Also accepts negative/4+ digit years prefixed with "-".
//   - "numeric": any integer (positive or negative). Compared numerically.
// Custom named calendars are a future extension.
import type { CalendarSpec } from "./types.js";

export interface ParsedDate {
  calendar: string;
  /** A normalized form suitable for comparison via `compare`. */
  key: string;
  kind: "gregorian" | "numeric";
}

export class CalendarError extends Error {}

const ISO_RE = /^-?\d{4,}-\d{2}-\d{2}$/;
const NUMERIC_RE = /^-?\d+$/;

export function parseDate(input: string, spec: CalendarSpec): ParsedDate {
  if (spec.kind === "gregorian") {
    if (!ISO_RE.test(input)) {
      throw new CalendarError(
        `invalid gregorian date "${input}" (expected YYYY-MM-DD)`,
      );
    }
    return { calendar: spec.id, key: input, kind: "gregorian" };
  }
  if (spec.kind === "numeric") {
    if (!NUMERIC_RE.test(input)) {
      throw new CalendarError(
        `invalid numeric date "${input}" (expected integer)`,
      );
    }
    // pad for lex-comparable but we use numeric compare via parseInt.
    return { calendar: spec.id, key: input, kind: "numeric" };
  }
  throw new CalendarError(`unknown calendar kind "${spec.kind}"`);
}

/** Returns -1, 0, 1. Both dates must share a calendar. */
export function compare(a: ParsedDate, b: ParsedDate): -1 | 0 | 1 {
  if (a.calendar !== b.calendar) {
    throw new CalendarError(
      `cannot compare dates from different calendars (${a.calendar} vs ${b.calendar})`,
    );
  }
  if (a.kind === "numeric") {
    const x = parseInt(a.key, 10);
    const y = parseInt(b.key, 10);
    return x < y ? -1 : x > y ? 1 : 0;
  }
  // gregorian ISO strings sort lexicographically for same-length years
  if (a.key < b.key) return -1;
  if (a.key > b.key) return 1;
  return 0;
}

export const BUILTIN_GREGORIAN: CalendarSpec = {
  id: "gregorian",
  kind: "gregorian",
  label: "Gregorian (real-world)",
};
