import type { DumpEntry } from '../../lib/lw.js';
import type { EchoOption } from './EchoPicker.js';

/**
 * Pure helper extracted from `EchoPicker` for unit testing. Given the
 * candidate pool, the current selection, and a query, returns the
 * filtered options the picker would show.
 */
export function filterEchoes(
  pool: EchoOption[],
  selected: ReadonlySet<string>,
  query: string,
  limit = 30,
): EchoOption[] {
  const q = query.trim().toLowerCase();
  const candidates = pool.filter((o) => !selected.has(`${o.type}/${o.id}`));
  if (!q) return candidates.slice(0, limit);
  return candidates
    .filter((o) => {
      if (o.id.toLowerCase().includes(q)) return true;
      if (o.name.toLowerCase().includes(q)) return true;
      return (o.aliases ?? []).some((a) => a.toLowerCase().includes(q));
    })
    .slice(0, limit);
}

/** Build an EchoOption pool from a DumpEntry list with optional Kind filter. */
export function entriesToOptions(
  entries: DumpEntry[],
  kinds?: string[],
): EchoOption[] {
  return entries
    .filter((e) => !kinds || kinds.includes(e.type))
    .map((e) => ({
      type: e.type,
      id: e.id,
      name: e.name || e.id,
      aliases: e.aliases ?? [],
    }));
}
