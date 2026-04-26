// Kind catalog loader: discover `<saga-root>/kinds/*.md`, parse them,
// merge with built-ins, walk `extends` chains, and produce a resolved
// `Map<KindId, ResolvedKind>` for use by validator/loader/UI.
//
// Built-ins are seeded first; saga files with the same id override.
// `extends` resolution does a DFS with cycle detection — child fields
// win on shallow merges of `properties` and `display`.
import matter from 'gray-matter';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { BUILTIN_KIND_DEFS } from './builtin-kinds.js';
import {
  KindCycleError,
  KindFrontmatterSchema,
  type KindField,
  type KindFrontmatter,
  type ResolvedKind,
} from './kinds.js';

interface RawKind {
  fm: KindFrontmatter;
  source: string | null; // null for builtins
  builtin: boolean;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readKindFiles(root: string): Promise<RawKind[]> {
  const dir = path.join(root, 'kinds');
  if (!(await exists(dir))) return [];
  const out: RawKind[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith('.md')) continue;
    const file = path.join(dir, e.name);
    const raw = await fs.readFile(file, 'utf8');
    const parsed = matter(raw);
    const result = KindFrontmatterSchema.safeParse(parsed.data);
    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      throw new Error(`invalid kind frontmatter (${file}): ${issues}`);
    }
    const expectedId = path.basename(e.name, '.md');
    if (result.data.id !== expectedId) {
      throw new Error(
        `kind id "${result.data.id}" does not match filename stem "${expectedId}" (${file})`,
      );
    }
    out.push({ fm: result.data, source: file, builtin: false });
  }
  return out;
}

function buildBaseMap(): Map<string, RawKind> {
  const m = new Map<string, RawKind>();
  for (const fm of BUILTIN_KIND_DEFS) {
    m.set(fm.id, { fm, source: null, builtin: true });
  }
  return m;
}

/**
 * Resolve a single Kind: walk `extends` chain, shallow-merge properties
 * + display child-wins, return final ResolvedKind. Throws KindCycleError
 * on cycles or extends-of-unknown.
 */
function resolveKind(
  id: string,
  raws: Map<string, RawKind>,
  visiting: string[] = [],
): ResolvedKind {
  if (visiting.includes(id)) {
    throw new KindCycleError([...visiting, id]);
  }
  const raw = raws.get(id);
  if (!raw) {
    throw new Error(
      `kind "${id}" not found (referenced from "${visiting[visiting.length - 1] ?? '?'}")`,
    );
  }

  let properties: Record<string, KindField> = {};
  let display: ResolvedKind['display'] = {};

  if (raw.fm.extends) {
    const parent = resolveKind(raw.fm.extends, raws, [...visiting, id]);
    properties = { ...parent.properties };
    display = { ...parent.display };
  }

  for (const [k, v] of Object.entries(raw.fm.properties ?? {})) {
    properties[k] = v;
  }
  display = { ...display, ...(raw.fm.display ?? {}) };

  const echoPrefix = raw.fm.echoPrefix ?? raw.fm.id;
  const storage = raw.fm.storage ?? raw.fm.id;

  return {
    id: raw.fm.id,
    name: raw.fm.name,
    echoPrefix,
    aliases: raw.fm.aliases ?? [],
    storage,
    properties,
    display,
    description: raw.fm.description ?? '',
    builtin: raw.builtin,
    source: raw.source,
  };
}

export interface KindCatalog {
  /** Resolved kinds keyed by canonical id. */
  byId: Map<string, ResolvedKind>;
  /** Echo prefix (and aliases) → canonical kind id. */
  byEcho: Map<string, string>;
}

/**
 * Load and resolve the full Kind catalog for a Saga root. Built-ins
 * are always present; saga files override by id.
 */
export async function loadKindCatalog(root: string): Promise<KindCatalog> {
  const map = buildBaseMap();
  const sagaKinds = await readKindFiles(root);
  for (const k of sagaKinds) {
    map.set(k.fm.id, k); // saga file overrides builtin (or another saga def)
  }

  const byId = new Map<string, ResolvedKind>();
  const byEcho = new Map<string, string>();
  for (const id of map.keys()) {
    const resolved = resolveKind(id, map);
    byId.set(id, resolved);
    byEcho.set(resolved.echoPrefix, id);
    for (const alias of resolved.aliases) {
      byEcho.set(alias, id);
    }
  }
  return { byId, byEcho };
}

/**
 * Build a catalog without filesystem access — used by tests and by the
 * loader when it has the kinds list in hand from another source.
 */
export function buildKindCatalog(extra: KindFrontmatter[] = []): KindCatalog {
  const map = buildBaseMap();
  for (const fm of extra) {
    map.set(fm.id, { fm, source: null, builtin: false });
  }
  const byId = new Map<string, ResolvedKind>();
  const byEcho = new Map<string, string>();
  for (const id of map.keys()) {
    const resolved = resolveKind(id, map);
    byId.set(id, resolved);
    byEcho.set(resolved.echoPrefix, id);
    for (const alias of resolved.aliases) {
      byEcho.set(alias, id);
    }
  }
  return { byId, byEcho };
}
