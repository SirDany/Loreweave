// Thread engine: linearize waypoints combining relational edges + absolute dates.
import { BUILTIN_GREGORIAN, compare, parseDate } from "./calendar.js";
import { filterWaypointsForTome } from "./lens.js";
import type { CalendarSpec, Thread, Waypoint } from "./types.js";

export interface TimelineIssue {
  kind:
    | "cycle"
    | "missing-waypoint"
    | "date-before-contradiction"
    | "date-after-contradiction"
    | "date-concurrent-contradiction"
    | "unknown-thread";
  message: string;
  thread: string;
  waypoint?: string;
}

export interface LinearizeOptions {
  includeBranches?: boolean;
  /** Filter waypoints by tome lens. */
  tome?: string | null;
}

export interface LinearizedWaypoint extends Waypoint {
  thread: string;
  /** Order index after topo sort. */
  order: number;
}

export interface LinearizeResult {
  waypoints: LinearizedWaypoint[];
  issues: TimelineIssue[];
}

function waypointById(wp: Waypoint[], id: string): Waypoint | undefined {
  return wp.find((w) => w.id === id);
}

function calendarFor(
  thread: Thread,
  calendars: CalendarSpec[],
): CalendarSpec | null {
  if (!thread.calendar) return null;
  if (thread.calendar === "gregorian") return BUILTIN_GREGORIAN;
  return calendars.find((c) => c.id === thread.calendar) ?? null;
}

function topoSort(
  waypoints: Waypoint[],
  issues: TimelineIssue[],
  threadId: string,
): Waypoint[] {
  // Build adjacency: edge a -> b means "a comes before b".
  const nodes = new Map<string, Waypoint>();
  for (const w of waypoints) nodes.set(w.id, w);
  const outEdges = new Map<string, Set<string>>();
  const inDegree = new Map<string, number>();
  for (const w of waypoints) {
    outEdges.set(w.id, new Set());
    inDegree.set(w.id, 0);
  }
  const addEdge = (from: string, to: string) => {
    if (!nodes.has(from) || !nodes.has(to)) {
      issues.push({
        kind: "missing-waypoint",
        message: `edge references unknown waypoint "${!nodes.has(from) ? from : to}"`,
        thread: threadId,
      });
      return;
    }
    if (!outEdges.get(from)!.has(to)) {
      outEdges.get(from)!.add(to);
      inDegree.set(to, (inDegree.get(to) ?? 0) + 1);
    }
  };
  for (const w of waypoints) {
    for (const b of w.before ?? []) addEdge(w.id, b);
    for (const a of w.after ?? []) addEdge(a, w.id);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) if (deg === 0) queue.push(id);
  // stable tie-break: by date if available, else by id
  const sortByAnchor = (a: string, b: string): number => {
    const wa = nodes.get(a)!;
    const wb = nodes.get(b)!;
    if (wa.at && wb.at) return wa.at < wb.at ? -1 : wa.at > wb.at ? 1 : 0;
    if (wa.at) return -1;
    if (wb.at) return 1;
    return a.localeCompare(b);
  };
  queue.sort(sortByAnchor);

  const sorted: Waypoint[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    sorted.push(nodes.get(id)!);
    const outs = [...outEdges.get(id)!];
    for (const next of outs) {
      const d = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, d);
      if (d === 0) queue.push(next);
    }
    queue.sort(sortByAnchor);
  }

  if (sorted.length !== waypoints.length) {
    const remaining = waypoints.filter((w) => !sorted.includes(w)).map((w) => w.id);
    issues.push({
      kind: "cycle",
      message: `cycle among waypoints: ${remaining.join(", ")}`,
      thread: threadId,
    });
    // append remaining to keep output stable
    for (const w of waypoints) if (!sorted.includes(w)) sorted.push(w);
  }

  return sorted;
}

function checkDateContradictions(
  thread: Thread,
  waypoints: Waypoint[],
  calendars: CalendarSpec[],
  issues: TimelineIssue[],
) {
  const spec = calendarFor(thread, calendars);
  if (!spec) return;
  const byId = new Map<string, Waypoint>();
  for (const w of waypoints) byId.set(w.id, w);
  const parse = (w: Waypoint) => (w.at ? parseDate(w.at, spec) : null);
  for (const w of waypoints) {
    const wDate = parse(w);
    if (!wDate) continue;
    for (const bId of w.before ?? []) {
      const b = byId.get(bId);
      if (!b) continue;
      const bDate = parse(b);
      if (bDate && compare(wDate, bDate) === 1) {
        issues.push({
          kind: "date-before-contradiction",
          thread: thread.id,
          waypoint: w.id,
          message: `waypoint "${w.id}" (at ${w.at}) declared before "${b.id}" (at ${b.at}), but its date is later`,
        });
      }
    }
    for (const aId of w.after ?? []) {
      const a = byId.get(aId);
      if (!a) continue;
      const aDate = parse(a);
      if (aDate && compare(wDate, aDate) === -1) {
        issues.push({
          kind: "date-after-contradiction",
          thread: thread.id,
          waypoint: w.id,
          message: `waypoint "${w.id}" (at ${w.at}) declared after "${a.id}" (at ${a.at}), but its date is earlier`,
        });
      }
    }
    for (const cId of w.concurrent ?? []) {
      const c = byId.get(cId);
      if (!c) continue;
      const cDate = parse(c);
      if (cDate && compare(wDate, cDate) !== 0) {
        issues.push({
          kind: "date-concurrent-contradiction",
          thread: thread.id,
          waypoint: w.id,
          message: `waypoint "${w.id}" (at ${w.at}) declared concurrent with "${c.id}" (at ${c.at}), but dates differ`,
        });
      }
    }
  }
}

/**
 * Collect waypoints from a thread, optionally walking parent threads
 * (via branches_from) and merging up to the branch point.
 */
function collectWaypoints(
  thread: Thread,
  threads: Thread[],
  includeBranches: boolean,
  issues: TimelineIssue[],
  seen: Set<string> = new Set(),
): Waypoint[] {
  if (seen.has(thread.id)) return [];
  seen.add(thread.id);
  const own = thread.waypoints.slice();
  if (!includeBranches || !thread.branches_from) return own;
  const parent = threads.find((t) => t.id === thread.branches_from!.thread);
  if (!parent) {
    issues.push({
      kind: "unknown-thread",
      thread: thread.id,
      message: `branches_from references unknown thread "${thread.branches_from.thread}"`,
    });
    return own;
  }
  const parentWps = collectWaypoints(parent, threads, includeBranches, issues, seen);
  const branchIdx = parentWps.findIndex(
    (w) => w.id === thread.branches_from!.at_waypoint,
  );
  if (branchIdx < 0) {
    issues.push({
      kind: "missing-waypoint",
      thread: thread.id,
      message: `branches_from.at_waypoint "${thread.branches_from.at_waypoint}" not found on thread "${parent.id}"`,
    });
    return own;
  }
  // include parent waypoints up to & including the branch point, then own
  return [...parentWps.slice(0, branchIdx + 1), ...own];
}

export function linearize(
  threadId: string,
  threads: Thread[],
  calendars: CalendarSpec[],
  opts: LinearizeOptions = {},
): LinearizeResult {
  const issues: TimelineIssue[] = [];
  const thread = threads.find((t) => t.id === threadId);
  if (!thread) {
    issues.push({
      kind: "unknown-thread",
      thread: threadId,
      message: `thread "${threadId}" not found`,
    });
    return { waypoints: [], issues };
  }
  const collected = collectWaypoints(
    thread,
    threads,
    opts.includeBranches ?? false,
    issues,
  );
  const lensed = filterWaypointsForTome(collected, opts.tome ?? null);
  checkDateContradictions(thread, lensed, calendars, issues);
  const sorted = topoSort(lensed, issues, thread.id);
  return {
    waypoints: sorted.map((w, i) => ({ ...w, thread: thread.id, order: i })),
    issues,
  };
}
