// Tome lens: filter entries/waypoints based on their `appears_in` metadata.
import type { Entry, Waypoint } from "./types.js";

/** An entry passes the lens if its `appears_in` is absent OR includes the tome. */
export function entryInTome(entry: Entry, tomeId: string | null): boolean {
  if (!tomeId) return true;
  const ai = entry.frontmatter.appears_in;
  if (!ai || ai.length === 0) return true;
  return ai.includes(tomeId);
}

export function waypointInTome(
  wp: Waypoint,
  tomeId: string | null,
): boolean {
  if (!tomeId) return true;
  if (!wp.appears_in || wp.appears_in.length === 0) return true;
  return wp.appears_in.includes(tomeId);
}

export function filterEntriesForTome(
  entries: Entry[],
  tomeId: string | null,
): Entry[] {
  return entries.filter((e) => entryInTome(e, tomeId));
}

export function filterWaypointsForTome(
  waypoints: Waypoint[],
  tomeId: string | null,
): Waypoint[] {
  return waypoints.filter((w) => waypointInTome(w, tomeId));
}
