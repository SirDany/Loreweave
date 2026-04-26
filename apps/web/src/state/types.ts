/**
 * Shared App-level types. Kept tiny and React-free so saga-helpers can
 * import without circular deps.
 */

/**
 * Active Lens id. Phase 0 fixed it to 8 built-in section ids; Phase 3
 * widens it to any registered Lens id (built-in or saga-defined) while
 * the built-ins below stay as the canonical defaults.
 */
export type Section = string;

export const BUILTIN_SECTIONS = [
  'story',
  'codex',
  'lexicon',
  'sigils',
  'threads',
  'traces',
  'constellation',
  'versions',
] as const;

export type BuiltinSection = (typeof BUILTIN_SECTIONS)[number];

export interface Selection {
  kind: 'entry' | 'chapter';
  key: string;
}
