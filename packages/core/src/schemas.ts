// Zod schemas for frontmatter and yaml files. Used by loader + validator.
import { z } from 'zod';

/**
 * Canonical entry types (Loreweave vocabulary).
 */
export const EntryTypeSchema = z.enum([
  'character',
  'location',
  'concept',
  'lore',
  'waypoint',
  'term',
  'sigil',
]);

export const StatusSchema = z.enum(['draft', 'canon']);

const Id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'id must be kebab-case');

const BaseFrontmatter = z.object({
  id: Id,
  type: EntryTypeSchema,
  name: z.string().optional(),
  aliases: z.array(z.string()).optional(),
  tags: z.array(Id).optional(),
  inherits: z.array(Id).optional(),
  overrides: z.record(z.unknown()).optional(),
  properties: z.record(z.unknown()).optional(),
  appears_in: z.array(z.string()).optional(),
  status: StatusSchema.optional(),
  speaks: z.array(Id).optional(),
  spoken_here: z.array(Id).optional(),
});

export const TermFrontmatterSchema = BaseFrontmatter.extend({
  type: z.literal('term'),
  term: z.string().min(1),
  language: z.string().optional(),
  slang_of: Id.optional(),
  pronunciation: z.string().optional(),
  examples: z.array(z.string()).optional(),
  definition: z.string().optional(),
});

export const SigilFrontmatterSchema = BaseFrontmatter.extend({
  type: z.literal('sigil'),
  kind: z.string().optional(),
  description: z.string().optional(),
});

export const CharacterFrontmatterSchema = BaseFrontmatter.extend({
  type: z.literal('character'),
});
export const LocationFrontmatterSchema = BaseFrontmatter.extend({
  type: z.literal('location'),
});
export const ConceptFrontmatterSchema = BaseFrontmatter.extend({
  type: z.literal('concept'),
});
export const LoreFrontmatterSchema = BaseFrontmatter.extend({
  type: z.literal('lore'),
});
export const WaypointEntryFrontmatterSchema = BaseFrontmatter.extend({
  type: z.literal('waypoint'),
});

export const EntryFrontmatterSchema = z.discriminatedUnion('type', [
  CharacterFrontmatterSchema,
  LocationFrontmatterSchema,
  ConceptFrontmatterSchema,
  LoreFrontmatterSchema,
  WaypointEntryFrontmatterSchema,
  TermFrontmatterSchema,
  SigilFrontmatterSchema,
]);

export const WaypointSchema = z.object({
  id: Id,
  event: z.string().min(1),
  at: z.string().optional(),
  before: z.array(Id).optional(),
  after: z.array(Id).optional(),
  concurrent: z.array(Id).optional(),
  appears_in: z.array(z.string()).optional(),
  label: z.string().optional(),
});

export const ThreadFileSchema = z.object({
  id: Id,
  calendar: Id.optional(),
  branches_from: z
    .object({
      thread: Id,
      at_waypoint: Id,
    })
    .optional(),
  waypoints: z.array(WaypointSchema),
});

export const CalendarFileSchema = z.object({
  id: Id,
  kind: z.enum(['gregorian', 'numeric']),
  epoch: z.string().optional(),
  label: z.string().optional(),
});

export const TomeManifestSchema = z.object({
  id: Id,
  title: z.string().optional(),
  subtitle: z.string().optional(),
  author: z.string().optional(),
  default_thread: Id.optional(),
  strict_slang: z.boolean().optional(),
});

export const SagaManifestSchema = z.object({
  id: Id,
  title: z.string().optional(),
  author: z.string().optional(),
  language: z.string().optional(),
  default_calendar: Id.optional(),
  tome_order: z.array(Id).optional(),
});

export const ChapterMetaSchema = z.object({
  title: z.string().optional(),
  ordinal: z.number().int().nonnegative().optional(),
  status: StatusSchema.optional(),
  pov: z.array(z.string()).optional(),
  voice: z.string().optional(),
  tense: z.string().optional(),
  summary: z.string().optional(),
  linked_events: z.array(z.string()).optional(),
});

export const TraceKindSchema = z.enum([
  'idea',
  'todo',
  'remark',
  'question',
  'done',
]);

const DateLike = z.preprocess((v) => {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return v;
}, z.string());

/**
 * A Trace is a sticky-trace style annotation. `target` may be an `@type/id`
 * reference, `chapter:<tome>/<slug>`, `saga` (global), or omitted (floating).
 */
export const TraceFrontmatterSchema = z.object({
  id: Id,
  kind: TraceKindSchema.default('remark'),
  target: z.string().optional(),
  author: z.string().optional(),
  created: DateLike.optional(),
  updated: DateLike.optional(),
  tags: z.array(Id).optional(),
  status: z.enum(['open', 'resolved', 'archived']).default('open'),
});
