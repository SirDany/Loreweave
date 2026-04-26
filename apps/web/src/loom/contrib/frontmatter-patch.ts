/**
 * Pure helpers shared by `KanbanLens` and other contrib renderers
 * that mutate entries in place. Kept React-free for testability.
 */
import YAML from 'yaml';
import type { DumpEntry } from '../../lib/lw.js';

/**
 * Apply a shallow patch to the frontmatter, then re-serialize the
 * full file (frontmatter + body). The patch is applied at the top
 * level of `frontmatter`; pass `{ status: 'doing' }` to set
 * `status: doing`, or `{ properties: { ...new } }` to replace the
 * whole properties block.
 *
 * Empty/null values delete the key. `id` and `type` are protected.
 */
export function applyFrontmatterPatch(
  entry: Pick<DumpEntry, 'frontmatter' | 'body'>,
  patch: Record<string, unknown>,
): string {
  const next: Record<string, unknown> = { ...(entry.frontmatter ?? {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'id' || k === 'type') continue;
    if (v == null || v === '') delete next[k];
    else next[k] = v;
  }
  const fm = YAML.stringify(next).trimEnd();
  const body = entry.body.startsWith('\n') ? entry.body : '\n' + entry.body;
  return `---\n${fm}\n---${body}`;
}

/**
 * Compute the patch needed to move an entry from one column to
 * another in a kanban view grouped by `groupBy`. For typed fields
 * (`status`) the value goes at the top level; otherwise it goes
 * under `properties.<groupBy>` so it round-trips through the
 * Kind property schema.
 */
export function patchForKanbanMove(
  entry: Pick<DumpEntry, 'frontmatter'>,
  groupBy: string,
  newColumn: string,
): Record<string, unknown> {
  const value = newColumn === '(unset)' ? null : newColumn;
  if (groupBy === 'status' || groupBy === 'name' || groupBy === 'type') {
    return { [groupBy]: value };
  }
  // If frontmatter already has the key at the top level, keep it there.
  if (entry.frontmatter && groupBy in entry.frontmatter) {
    return { [groupBy]: value };
  }
  // Otherwise nest under `properties` (the canonical home for
  // Kind-defined fields).
  const props =
    entry.frontmatter && typeof entry.frontmatter.properties === 'object' &&
    entry.frontmatter.properties !== null &&
    !Array.isArray(entry.frontmatter.properties)
      ? { ...(entry.frontmatter.properties as Record<string, unknown>) }
      : {};
  if (value == null) delete props[groupBy];
  else props[groupBy] = value;
  return { properties: props };
}
