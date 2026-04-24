import { useEffect, useMemo, useState } from "react";
import YAML from "yaml";
import type { DumpPayload, Thread, Waypoint } from "../lib/lw.js";
import { lwWrite, threadOf } from "../lib/lw.js";

interface Props {
  data: DumpPayload;
  sagaPath: string;
  tomeLens: string | null;
  onReloaded?: () => void;
}

interface LinearWaypoint extends Waypoint {
  thread: string;
  order: number;
}

interface Linearized {
  waypoints: LinearWaypoint[];
  issues: Array<{ kind: string; message: string }>;
}

export function ThreadView({ data, sagaPath, tomeLens, onReloaded }: Props) {
  const [selected, setSelected] = useState<string | null>(
    data.threads[0]?.id ?? null,
  );
  const [withBranches, setWithBranches] = useState(true);
  const [linear, setLinear] = useState<Linearized | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reorderMode, setReorderMode] = useState(false);
  const [showBranchDiff, setShowBranchDiff] = useState(false);

  useEffect(() => {
    if (!selected) {
      setLinear(null);
      return;
    }
    setLoading(true);
    setError(null);
    threadOf(sagaPath, selected, {
      withBranches,
      tome: tomeLens ?? undefined,
    })
      .then((r) => setLinear(r as Linearized))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [sagaPath, selected, withBranches, tomeLens]);

  const thread = data.threads.find((t) => t.id === selected) ?? null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <header className="px-6 py-3 border-b border-border flex items-center gap-4 flex-wrap">
        <div className="text-lg">Threads</div>
        <div className="flex gap-1 flex-wrap">
          {data.threads.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelected(t.id)}
              className={
                "text-xs px-2 py-1 rounded border " +
                (selected === t.id
                  ? "border-primary bg-primary/25 text-primary-foreground"
                  : "border-border hover:bg-muted")
              }
            >
              {t.id}
              {t.branches_from && (
                <span className="text-muted-foreground"> ⇢{t.branches_from.thread}</span>
              )}
            </button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={withBranches}
            onChange={(e) => setWithBranches(e.target.checked)}
          />
          include parent waypoints
        </label>
        {thread && (
          <button
            onClick={() => setReorderMode((v) => !v)}
            className={
              "text-xs px-2 py-1 rounded border " +
              (reorderMode
                ? "border-primary bg-primary/25 text-primary-foreground"
                : "border-border hover:bg-muted")
            }
            title="Reorder waypoints and save the thread"
          >
            {reorderMode ? "✓ done" : "reorder"}
          </button>
        )}
        {thread?.branches_from && (
          <button
            onClick={() => setShowBranchDiff((v) => !v)}
            className={
              "text-xs px-2 py-1 rounded border " +
              (showBranchDiff
                ? "border-primary bg-primary/25 text-primary-foreground"
                : "border-border hover:bg-muted")
            }
            title={`Compare with parent thread ${thread.branches_from.thread}`}
          >
            branch diff
          </button>
        )}
      </header>
      <div className="flex-1 overflow-auto p-6">
        {reorderMode && thread && (
          <ThreadReorder
            thread={thread}
            sagaPath={sagaPath}
            onSaved={() => {
              setReorderMode(false);
              onReloaded?.();
            }}
          />
        )}
        {showBranchDiff && thread?.branches_from && (
          <BranchDiff thread={thread} data={data} />
        )}
        {loading && <div className="text-muted-foreground">linearizing…</div>}
        {error && (
          <pre className="text-rose-400 text-xs whitespace-pre-wrap">{error}</pre>
        )}
        {linear && thread && (
          <ThreadTimeline thread={thread} linear={linear} />
        )}
      </div>
    </div>
  );
}

function ThreadTimeline({
  thread,
  linear,
}: {
  thread: Thread;
  linear: Linearized;
}) {
  // Separate by lane (own vs inherited from parent)
  const ownIds = useMemo(
    () => new Set(thread.waypoints.map((w) => w.id)),
    [thread],
  );

  // Build a horizontal axis. If any waypoint has a date, use date-based layout.
  const dated = linear.waypoints.filter((w) => w.at);
  const hasDates = dated.length > 0;

  return (
    <div className="space-y-6">
      {thread.branches_from && (
        <div className="text-xs text-muted-foreground">
          branches from{" "}
          <code className="text-primary">{thread.branches_from.thread}</code>{" "}
          at{" "}
          <code className="text-cyan-300">
            {thread.branches_from.at_waypoint}
          </code>
        </div>
      )}
      {linear.issues.length > 0 && (
        <div className="rounded border border-rose-900 bg-rose-950/30 p-3">
          <div className="text-xs uppercase tracking-widest text-rose-400 mb-1">
            issues
          </div>
          <ul className="text-sm text-rose-300 space-y-0.5">
            {linear.issues.map((i, idx) => (
              <li key={idx}>
                <span className="font-mono text-xs">[{i.kind}]</span>{" "}
                {i.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {hasDates ? (
        <DatedAxis linear={linear} ownIds={ownIds} />
      ) : (
        <RelationalFlow linear={linear} ownIds={ownIds} />
      )}
    </div>
  );
}

function DatedAxis({
  linear,
  ownIds,
}: {
  linear: Linearized;
  ownIds: Set<string>;
}) {
  const { min, max } = useMemo(() => {
    const ds = linear.waypoints
      .filter((w) => w.at)
      .map((w) => w.at!)
      .sort();
    return { min: ds[0], max: ds[ds.length - 1] };
  }, [linear]);

  const position = (w: LinearWaypoint): number => {
    if (!w.at || !min || !max) return w.order * 0.1;
    if (min === max) return 0.5;
    // lexicographic is fine for ISO dates; for numeric-only we fall back to order.
    if (/^\d{4}-\d{2}-\d{2}$/.test(w.at)) {
      const a = Date.parse(min);
      const b = Date.parse(max);
      const v = Date.parse(w.at);
      if (!isNaN(a) && !isNaN(b) && !isNaN(v) && b > a) return (v - a) / (b - a);
    }
    return w.order / Math.max(1, linear.waypoints.length - 1);
  };

  return (
    <div>
      <div className="text-xs text-muted-foreground mb-2">
        {min} → {max}
      </div>
      <div className="relative h-32 border-t border-b border-border">
        <div className="absolute left-0 right-0 top-1/2 h-px bg-muted" />
        {linear.waypoints.map((w) => {
          const left = `${(position(w) * 100).toFixed(2)}%`;
          const own = ownIds.has(w.id);
          return (
            <div
              key={w.id}
              className="absolute -translate-x-1/2"
              style={{ left, top: own ? "30%" : "60%" }}
              title={`${w.id} → ${w.event}`}
            >
              <div
                className={
                  "w-3 h-3 rounded-full border " +
                  (own
                    ? "bg-primary border-primary/70"
                    : "bg-muted-foreground border-muted-foreground/50")
                }
              />
              <div className="mt-1 text-[10px] font-mono whitespace-nowrap text-foreground/90">
                {w.id}
              </div>
              {w.at && (
                <div className="text-[10px] text-primary/80 font-mono">
                  {w.at}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <Legend />
      <WaypointTable linear={linear} ownIds={ownIds} />
    </div>
  );
}

function RelationalFlow({
  linear,
  ownIds,
}: {
  linear: Linearized;
  ownIds: Set<string>;
}) {
  return (
    <div>
      <div className="flex items-center flex-wrap gap-2">
        {linear.waypoints.map((w, i) => {
          const own = ownIds.has(w.id);
          return (
            <div key={w.id} className="flex items-center gap-2">
              <div
                className={
                  "px-2 py-1 rounded border text-xs font-mono " +
                  (own
                    ? "border-primary bg-primary/20 text-primary-foreground"
                    : "border-border bg-muted/50 text-foreground/90")
                }
              >
                {w.id}
                {w.at && (
                  <span className="ml-1 text-primary/80">@ {w.at}</span>
                )}
              </div>
              {i < linear.waypoints.length - 1 && (
                <span className="text-muted-foreground/70">→</span>
              )}
            </div>
          );
        })}
      </div>
      <Legend />
      <WaypointTable linear={linear} ownIds={ownIds} />
    </div>
  );
}

function Legend() {
  return (
    <div className="mt-3 flex items-center gap-4 text-[11px] text-muted-foreground">
      <div className="flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-full bg-primary inline-block" />
        own
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground inline-block" />
        inherited
      </div>
    </div>
  );
}

function WaypointTable({
  linear,
  ownIds,
}: {
  linear: Linearized;
  ownIds: Set<string>;
}) {
  return (
    <table className="mt-6 w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-muted-foreground uppercase tracking-widest">
          <th className="py-1 w-8">#</th>
          <th className="py-1">waypoint</th>
          <th className="py-1">date</th>
          <th className="py-1">event</th>
          <th className="py-1">tomes</th>
        </tr>
      </thead>
      <tbody>
        {linear.waypoints.map((w) => (
          <tr key={w.id} className="border-t border-border">
            <td className="py-1 text-muted-foreground">{w.order + 1}</td>
            <td className="py-1 font-mono">
              <span className={ownIds.has(w.id) ? "text-primary" : "text-muted-foreground"}>
                {w.id}
              </span>
            </td>
            <td className="py-1 font-mono text-primary/80">
              {w.at ?? <span className="text-muted-foreground/70">—</span>}
            </td>
            <td className="py-1 font-mono text-muted-foreground">{w.event}</td>
            <td className="py-1 text-[11px] text-muted-foreground">
              {w.appears_in?.join(", ") ?? ""}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---------- reorder + branch diff ----------

function ThreadReorder({
  thread,
  sagaPath,
  onSaved,
}: {
  thread: Thread;
  sagaPath: string;
  onSaved: () => void;
}) {
  const [order, setOrder] = useState<Waypoint[]>(thread.waypoints);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const move = (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= order.length) return;
    const next = order.slice();
    [next[i], next[j]] = [next[j]!, next[i]!];
    setOrder(next);
  };

  const dirty = order.some((w, i) => w.id !== thread.waypoints[i]?.id);

  const save = async () => {
    setSaving(true);
    setStatus(null);
    try {
      // Re-emit the thread YAML with the new waypoint order. Non-waypoint
      // fields (id, calendar, branches_from) are preserved verbatim.
      const doc: Record<string, unknown> = { id: thread.id };
      if (thread.calendar) doc.calendar = thread.calendar;
      if (thread.branches_from) doc.branches_from = thread.branches_from;
      doc.waypoints = order.map((w) => stripUndefined(w));
      const yaml = YAML.stringify(doc, { lineWidth: 0 });
      await lwWrite(sagaPath, `threads/${thread.id}.yaml`, yaml);
      setStatus("saved");
      onSaved();
    } catch (e) {
      setStatus("error: " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-6 rounded border border-primary/30 bg-primary/5 p-4">
      <div className="mb-2 flex items-center gap-3">
        <div className="text-sm">Reorder waypoints</div>
        <div className="flex-1 text-xs text-muted-foreground">
          Arrow buttons move a waypoint up or down. Save to rewrite{" "}
          <code>threads/{thread.id}.yaml</code>.
        </div>
        {status && (
          <span
            className={
              status.startsWith("error")
                ? "text-xs text-rose-400"
                : "text-xs text-emerald-400"
            }
          >
            {status}
          </span>
        )}
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="text-xs px-3 py-1 rounded border border-primary bg-primary/20 text-primary-foreground disabled:opacity-40"
        >
          {saving ? "saving…" : "save"}
        </button>
      </div>
      <ol className="space-y-1">
        {order.map((w, i) => (
          <li
            key={w.id}
            className="flex items-center gap-2 rounded border border-border bg-card/50 px-2 py-1.5"
          >
            <span className="w-5 text-right text-xs text-muted-foreground">
              {i + 1}
            </span>
            <button
              onClick={() => move(i, -1)}
              disabled={i === 0}
              className="px-1 text-xs disabled:opacity-30"
              title="move up"
            >
              ↑
            </button>
            <button
              onClick={() => move(i, +1)}
              disabled={i === order.length - 1}
              className="px-1 text-xs disabled:opacity-30"
              title="move down"
            >
              ↓
            </button>
            <span className="font-mono text-xs">{w.id}</span>
            <span className="text-xs text-muted-foreground truncate flex-1">
              → {w.event}
              {w.at && <span className="ml-2 text-primary/80">@ {w.at}</span>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Strip undefined values so the emitted YAML is clean. */
function stripUndefined<T extends object>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out as T;
}

function BranchDiff({ thread, data }: { thread: Thread; data: DumpPayload }) {
  if (!thread.branches_from) return null;
  const parent = data.threads.find(
    (t) => t.id === thread.branches_from?.thread,
  );
  if (!parent) {
    return (
      <div className="mb-6 rounded border border-rose-900 bg-rose-950/30 p-3 text-xs text-rose-300">
        Parent thread {thread.branches_from.thread} not found.
      </div>
    );
  }
  const parentIds = new Set(parent.waypoints.map((w) => w.id));
  const ownIds = new Set(thread.waypoints.map((w) => w.id));
  const added = thread.waypoints.filter((w) => !parentIds.has(w.id));
  const removed = parent.waypoints.filter((w) => !ownIds.has(w.id));
  return (
    <div className="mb-6 rounded border border-border bg-card/40 p-4 text-sm">
      <div className="mb-2 font-medium">
        Branch diff: <span className="font-mono">{thread.id}</span> vs{" "}
        <span className="font-mono">{parent.id}</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-1 text-[11px] uppercase text-emerald-400">
            added ({added.length})
          </div>
          {added.length === 0 ? (
            <div className="text-xs text-muted-foreground">—</div>
          ) : (
            <ul className="space-y-0.5 text-xs font-mono">
              {added.map((w) => (
                <li key={w.id} className="text-emerald-300">
                  + {w.id}{" "}
                  <span className="text-muted-foreground">→ {w.event}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <div className="mb-1 text-[11px] uppercase text-rose-400">
            not in this branch ({removed.length})
          </div>
          {removed.length === 0 ? (
            <div className="text-xs text-muted-foreground">—</div>
          ) : (
            <ul className="space-y-0.5 text-xs font-mono">
              {removed.map((w) => (
                <li key={w.id} className="text-rose-300">
                  − {w.id}{" "}
                  <span className="text-muted-foreground">→ {w.event}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}