// Shared types for Loreweave's canon graph. No runtime logic here.

/**
 * Canonical Loreweave entry types.
 */
export type EntryType =
  | "character"
  | "location"
  | "concept"
  | "lore"
  | "waypoint"
  | "term"
  | "sigil";

export type EntryStatus = "draft" | "canon";

/** Frontmatter common to every entry. Type-specific fields live on subtypes. */
export interface BaseFrontmatter {
  id: string;
  type: EntryType;
  name?: string;
  aliases?: string[];
  tags?: string[];
  inherits?: string[];
  overrides?: Record<string, unknown>;
  properties?: Record<string, unknown>;
  appears_in?: string[];
  status?: EntryStatus;
  /** Characters: slang-groups the character speaks. */
  speaks?: string[];
  /** Locations: slang-groups spoken there. */
  spoken_here?: string[];
}

export interface TermFrontmatter extends BaseFrontmatter {
  type: "term";
  term: string;
  language?: string;
  slang_of?: string;
  pronunciation?: string;
  examples?: string[];
  definition?: string;
}

export interface SigilFrontmatter extends BaseFrontmatter {
  type: "sigil";
  kind?: string;
  description?: string;
}

export type EntryFrontmatter = BaseFrontmatter | TermFrontmatter | SigilFrontmatter;

/** A Codex / Lexicon / Sigil entry = a markdown file with frontmatter. */
export interface Entry<F extends BaseFrontmatter = EntryFrontmatter> {
  frontmatter: F;
  body: string;
  /** Absolute path. */
  path: string;
  /** Path relative to the Saga root (POSIX-style). */
  relPath: string;
}

/** A Thread's Waypoint — placement of a waypoint entry on a timeline. */
export interface Waypoint {
  id: string;
  /** Reference to a waypoint entry, as "@waypoint/<id>" or just "<id>". */
  event: string;
  /** Absolute date string, interpreted by the Thread's calendar. */
  at?: string;
  /** Relational constraints — Waypoint ids within this Thread. */
  before?: string[];
  after?: string[];
  concurrent?: string[];
  /** Tomes this Waypoint is narrated in (for lens filtering). */
  appears_in?: string[];
  label?: string;
}

export interface Thread {
  id: string;
  calendar?: string;
  branches_from?: { thread: string; at_waypoint: string };
  waypoints: Waypoint[];
  /** Absolute path. */
  path: string;
  relPath: string;
}

export type CalendarKind = "gregorian" | "numeric";

export interface CalendarSpec {
  id: string;
  kind: CalendarKind;
  epoch?: string;
  label?: string;
}

export interface TomeManifest {
  id: string;
  title?: string;
  subtitle?: string;
  author?: string;
  default_thread?: string;
  strict_slang?: boolean;
}

export interface Tome {
  manifest: TomeManifest;
  /** Absolute path of the tome folder. */
  path: string;
  relPath: string;
  chapters: Chapter[];
}

export interface ChapterMeta {
  title?: string;
  ordinal?: number;
  status?: EntryStatus;
  pov?: string[];
  voice?: string;
  tense?: string;
  summary?: string;
  linked_events?: string[];
}

export interface Chapter {
  meta: ChapterMeta;
  body: string;
  /** Absolute path of chapter.md. */
  path: string;
  relPath: string;
  tome: string;
  /** Directory slug like "01-arrival". */
  slug: string;
}

export interface SagaManifest {
  id: string;
  title?: string;
  author?: string;
  language?: string;
  default_calendar?: string;
  tome_order?: string[];
}

export interface Saga {
  manifest: SagaManifest;
  root: string;
  entries: Entry[];
  tomes: Tome[];
  threads: Thread[];
  calendars: CalendarSpec[];
  notes: Note[];
}

export type NoteKind = "idea" | "todo" | "remark" | "question" | "done";
export type NoteStatus = "open" | "resolved" | "archived";

export interface NoteFrontmatter {
  id: string;
  kind: NoteKind;
  target?: string;
  author?: string;
  created?: string;
  updated?: string;
  tags?: string[];
  status: NoteStatus;
}

export interface Note {
  frontmatter: NoteFrontmatter;
  body: string;
  path: string;
  relPath: string;
}

/** Key for the entry graph. */
export type EntryKey = `${EntryType}/${string}`;

export function entryKey(type: EntryType, id: string): EntryKey {
  return `${type}/${id}` as EntryKey;
}
