// Kind — a definition of an entry type. Built-in Kinds (character,
// location, concept, lore, waypoint, term, sigil) ship baked in;
// Sagas can add their own at `<root>/kinds/<id>.md` and override
// built-ins by id.
//
// In Phase 1 a Kind is mostly metadata (name, prefix, display, storage
// folder). In Phase 2 the `properties` schema synthesizes Zod
// validators for entry frontmatter; in Phase 3 Lenses dispatch on
// Kind ids.
import { z } from 'zod';

const Id = z.string().regex(/^[a-z][a-z0-9-]*$/, 'must be kebab-case');

/**
 * Field types accepted in a Kind's `properties` schema. Phase 1
 * accepts the full set in YAML so writers can author forward-looking
 * Kind defs, but only validates field shapes — runtime property
 * validation arrives in Phase 2.
 */
export const KindFieldTypeSchema = z.enum([
  'string',
  'text',
  'number',
  'boolean',
  'date',
  'enum',
  'ref',
  'list',
]);

export const KindFieldSchema: z.ZodType<KindField> = z.lazy(() =>
  z.object({
    type: KindFieldTypeSchema,
    required: z.boolean().optional(),
    default: z.unknown().optional(),
    description: z.string().optional(),
    /** For `enum`: allowed values. */
    options: z.array(z.string()).optional(),
    /** For `ref` / `list of ref`: the kind id this references. */
    kind: Id.optional(),
    /** For `list`: the inner field shape. */
    of: z.lazy(() => KindFieldSchema).optional(),
  }),
);

export interface KindField {
  type: z.infer<typeof KindFieldTypeSchema>;
  required?: boolean;
  default?: unknown;
  description?: string;
  options?: string[];
  kind?: string;
  of?: KindField;
}

export const KindDisplaySchema = z.object({
  /** lucide-react icon name. The web app resolves it to a component. */
  icon: z.string().optional(),
  /** Tailwind colour token ("amber", "emerald"…). */
  color: z.string().optional(),
  /** Property names shown in list views. `name` is always implied first. */
  listFields: z.array(z.string()).optional(),
  /** Default sort key for list views. */
  sortBy: z.string().optional(),
});

export const KindFrontmatterSchema = z.object({
  id: Id,
  type: z.literal('kind'),
  name: z.string().min(1),
  /** Optional inheritance — the parent Kind's properties + display merge in. */
  extends: Id.optional(),
  /** Echo prefix used in `@<prefix>/<id>` echoes. Defaults to `id`. */
  echoPrefix: z
    .string()
    .regex(/^[a-z][a-z0-9-]*$/, 'echoPrefix must be kebab-case')
    .optional(),
  /** Alternate echo prefixes also accepted (e.g. `npc` for `character`). */
  aliases: z.array(z.string().regex(/^[a-z][a-z0-9-]*$/)).optional(),
  /**
   * Folder under the Saga root where entries of this Kind live. Defaults
   * to `<id>/`. Built-in Kinds map to `codex/`, `lexicon/`, `sigils/`.
   */
  storage: z.string().optional(),
  properties: z.record(KindFieldSchema).optional(),
  display: KindDisplaySchema.optional(),
  description: z.string().optional(),
});

export type KindFrontmatter = z.infer<typeof KindFrontmatterSchema>;

/**
 * A fully resolved Kind — own fields + ancestors merged, ready for
 * use by validator/loader/UI. Resolution order: walk `extends` chain,
 * shallow-merge `properties` and `display`, child wins.
 */
export interface ResolvedKind {
  id: string;
  name: string;
  echoPrefix: string;
  aliases: string[];
  storage: string;
  properties: Record<string, KindField>;
  display: z.infer<typeof KindDisplaySchema>;
  description: string;
  /** True if this Kind is shipped with Loreweave (overridable). */
  builtin: boolean;
  /** Where the file came from. `null` for unmodified built-ins. */
  source: string | null;
}

export class KindCycleError extends Error {
  constructor(public readonly chain: string[]) {
    super(`kind extends cycle: ${chain.join(' -> ')}`);
  }
}
