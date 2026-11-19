import { useEffect, useMemo, useRef, useState } from "react";
import YAML from "yaml";
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  Calendar,
  Compass,
  ExternalLink,
  GitBranch,
  GitCompare,
  Layers,
  Minus,
  Plus,
  RotateCcw,
  Route,
  Sparkles,
} from "lucide-react";
import { cn } from "../lib/utils.js";
import type { DumpEntry, DumpPayload, Thread, Waypoint } from "../lib/lw.js";
import { lwWrite, threadOf } from "../lib/lw.js";
import type { Jumper } from "../lib/saga-helpers.js";

interface Props {
  data: DumpPayload;
  sagaPath: string;
  tomeLens: string | null;
  onReloaded?: () => void;
  onJump?: Jumper;
}

type LinearWaypoint = Waypoint & { thread?: string; order: number };

interface Linearized {
  waypoints: LinearWaypoint[];
  issues: Array<{ kind: string; message: string }>;
}

type ViewMode = "stream" | "reorder" | "diff";

const INLINE_REF_RE = /@(character|location|concept|lore|waypoint|term|sigil)\/([a-z0-9][a-z0-9-]*)/g;

/**
 * Parse a waypoint `at` timestamp into a monotonically ordered numeric score
 * so calendar dates (`1024-03-15`), numeric ticks (`250`), and year strings
 * project cleanly onto a horizontal axis.
 */
function parseAtScore(at: string | undefined): number | null {
  if (!at) return null;
  const trimmed = at.trim();
  if (!trimmed) return null;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  const parsed = Date.parse(trimmed);
  if (Number.isFinite(parsed)) return parsed;
  const nums = trimmed.match(/-?\d+/g);
  if (nums && nums.length > 0) {
    // Combine hierarchical numeric segments (e.g. "Year 12, Day 4") lexicographically.
    let acc = 0;
    for (let i = 0; i < Math.min(nums.length, 3); i++) {
      acc += Number(nums[i]) * Math.pow(10000, 2 - i);
    }
    return Number.isFinite(acc) ? acc : null;
  }
  return null;
}

/**
 * Keep horizontal normalized positions inside [0, 1] while enforcing a gentle
 * minimum spacing so clustered/simultaneous waypoints never overlap on screen.
 */
function relaxNormalizedPositions(raw: number[]): number[] {
  const n = raw.length;
  if (n <= 1) return n === 1 ? [0.5] : [];
  const indexed = raw.map((val, i) => ({ val, i })).sort((a, b) => a.val - b.val || a.i - b.i);
  const minGap = Math.min(0.075, 0.72 / Math.max(1, n - 1));
  const out = indexed.map((item) => item.val);

  for (let i = 1; i < n; i++) {
    const prev = out[i - 1] ?? 0;
    const curr = out[i] ?? 0;
    if (curr - prev < minGap) {
      out[i] = prev + minGap;
    }
  }
  const last = out[n - 1] ?? 0;
  if (last > 1) {
    const overflow = last - 1;
    for (let i = 0; i < n; i++) {
      out[i] = Math.max(0, (out[i] ?? 0) - overflow);
    }
    for (let i = n - 2; i >= 0; i--) {
      const next = out[i + 1] ?? 0;
      const curr = out[i] ?? 0;
      if (next - curr < minGap) {
        out[i] = Math.max(0, next - minGap);
      }
    }
  }

  const final = new Array<number>(n);
  for (let k = 0; k < n; k++) {
    const item = indexed[k];
    if (item) {
      final[item.i] = Math.min(1, Math.max(0, out[k] ?? 0));
    }
  }
  return final;
}

export function ThreadView({
  data,
  sagaPath,
  tomeLens,
  onReloaded,
  onJump,
}: Props) {
  const threads = data.threads;
  const [selectedId, setSelectedId] = useState<string>(threads[0]?.id ?? "");
  const [withBranches, setWithBranches] = useState(true);
  const [linear, setLinear] = useState<Linearized | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ViewMode>("stream");
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useEffect(() => {
    const first = threads[0];
    if (!first) {
      setSelectedId("");
      return;
    }
    if (!threads.some((t) => t.id === selectedId)) {
      setSelectedId(first.id);
    }
  }, [threads, selectedId]);

  const activeThread = useMemo(
    () => threads.find((t) => t.id === selectedId) ?? threads[0] ?? null,
    [threads, selectedId],
  );

  useEffect(() => {
    if (!activeThread) {
      setLinear(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    threadOf(sagaPath, activeThread.id, {
      withBranches,
      tome: tomeLens ?? undefined,
    })
      .then((res) => {
        if (!cancelled) {
          setLinear(res);
          setFocusedId((prev) =>
            prev && res.waypoints.some((w) => w.id === prev)
              ? prev
              : res.waypoints[0]?.id ?? null,
          );
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sagaPath, activeThread, withBranches, tomeLens]);

  const entriesByKey = useMemo(() => {
    const map = new Map<string, DumpEntry>();
    for (const e of data.entries) {
      map.set(`${e.type}/${e.id}`, e);
    }
    return map;
  }, [data.entries]);

  const ownIds = useMemo(
    () => new Set((activeThread?.waypoints ?? []).map((w) => w.id)),
    [activeThread],
  );

  if (threads.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center animate-panel-enter">
        <div className="panel-glass max-w-md p-8 space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Compass className="h-6 w-6" />
          </div>
          <h3 className="text-base font-semibold text-foreground">No Chronology Threads</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            No timeline threads are defined in this Saga yet. Add a thread YAML file under{" "}
            <code className="rounded bg-card/70 px-1.5 py-0.5 text-xs font-mono text-primary">
              threads/
            </code>{" "}
            to chart your temporal arcs.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden animate-panel-enter">
      {/* Glassmorphic Header */}
      <header className="shrink-0 border-b border-border/70 bg-card/40 backdrop-blur-md px-4 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-3 min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary shadow-sm">
              <Compass className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-foreground">
                Chronology
              </h2>
              {activeThread && (
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  {activeThread.calendar && (
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3 w-3 text-primary/80" />
                      {activeThread.calendar}
                    </span>
                  )}
                  {activeThread.branches_from && (
                    <span className="inline-flex items-center gap-1 text-primary/90">
                      <GitBranch className="h-3 w-3" />
                      branched from {activeThread.branches_from.thread}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="h-5 w-px bg-border/60 hidden sm:block" />

          {/* Thread Picker Pills */}
          <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Threads">
            {threads.map((t) => {
              const isSelected = t.id === activeThread?.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => {
                    setSelectedId(t.id);
                    setHoveredId(null);
                  }}
                  className={cn(
                    "px-3 py-1 rounded-full text-xs font-medium transition-all interactive-lift",
                    isSelected
                      ? "active-theme-pill"
                      : "bg-card/50 border border-border/60 text-muted-foreground hover:text-foreground hover:border-primary/40",
                  )}
                >
                  {t.id}
                </button>
              );
            })}
          </div>
        </div>

        {/* View Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {activeThread?.branches_from && (
            <button
              type="button"
              onClick={() => setWithBranches((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all interactive-lift",
                withBranches
                  ? "bg-primary/15 text-primary border border-primary/40"
                  : "bg-card/50 text-muted-foreground border border-border/60 hover:text-foreground",
              )}
              title="Toggle ancestor waypoints before the branch point"
            >
              <GitBranch className="h-3.5 w-3.5" />
              Ancestor Stream
            </button>
          )}

          <div className="inline-flex items-center rounded-xl border border-border/70 bg-card/45 p-0.5 backdrop-blur-sm">
            <button
              type="button"
              onClick={() => setMode("stream")}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all",
                mode === "stream"
                  ? "active-theme-pill"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Stream
            </button>
            <button
              type="button"
              onClick={() => setMode("reorder")}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all",
                mode === "reorder"
                  ? "active-theme-pill"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
              Reorder
            </button>
            {threads.length >= 2 && (
              <button
                type="button"
                onClick={() => setMode("diff")}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all",
                  mode === "diff"
                    ? "active-theme-pill"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <GitCompare className="h-3.5 w-3.5" />
                Compare
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 py-4 space-y-4">
          {error && (
            <div className="panel-glass border-destructive/50 p-4 text-sm text-destructive flex items-center gap-2.5">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading && !linear && (
            <div className="panel-glass p-12 text-center text-sm text-muted-foreground">
              Tracing temporal stream…
            </div>
          )}

          {linear && linear.issues.length > 0 && (
            <div className="panel-glass border-amber-500/40 bg-amber-500/10 p-4 space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5" />
                Chronology Coherence Notes ({linear.issues.length})
              </div>
              <ul className="space-y-1 text-xs text-amber-200/90 pl-5 list-disc">
                {linear.issues.map((issue, idx) => (
                  <li key={idx}>
                    <span className="font-mono text-amber-300/90">{issue.kind}:</span>{" "}
                    {issue.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {mode === "stream" && linear && activeThread && (
            <EtherealChronologyStream
              waypoints={linear.waypoints}
              activeThread={activeThread}
              ownIds={ownIds}
              withBranches={withBranches}
              entriesByKey={entriesByKey}
              focusedId={focusedId}
              hoveredId={hoveredId}
              onSelect={setFocusedId}
              onHover={setHoveredId}
              onJump={onJump}
            />
          )}

          {mode === "reorder" && activeThread && (
            <ThreadReorder
              thread={activeThread}
              sagaPath={sagaPath}
              onSaved={onReloaded}
            />
          )}

          {mode === "diff" && activeThread && (
            <BranchDiff base={activeThread} threads={threads} />
          )}
        </div>
      </div>
    </div>
  );
}

interface PositionedPoint {
  waypoint: LinearWaypoint;
  index: number;
  isOwn: boolean;
  threadLabel: string;
  xPct: number;
  yPct: number;
  svgX: number;
  svgY: number;
  row?: number;
  col?: number;
  isRowEven?: boolean;
}

type StreamStyle = "winding" | "linear";

function EtherealChronologyStream({
  waypoints,
  activeThread,
  ownIds,
  withBranches,
  entriesByKey,
  focusedId,
  hoveredId,
  onSelect,
  onHover,
  onJump,
}: {
  waypoints: LinearWaypoint[];
  activeThread: Thread;
  ownIds: Set<string>;
  withBranches: boolean;
  entriesByKey: Map<string, DumpEntry>;
  focusedId: string | null;
  hoveredId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onJump?: Jumper;
}) {
  const [streamStyle, setStreamStyle] = useState<StreamStyle>("winding");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);

  const adjustZoom = (delta: number) => {
    setZoom((z) => Math.min(2.5, Math.max(0.5, Number((z + delta).toFixed(2)))));
  };

  const resetZoomAndPan = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const layout = useMemo(() => {
    const n = waypoints.length;
    if (n === 0) {
      return {
        points: [] as PositionedPoint[],
        isDated: false,
        hasDualLane: false,
        minLabel: "",
        maxLabel: "",
        svgHeight: 240,
        itemsPerRow: 4,
        numRows: 1,
      };
    }

    const parsedScores = waypoints.map((w) => parseAtScore(w.at));
    const allNumeric = parsedScores.every((s): s is number => s !== null);
    let minScore = 0;
    let maxScore = 0;
    if (allNumeric) {
      minScore = Math.min(...parsedScores);
      maxScore = Math.max(...parsedScores);
    }
    const isDated = allNumeric && maxScore > minScore;

    const rawNormalized = waypoints.map((_, idx) => {
      if (isDated) {
        const score = parsedScores[idx]!;
        return (score - minScore) / (maxScore - minScore);
      }
      return n === 1 ? 0.5 : idx / (n - 1);
    });

    const isOwnList = waypoints.map((w) => {
      if (w.thread) return w.thread === activeThread.id;
      return ownIds.has(w.id);
    });

    const hasInherited = isOwnList.some((o) => !o);
    const hasOwn = isOwnList.some((o) => o);
    const hasDualLane = Boolean(withBranches && hasInherited && hasOwn && streamStyle === "linear");

    let svgHeight = 240;
    let itemsPerRow = 4;
    let numRows = 1;
    let points: PositionedPoint[];

    if (streamStyle === "winding") {
      itemsPerRow = n > 14 ? 5 : n <= 4 ? Math.max(1, n) : 4;
      numRows = Math.ceil(n / itemsPerRow);
      const rowHeight = 160;
      svgHeight = Math.max(260, 60 + numRows * rowHeight);

      points = waypoints.map((w, idx) => {
        const row = Math.floor(idx / itemsPerRow);
        const col = idx % itemsPerRow;
        const isRowEven = row % 2 === 0;
        const countInRow = Math.min(itemsPerRow, n - row * itemsPerRow);
        const colFrac = countInRow > 1 ? col / (countInRow - 1) : 0.5;

        // X coordinate (spans 140 to 860)
        const svgX = isRowEven
          ? 140 + colFrac * 720
          : 860 - colFrac * 720;

        // Y coordinate with slight wave
        const baseY = 80 + row * rowHeight;
        const wave = Math.sin(colFrac * Math.PI) * 10;
        const svgY = baseY + wave;

        const xPct = (svgX / 1000) * 100;
        const yPct = (svgY / svgHeight) * 100;
        const isOwn = isOwnList[idx]!;
        const threadLabel =
          w.thread ??
          (isOwn ? activeThread.id : activeThread.branches_from?.thread ?? "ancestor");

        return {
          waypoint: w,
          index: idx,
          isOwn,
          threadLabel,
          xPct,
          yPct,
          svgX,
          svgY,
          row,
          col,
          isRowEven,
        };
      });
    } else {
      // Linear single-ribbon stream
      const relaxed = relaxNormalizedPositions(rawNormalized);
      points = waypoints.map((w, idx) => {
        const t = relaxed[idx]!;
        const xPct = 10 + t * 80;
        const svgX = xPct * 10;
        const isOwn = isOwnList[idx]!;

        let svgY: number;
        if (hasDualLane) {
          svgY = isOwn
            ? 162 + Math.sin(t * Math.PI * 1.4) * 10
            : 64 + Math.cos(t * Math.PI * 1.4) * 8;
        } else {
          svgY = 120 + Math.sin(t * Math.PI * 1.6 - 0.5) * 20;
        }
        const yPct = (svgY / 240) * 100;

        const threadLabel =
          w.thread ??
          (isOwn ? activeThread.id : activeThread.branches_from?.thread ?? "ancestor");

        return {
          waypoint: w,
          index: idx,
          isOwn,
          threadLabel,
          xPct,
          yPct,
          svgX,
          svgY,
          row: 0,
          col: idx,
          isRowEven: true,
        };
      });
    }

    const datedPoints = waypoints.filter((w) => Boolean(w.at));
    const minLabel = datedPoints[0]?.at ?? `#1`;
    const maxLabel = datedPoints[datedPoints.length - 1]?.at ?? `#${n}`;

    return {
      points,
      isDated,
      hasDualLane,
      minLabel,
      maxLabel,
      svgHeight,
      itemsPerRow,
      numRows,
    };
  }, [waypoints, activeThread, ownIds, withBranches, streamStyle]);

  const activePoint =
    layout.points.find((p) => p.waypoint.id === focusedId) ??
    layout.points[0] ??
    null;

  const activeIndex = activePoint
    ? layout.points.findIndex((p) => p.waypoint.id === activePoint.waypoint.id)
    : -1;

  // Build smooth Bezier path string through ordered SVG coordinates.
  const buildSmoothPath = (pts: PositionedPoint[]): string => {
    if (pts.length === 0) return "";
    if (pts.length === 1) {
      const p = pts[0]!;
      return `M ${Math.max(40, p.svgX - 180)} ${p.svgY} L ${Math.min(960, p.svgX + 180)} ${p.svgY}`;
    }
    let d = `M ${pts[0]!.svgX.toFixed(1)} ${pts[0]!.svgY.toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1]!;
      const curr = pts[i]!;

      if (
        streamStyle === "winding" &&
        prev.row !== undefined &&
        curr.row !== undefined &&
        prev.row !== curr.row
      ) {
        // Curve downwards and wrap to the next row (serpentine U-turn)
        if (prev.isRowEven) {
          // Turning on the RIGHT side
          const loopX = Math.min(965, Math.max(prev.svgX, curr.svgX) + 85);
          d += ` C ${loopX.toFixed(1)} ${(prev.svgY + 22).toFixed(1)}, ${loopX.toFixed(1)} ${(curr.svgY - 22).toFixed(1)}, ${curr.svgX.toFixed(1)} ${curr.svgY.toFixed(1)}`;
        } else {
          // Turning on the LEFT side
          const loopX = Math.max(35, Math.min(prev.svgX, curr.svgX) - 85);
          d += ` C ${loopX.toFixed(1)} ${(prev.svgY + 22).toFixed(1)}, ${loopX.toFixed(1)} ${(curr.svgY - 22).toFixed(1)}, ${curr.svgX.toFixed(1)} ${curr.svgY.toFixed(1)}`;
        }
      } else {
        // Regular in-row curve
        const midX = ((prev.svgX + curr.svgX) / 2).toFixed(1);
        const waveOffset =
          streamStyle === "winding" ? (prev.isRowEven ? 6 : -6) : 0;
        const midY = ((prev.svgY + curr.svgY) / 2 + waveOffset).toFixed(1);
        d += ` C ${midX} ${prev.svgY.toFixed(1)}, ${midX} ${midY}, ${curr.svgX.toFixed(1)} ${curr.svgY.toFixed(1)}`;
      }
    }
    return d;
  };

  const inheritedPoints = layout.hasDualLane
    ? layout.points.filter((p) => !p.isOwn)
    : [];
  const ownPoints = layout.hasDualLane
    ? layout.points.filter((p) => p.isOwn)
    : layout.points;

  const primaryStreamPath = buildSmoothPath(ownPoints);
  const ancestorStreamPath = buildSmoothPath(inheritedPoints);
  const branchBridgePath =
    inheritedPoints.length > 0 && ownPoints.length > 0
      ? (() => {
          const from = inheritedPoints[inheritedPoints.length - 1]!;
          const to = ownPoints[0]!;
          const midX = ((from.svgX + to.svgX) / 2).toFixed(1);
          return `M ${from.svgX.toFixed(1)} ${from.svgY.toFixed(1)} C ${midX} ${from.svgY.toFixed(1)}, ${midX} ${to.svgY.toFixed(1)}, ${to.svgX.toFixed(1)} ${to.svgY.toFixed(1)}`;
        })()
      : "";

  if (layout.points.length === 0) {
    return (
      <div className="panel-glass p-10 text-center space-y-2">
        <p className="text-sm font-medium text-foreground">No waypoints in view</p>
        <p className="text-xs text-muted-foreground">
          Try clearing the active Tome lens or adding waypoints to{" "}
          <span className="font-mono text-primary">{activeThread.id}</span>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 1. Ethereal Astral Chronology Stream */}
      <section className="panel-glass relative overflow-hidden p-4 sm:p-5">
        {/* Soft Ethereal Horizon Glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 left-1/2 h-56 w-[80%] -translate-x-1/2 rounded-full opacity-25 blur-3xl"
          style={{
            background:
              "radial-gradient(ellipse at center, hsl(var(--primary) / 0.45), hsl(var(--ring) / 0.15) 60%, transparent 100%)",
          }}
        />

        {/* Stream Header Metadata & Exploration Toolbar */}
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border/40">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
              <Layers className="h-3.5 w-3.5 text-primary" />
              Astral Stream
            </span>
            <span className="rounded-full bg-card/60 border border-border/60 px-2 py-0.5 text-[11px] text-muted-foreground">
              {layout.points.length} {layout.points.length === 1 ? "waypoint" : "waypoints"}
            </span>
            {layout.hasDualLane && (
              <span className="inline-flex items-center gap-2 rounded-full bg-card/60 border border-border/60 px-2.5 py-0.5 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-ring" />
                  Ancestor ({inheritedPoints.length})
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-primary" />
                  {activeThread.id} ({ownPoints.length})
                </span>
              </span>
            )}
            <div className="text-[11px] font-mono text-muted-foreground pl-1">
              {layout.isDated
                ? `${layout.minLabel} → ${layout.maxLabel}`
                : `Sequence · 1 → ${layout.points.length}`}
            </div>
          </div>

          {/* Interactive Flow Style & Zoom Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Winding S-Curve vs Linear Ribbon Mode Toggle */}
            <div className="inline-flex items-center rounded-lg border border-border/70 bg-card/50 p-0.5">
              <button
                type="button"
                onClick={() => setStreamStyle("winding")}
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-all",
                  streamStyle === "winding"
                    ? "active-theme-pill font-semibold shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                title="Winding Serpentine River (S-curves across multiple rows for scalable clarity)"
              >
                <Route className="h-3.5 w-3.5" />
                <span>Winding River</span>
              </button>
              <button
                type="button"
                onClick={() => setStreamStyle("linear")}
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-all",
                  streamStyle === "linear"
                    ? "active-theme-pill font-semibold shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                title="Single Linear Ribbon (Left to Right stream)"
              >
                <ArrowRight className="h-3.5 w-3.5" />
                <span>Linear</span>
              </button>
            </div>

            {/* Zoom Controls */}
            <div className="inline-flex items-center rounded-lg border border-border/70 bg-card/50 p-0.5">
              <button
                type="button"
                onClick={() => adjustZoom(-0.15)}
                className="p-1 text-muted-foreground hover:text-foreground rounded"
                aria-label="Zoom out"
                title="Zoom out"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={resetZoomAndPan}
                className="px-1.5 text-[10px] font-mono text-muted-foreground hover:text-foreground min-w-[36px] text-center"
                title="Click to reset zoom and pan"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                onClick={() => adjustZoom(0.15)}
                className="p-1 text-muted-foreground hover:text-foreground rounded"
                aria-label="Zoom in"
                title="Zoom in"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={resetZoomAndPan}
                className="p-1 text-muted-foreground hover:text-foreground rounded border-l border-border/50 ml-0.5"
                aria-label="Reset stream view"
                title="Reset zoom and position"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Scalable Interactive Stage with Zoom & Pan */}
        <div
          ref={containerRef}
          className={cn(
            "relative z-10 mt-3 w-full select-none rounded-xl border border-border/40 bg-background/25 overflow-hidden transition-all",
            streamStyle === "winding"
              ? layout.numRows > 2
                ? "h-[540px] sm:h-[620px]"
                : "h-[360px] sm:h-[420px]"
              : "h-56 sm:h-64",
            isDragging ? "cursor-grabbing" : "cursor-grab",
          )}
          onWheel={(e) => {
            e.preventDefault();
            adjustZoom(e.deltaY < 0 ? 0.12 : -0.12);
          }}
          onMouseDown={(e) => {
            if (e.button !== 0) return;
            dragRef.current = {
              startX: e.clientX,
              startY: e.clientY,
              origX: pan.x,
              origY: pan.y,
              moved: false,
            };
            setIsDragging(true);
          }}
          onMouseMove={(e) => {
            const drag = dragRef.current;
            if (!drag) return;
            const dx = e.clientX - drag.startX;
            const dy = e.clientY - drag.startY;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
              drag.moved = true;
              setPan({ x: drag.origX + dx, y: drag.origY + dy });
            }
          }}
          onMouseUp={() => {
            dragRef.current = null;
            setIsDragging(false);
          }}
          onMouseLeave={() => {
            dragRef.current = null;
            setIsDragging(false);
          }}
        >
          {/* Zoomable & Pannable Canvas Wrapper */}
          <div
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "center center",
              transition: isDragging ? "none" : "transform 140ms ease-out",
              width: "100%",
              height: "100%",
            }}
            className="relative w-full h-full"
          >
            {/* SVG Ethereal River & Bifurcation Curves */}
            <svg
              viewBox={`0 0 1000 ${layout.svgHeight}`}
              preserveAspectRatio={streamStyle === "winding" ? "xMidYMid meet" : "none"}
              className="absolute inset-0 h-full w-full pointer-events-none"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="lw-thread-stream" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="hsl(var(--ring))" stopOpacity="0.45" />
                  <stop offset="50%" stopColor="hsl(var(--primary))" stopOpacity="0.95" />
                  <stop offset="100%" stopColor="hsl(var(--ring))" stopOpacity="0.65" />
                </linearGradient>
                <linearGradient id="lw-branch-stream" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="hsl(var(--muted-foreground))" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="hsl(var(--ring))" stopOpacity="0.85" />
                </linearGradient>
                <filter id="lw-stream-bloom" x="-20%" y="-40%" width="140%" height="180%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {streamStyle === "linear" && (
                <>
                  <line
                    x1="100"
                    y1="20"
                    x2="100"
                    y2="220"
                    stroke="hsl(var(--border))"
                    strokeOpacity="0.25"
                    strokeDasharray="3 5"
                  />
                  <line
                    x1="900"
                    y1="20"
                    x2="900"
                    y2="220"
                    stroke="hsl(var(--border))"
                    strokeOpacity="0.25"
                    strokeDasharray="3 5"
                  />
                </>
              )}

              {ancestorStreamPath && (
                <>
                  <path
                    d={ancestorStreamPath}
                    fill="none"
                    stroke="hsl(var(--ring))"
                    strokeOpacity="0.2"
                    strokeWidth="6"
                  />
                  <path
                    d={ancestorStreamPath}
                    fill="none"
                    stroke="url(#lw-branch-stream)"
                    strokeWidth="2.2"
                    strokeDasharray="6 6"
                    className="animate-stream-flow"
                  />
                </>
              )}

              {branchBridgePath && (
                <path
                  d={branchBridgePath}
                  fill="none"
                  stroke="hsl(var(--ring))"
                  strokeOpacity="0.65"
                  strokeWidth="2"
                  strokeDasharray="5 5"
                  className="animate-stream-flow"
                  filter="url(#lw-stream-bloom)"
                />
              )}

              {primaryStreamPath && (
                <>
                  <path
                    d={primaryStreamPath}
                    fill="none"
                    stroke="hsl(var(--primary))"
                    strokeOpacity="0.18"
                    strokeWidth="9"
                    strokeLinecap="round"
                  />
                  <path
                    d={primaryStreamPath}
                    fill="none"
                    stroke="hsl(var(--border))"
                    strokeOpacity="0.45"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <path
                    d={primaryStreamPath}
                    fill="none"
                    stroke="url(#lw-thread-stream)"
                    strokeWidth="2.75"
                    strokeLinecap="round"
                    strokeDasharray="12 8"
                    className="animate-stream-flow"
                    filter="url(#lw-stream-bloom)"
                  />
                </>
              )}
            </svg>

            {/* Interactive Waypoint Orbs */}
            {layout.points.map((pt) => {
              const { waypoint: w, index, isOwn, xPct, yPct } = pt;
              const entry = resolveWaypointEntry(w, entriesByKey);
              const title = entry?.name || w.label || w.id;
              const isSelected = activePoint?.waypoint.id === w.id;
              const isHovered = hoveredId === w.id;

              const labelAbove =
                streamStyle === "winding"
                  ? (pt.isRowEven ? (pt.col ?? index) % 2 === 1 : (pt.col ?? index) % 2 === 0)
                  : (layout.hasDualLane ? !isOwn : index % 2 === 0);

              // Smart edge-aware label alignment so outermost nodes tuck cleanly inward.
              const labelAlign =
                xPct < 22
                  ? "-translate-x-1/4"
                  : xPct > 78
                    ? "-translate-x-3/4"
                    : "-translate-x-1/2";

              return (
                <div
                  key={`${pt.threadLabel}:${w.id}`}
                  style={{ left: `${xPct}%`, top: `${yPct}%` }}
                  className={cn(
                    "absolute -translate-x-1/2 -translate-y-1/2",
                    isHovered ? "z-40" : isSelected ? "z-30" : "z-20",
                  )}
                >
                  <button
                    type="button"
                    data-sound="hover"
                    onClick={() => onSelect(w.id)}
                    onDoubleClick={() => {
                      if (onJump && entry) {
                        onJump({ kind: "entry", key: `${entry.type}/${entry.id}` });
                      }
                    }}
                    onMouseEnter={() => onHover(w.id)}
                    onMouseLeave={() => onHover(null)}
                    className={cn(
                      "group relative flex items-center justify-center rounded-full transition-transform duration-300 focus:outline-none",
                      isSelected
                        ? "h-6 w-6 scale-115"
                        : isHovered
                          ? "h-5 w-5 scale-125"
                          : "h-4 w-4 hover:scale-125",
                    )}
                    aria-label={`Select waypoint ${title}`}
                  >
                    {/* Animated Outer Orbital Halo */}
                    {isSelected && (
                      <span
                        aria-hidden="true"
                        className="absolute -inset-2.5 rounded-full animate-ping opacity-30 bg-primary"
                      />
                    )}
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute -inset-1.5 rounded-full border transition-all duration-300",
                        isSelected
                          ? "border-primary/80 scale-100 opacity-100"
                          : "border-primary/40 scale-75 opacity-0 group-hover:scale-100 group-hover:opacity-100",
                      )}
                    />
                    {/* Luminous Core */}
                    <span
                      className={cn(
                        "relative block rounded-full transition-all duration-300 shadow-lg",
                        isSelected ? "h-3.5 w-3.5" : "h-2.5 w-2.5",
                        isOwn ? "bg-primary" : "bg-ring",
                      )}
                      style={{
                        boxShadow: isSelected || isHovered
                          ? "0 0 18px hsl(var(--primary) / 0.85)"
                          : "0 0 10px hsl(var(--primary) / 0.45)",
                      }}
                    />
                  </button>

                  {/* Staggered Floating Label Pill */}
                  <div
                    className={cn(
                      "pointer-events-none absolute left-1/2 w-max max-w-[140px] transition-all duration-200",
                      labelAlign,
                      labelAbove ? "bottom-full mb-3.5" : "top-full mt-3.5",
                    )}
                  >
                    <div
                      className={cn(
                        "rounded-xl border px-2.5 py-1 text-center backdrop-blur-md transition-all shadow-sm",
                        isSelected
                          ? "border-primary/70 bg-card/95 shadow-lg shadow-primary/15"
                          : isHovered
                            ? "border-primary/45 bg-card/90 shadow-md"
                            : "border-border/60 bg-card/75",
                      )}
                    >
                      <div className="text-[10px] font-mono text-primary/90 leading-tight truncate">
                        {w.at ?? `#${index + 1}`}
                      </div>
                      <div
                        className={cn(
                          "text-[11px] font-medium leading-tight truncate",
                          isSelected ? "text-foreground" : "text-foreground/85",
                        )}
                      >
                        {title}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom-Left Stage Navigation Hint */}
          <div className="pointer-events-none absolute bottom-2.5 left-3 hidden sm:flex items-center gap-1.5 rounded-full border border-border/40 bg-card/65 backdrop-blur-md px-2.5 py-1 text-[10px] text-muted-foreground">
            <Compass className="h-3 w-3 text-primary/80" />
            <span>Scroll to zoom ({Math.round(zoom * 100)}%) · Drag to explore stream · Click waypoint to spotlight</span>
          </div>
        </div>
      </section>

      {/* 2. Interactive Waypoint Spotlight */}
      {activePoint && (
        <WaypointSpotlight
          point={activePoint}
          total={layout.points.length}
          index={activeIndex}
          entriesByKey={entriesByKey}
          onPrev={
            activeIndex > 0
              ? () => onSelect(layout.points[activeIndex - 1]!.waypoint.id)
              : undefined
          }
          onNext={
            activeIndex >= 0 && activeIndex < layout.points.length - 1
              ? () => onSelect(layout.points[activeIndex + 1]!.waypoint.id)
              : undefined
          }
          onJump={onJump}
        />
      )}

      {/* 3. Chronicle Cards Grid */}
      <section className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Chronicle Ledger
          </h3>
          <span className="text-[11px] text-muted-foreground">
            Click a card to focus on the stream
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {layout.points.map((pt) => {
            const { waypoint: w, index, isOwn, threadLabel } = pt;
            const linkedEntry = resolveWaypointEntry(w, entriesByKey);
            const title = linkedEntry?.name || w.label || w.id;
            const isSelected = activePoint?.waypoint.id === w.id;

            return (
              <div
                key={`card:${threadLabel}:${w.id}`}
                role="button"
                tabIndex={0}
                data-sound="hover"
                onClick={() => onSelect(w.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(w.id);
                  }
                }}
                onMouseEnter={() => onHover(w.id)}
                onMouseLeave={() => onHover(null)}
                className={cn(
                  "panel-glass interactive-lift cursor-pointer p-4 flex flex-col justify-between gap-3 transition-all text-left",
                  isSelected
                    ? "border-primary/70 ring-1 ring-primary/35 shadow-lg shadow-primary/10"
                    : "hover:border-primary/40",
                )}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-mono font-medium",
                        isSelected
                          ? "bg-primary/20 text-primary"
                          : "bg-card/70 text-muted-foreground border border-border/60",
                      )}
                    >
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          isOwn ? "bg-primary" : "bg-ring",
                        )}
                      />
                      #{String(index + 1).padStart(2, "0")}
                    </span>

                    <div className="flex items-center gap-1.5">
                      {!isOwn && (
                        <span className="rounded-full bg-ring/15 px-2 py-0.5 text-[10px] text-ring font-medium">
                          {threadLabel}
                        </span>
                      )}
                      {w.at && (
                        <span className="rounded-md bg-card/70 border border-border/60 px-2 py-0.5 text-[10px] font-mono text-foreground/80">
                          {w.at}
                        </span>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-sm font-semibold text-foreground line-clamp-1">
                      {title}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                      {w.event}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/40 text-[11px]">
                  <div className="flex flex-wrap items-center gap-1 min-w-0">
                    {w.appears_in && w.appears_in.length > 0 ? (
                      w.appears_in.slice(0, 2).map((ch) => (
                        <span
                          key={ch}
                          className="rounded bg-card/70 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground truncate max-w-[110px]"
                        >
                          {ch}
                        </span>
                      ))
                    ) : (
                      <span className="text-[10px] font-mono text-muted-foreground/70 truncate">
                        waypoint/{w.id}
                      </span>
                    )}
                  </div>

                  {onJump && linkedEntry && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onJump({
                          kind: "entry",
                          key: `${linkedEntry.type}/${linkedEntry.id}`,
                        });
                      }}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline shrink-0"
                    >
                      Codex
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function WaypointSpotlight({
  point,
  total,
  index,
  entriesByKey,
  onPrev,
  onNext,
  onJump,
}: {
  point: PositionedPoint;
  total: number;
  index: number;
  entriesByKey: Map<string, DumpEntry>;
  onPrev?: () => void;
  onNext?: () => void;
  onJump?: Jumper;
}) {
  const { waypoint: w, isOwn, threadLabel } = point;
  const linkedEntry = resolveWaypointEntry(w, entriesByKey);
  const title = linkedEntry?.name || w.label || w.id;

  const inlineRefs = useMemo(() => {
    const found: DumpEntry[] = [];
    const seen = new Set<string>();
    for (const m of w.event.matchAll(INLINE_REF_RE)) {
      const k = `${m[1]}/${m[2]}`;
      if (seen.has(k)) continue;
      const e = entriesByKey.get(k);
      if (e) {
        seen.add(k);
        found.push(e);
      }
    }
    return found;
  }, [w.event, entriesByKey]);

  return (
    <section className="panel-glass p-5 sm:p-6 relative overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2 max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] font-mono font-medium text-primary">
              Step {index + 1} of {total}
            </span>
            {w.at && (
              <span className="inline-flex items-center gap-1 rounded-full bg-card/70 border border-border/60 px-2.5 py-0.5 text-[11px] font-mono text-foreground">
                <Calendar className="h-3 w-3 text-primary/80" />
                {w.at}
              </span>
            )}
            <span className="rounded-full bg-card/70 border border-border/60 px-2.5 py-0.5 text-[11px] text-muted-foreground">
              {isOwn ? `Thread: ${threadLabel}` : `Inherited from ${threadLabel}`}
            </span>
          </div>

          <h3 className="text-lg font-semibold tracking-tight text-foreground">
            {title}
          </h3>
          <p className="text-sm text-foreground/85 leading-relaxed">{w.event}</p>

          {(w.appears_in?.length || inlineRefs.length > 0) && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {w.appears_in?.map((t) => (
                <span
                  key={t}
                  className="rounded-md bg-card/75 border border-border/60 px-2 py-0.5 text-[11px] font-mono text-muted-foreground"
                >
                  {t}
                </span>
              ))}
              {onJump &&
                inlineRefs.map((refEntry) => {
                  const key = `${refEntry.type}/${refEntry.id}`;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => onJump({ kind: "entry", key })}
                      className="rounded-md bg-primary/10 border border-primary/30 px-2 py-0.5 text-[11px] text-primary hover:bg-primary/20 transition-colors"
                    >
                      @{refEntry.name}
                    </button>
                  );
                })}
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-2.5 shrink-0">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={!onPrev}
              onClick={onPrev}
              className={cn(
                "inline-flex items-center gap-1 rounded-lg border border-border/70 bg-card/60 px-2.5 py-1.5 text-xs font-medium transition-all",
                onPrev
                  ? "text-foreground hover:border-primary/50 interactive-lift"
                  : "text-muted-foreground/40 cursor-not-allowed",
              )}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Prev
            </button>
            <button
              type="button"
              disabled={!onNext}
              onClick={onNext}
              className={cn(
                "inline-flex items-center gap-1 rounded-lg border border-border/70 bg-card/60 px-2.5 py-1.5 text-xs font-medium transition-all",
                onNext
                  ? "text-foreground hover:border-primary/50 interactive-lift"
                  : "text-muted-foreground/40 cursor-not-allowed",
              )}
            >
              Next
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {onJump && linkedEntry && (
            <button
              type="button"
              onClick={() =>
                onJump({
                  kind: "entry",
                  key: `${linkedEntry.type}/${linkedEntry.id}`,
                })
              }
              className="active-theme-pill inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-medium interactive-lift"
            >
              Open Waypoint in Codex
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function resolveWaypointEntry(
  w: Waypoint,
  entriesByKey: Map<string, DumpEntry>,
): DumpEntry | null {
  const byWaypointId = entriesByKey.get(`waypoint/${w.id}`);
  if (byWaypointId) return byWaypointId;
  const cleanedEvent = w.event.trim().replace(/^@/, "");
  return entriesByKey.get(cleanedEvent) ?? null;
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) {
        out[k] = stripUndefined(v);
      }
    }
    return out as T;
  }
  return value;
}

function ThreadReorder({
  thread,
  sagaPath,
  onSaved,
}: {
  thread: Thread;
  sagaPath: string;
  onSaved?: () => void;
}) {
  const [items, setItems] = useState<Waypoint[]>(thread.waypoints);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setItems(thread.waypoints);
    setNotice(null);
    setErr(null);
  }, [thread]);

  const dirty = useMemo(() => {
    if (items.length !== thread.waypoints.length) return true;
    return items.some((w, i) => w.id !== thread.waypoints[i]?.id);
  }, [items, thread.waypoints]);

  function move(idx: number, delta: number) {
    const target = idx + delta;
    if (target < 0 || target >= items.length) return;
    setItems((prev) => {
      const next = [...prev];
      const [removed] = next.splice(idx, 1);
      next.splice(target, 0, removed!);
      return next;
    });
    setNotice(null);
  }

  async function save() {
    setSaving(true);
    setErr(null);
    setNotice(null);
    try {
      const doc = stripUndefined({
        id: thread.id,
        calendar: thread.calendar,
        branches_from: thread.branches_from,
        waypoints: items,
      });
      await lwWrite(sagaPath, thread.relPath, YAML.stringify(doc));
      setNotice("Sequence saved.");
      onSaved?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel-glass max-w-3xl mx-auto p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Reorder Waypoints · {thread.id}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Arrange the sequence written to{" "}
            <span className="font-mono text-primary/90">{thread.relPath}</span>.
          </p>
        </div>

        <button
          type="button"
          disabled={!dirty || saving}
          onClick={save}
          className={cn(
            "px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all",
            dirty && !saving
              ? "active-theme-pill interactive-lift"
              : "bg-card/50 border border-border/50 text-muted-foreground/50 cursor-not-allowed",
          )}
        >
          {saving ? "Saving…" : "Save Sequence"}
        </button>
      </div>

      {notice && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
          {notice}
        </div>
      )}
      {err && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {err}
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">
          This thread has no local waypoints to reorder.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((w, idx) => (
            <li
              key={w.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/55 px-3.5 py-2.5"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-primary">
                    #{String(idx + 1).padStart(2, "0")}
                  </span>
                  <span className="text-xs font-semibold text-foreground truncate">
                    {w.label || w.id}
                  </span>
                  {w.at && (
                    <span className="rounded bg-card/80 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                      {w.at}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{w.event}</p>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  disabled={idx === 0}
                  onClick={() => move(idx, -1)}
                  className="p-1.5 rounded-lg border border-border/60 bg-card/60 text-muted-foreground hover:text-foreground disabled:opacity-35"
                  aria-label="Move waypoint up"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={idx === items.length - 1}
                  onClick={() => move(idx, 1)}
                  className="p-1.5 rounded-lg border border-border/60 bg-card/60 text-muted-foreground hover:text-foreground disabled:opacity-35"
                  aria-label="Move waypoint down"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function BranchDiff({ base, threads }: { base: Thread; threads: Thread[] }) {
  const candidates = threads.filter((t) => t.id !== base.id);
  const defaultOther =
    (base.branches_from &&
      candidates.find((t) => t.id === base.branches_from?.thread)?.id) ??
    candidates[0]?.id ??
    "";
  const [otherId, setOtherId] = useState(defaultOther);

  useEffect(() => {
    if (!candidates.some((c) => c.id === otherId)) {
      setOtherId(defaultOther);
    }
  }, [candidates, otherId, defaultOther]);

  const other = candidates.find((t) => t.id === otherId) ?? null;

  const { onlyBase, onlyOther, shared } = useMemo(() => {
    if (!other) {
      return {
        onlyBase: base.waypoints,
        onlyOther: [] as Waypoint[],
        shared: [] as Waypoint[],
      };
    }
    const baseIds = new Set(base.waypoints.map((w) => w.id));
    const otherIds = new Set(other.waypoints.map((w) => w.id));
    return {
      onlyBase: base.waypoints.filter((w) => !otherIds.has(w.id)),
      onlyOther: other.waypoints.filter((w) => !baseIds.has(w.id)),
      shared: base.waypoints.filter((w) => otherIds.has(w.id)),
    };
  }, [base, other]);

  return (
    <section className="panel-glass p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Compare Chronology Branches
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Inspect diverging waypoints between <span className="text-primary">{base.id}</span> and another thread.
          </p>
        </div>

        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Compare with</span>
          <select
            value={otherId}
            onChange={(e) => setOtherId(e.target.value)}
            className="rounded-lg border border-border/70 bg-card/70 px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/60"
          >
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.id}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <DiffColumn
          title={`Only in ${base.id}`}
          count={onlyBase.length}
          tone="primary"
          waypoints={onlyBase}
        />
        <DiffColumn
          title="Shared Waypoints"
          count={shared.length}
          tone="neutral"
          waypoints={shared}
        />
        <DiffColumn
          title={other ? `Only in ${other.id}` : "Other"}
          count={onlyOther.length}
          tone="ring"
          waypoints={onlyOther}
        />
      </div>
    </section>
  );
}

function DiffColumn({
  title,
  count,
  tone,
  waypoints,
}: {
  title: string;
  count: number;
  tone: "primary" | "ring" | "neutral";
  waypoints: Waypoint[];
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/45 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground">{title}</span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-mono",
            tone === "primary"
              ? "bg-primary/20 text-primary"
              : tone === "ring"
                ? "bg-ring/20 text-ring"
                : "bg-card/80 text-muted-foreground",
          )}
        >
          {count}
        </span>
      </div>
      {waypoints.length === 0 ? (
        <p className="text-xs text-muted-foreground/70">None</p>
      ) : (
        <ul className="space-y-2">
          {waypoints.map((w) => (
            <li
              key={w.id}
              className="rounded-lg border border-border/50 bg-card/65 p-2.5 space-y-0.5"
            >
              <div className="flex items-center justify-between gap-2 text-xs font-medium text-foreground">
                <span className="truncate">{w.label || w.id}</span>
                {w.at && (
                  <span className="text-[10px] font-mono text-primary shrink-0">
                    {w.at}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground line-clamp-2">{w.event}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
