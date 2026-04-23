// Resolver: merge an entry's own properties with its inherited Sigil properties and overrides.
import type { Entry, EntryKey } from "./types.js";
import { entryKey } from "./types.js";

export type Provenance = "override" | "own" | `sigil:${string}`;

export interface ResolvedEntry {
  id: string;
  type: string;
  name?: string;
  properties: Record<string, unknown>;
  provenance: Record<string, Provenance>;
  /** inherits chain actually walked (BFS order, excluding self). */
  inheritsChain: string[];
}

export class CycleError extends Error {
  constructor(public readonly chain: string[]) {
    super(`inheritance cycle: ${chain.join(" -> ")}`);
  }
}

function lookup(entries: Map<EntryKey, Entry>, id: string): Entry | undefined {
  return entries.get(entryKey("sigil", id));
}

export function buildEntryIndex(entries: Entry[]): Map<EntryKey, Entry> {
  const idx = new Map<EntryKey, Entry>();
  for (const e of entries) {
    idx.set(entryKey(e.frontmatter.type, e.frontmatter.id), e);
  }
  return idx;
}

/**
 * Depth-first cycle check across the inheritance graph rooted at `entry`.
 * Throws `CycleError` on the first back-edge, otherwise returns silently.
 */
function assertAcyclic(entry: Entry, entries: Map<EntryKey, Entry>): void {
  const onStack = new Set<string>();
  const done = new Set<string>();
  const path: string[] = [];

  const visit = (id: string): void => {
    if (onStack.has(id)) {
      throw new CycleError([...path, id]);
    }
    if (done.has(id)) return;
    onStack.add(id);
    path.push(id);
    const node = entries.get(entryKey("sigil", id));
    for (const parent of node?.frontmatter.inherits ?? []) visit(parent);
    path.pop();
    onStack.delete(id);
    done.add(id);
  };

  onStack.add(entry.frontmatter.id);
  path.push(entry.frontmatter.id);
  for (const tagId of entry.frontmatter.inherits ?? []) visit(tagId);
  path.pop();
  onStack.delete(entry.frontmatter.id);
}

export function resolve(
  entry: Entry,
  entries: Map<EntryKey, Entry>,
): ResolvedEntry {
  assertAcyclic(entry, entries);

  const merged: Record<string, unknown> = {};
  const prov: Record<string, Provenance> = {};

  // 1. own properties
  const own = entry.frontmatter.properties ?? {};
  for (const [k, v] of Object.entries(own)) {
    merged[k] = v;
    prov[k] = "own";
  }

  // 2. BFS through `inherits` — nearer parents win for missing keys.
  const visited = new Set<string>([entry.frontmatter.id]);
  const chain: string[] = [];
  const queue: string[] = [...(entry.frontmatter.inherits ?? [])];
  while (queue.length) {
    const sigilId = queue.shift()!;
    if (visited.has(sigilId)) continue;
    visited.add(sigilId);
    chain.push(sigilId);
    const sigil = lookup(entries, sigilId);
    if (!sigil) continue; // validator handles missing refs
    const sigilProps = sigil.frontmatter.properties ?? {};
    for (const [k, v] of Object.entries(sigilProps)) {
      if (!(k in merged)) {
        merged[k] = v;
        prov[k] = `sigil:${sigilId}`;
      }
    }
    for (const p of sigil.frontmatter.inherits ?? []) queue.push(p);
  }

  // 3. overrides — always win
  const overrides = entry.frontmatter.overrides ?? {};
  for (const [k, v] of Object.entries(overrides)) {
    merged[k] = v;
    prov[k] = "override";
  }

  return {
    id: entry.frontmatter.id,
    type: entry.frontmatter.type,
    name: entry.frontmatter.name,
    properties: merged,
    provenance: prov,
    inheritsChain: chain,
  };
}
