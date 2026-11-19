import { useMemo, useRef, useState } from "react";
import { canonicalType, REF_REGEX } from "@loreweave/core";
import {
  ArrowRight,
  Compass,
  Minus,
  Orbit,
  Plus,
  RotateCcw,
  Sparkles,
  Tag,
  X,
} from "lucide-react";
import { cn } from "../lib/utils.js";
import type { DumpEntry, DumpPayload, EntryType } from "../lib/lw.js";

interface Props {
  data: DumpPayload;
  onJump: (loc: { kind: "entry"; key: string }) => void;
}

const TYPE_ORDER: EntryType[] = [
  "character",
  "location",
  "concept",
  "lore",
  "waypoint",
  "term",
  "sigil",
];

const TYPE_COLOR: Record<EntryType, string> = {
  character: "#fbbf24",
  location: "#34d399",
  concept: "#60a5fa",
  lore: "#a78bfa",
  waypoint: "#f87171",
  term: "#22d3ee",
  sigil: "#f472b6",
};

const REF_RE =
  /@(character|location|concept|lore|waypoint|term|sigil)\/([a-z0-9][a-z0-9-]*)/g;

interface StarNode {
  id: string;
  entry: DumpEntry;
  x: number;
  y: number;
  color: string;
  ring: number;
}

interface StarEdge {
  id: string;
  from: string;
  to: string;
  kind: "echo" | "inherits";
}

function summarizeBody(body: string): string {
  const cleaned = body
    .split(/\r?\n/)
    .map((line) => line.replace(/^#+\s*/, "").replace(/^[-*]\s+/, "").trim())
    .find((line) => line.length > 0);
  if (!cleaned) return "";
  return cleaned.replace(REF_RE, (_m, _t, id: string) => id.replace(/-/g, " "));
}

export function ConstellationView({ data, onJump }: Props) {
  const [edgeMode, setEdgeMode] = useState<"all" | "inheritance">("all");
  const [visibleTypes, setVisibleTypes] = useState<Set<EntryType>>(
    () => new Set(TYPE_ORDER),
  );
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [drift, setDrift] = useState(true);
  const [labelDensity, setLabelDensity] = useState<"all" | "connected" | "focus">("all");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const dragRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const byId = useMemo(() => {
    const map = new Map<string, DumpEntry>();
    for (const e of data.entries) {
      map.set(`${e.type}/${e.id}`, e);
    }
    return map;
  }, [data.entries]);

  const typeCounts = useMemo(() => {
    const counts = new Map<EntryType, number>();
    for (const t of TYPE_ORDER) counts.set(t, 0);
    for (const e of data.entries) {
      counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
    }
    return counts;
  }, [data.entries]);

  const graph = useMemo(() => {
    const filtered = data.entries
      .filter((e) => visibleTypes.has(e.type))
      .sort((a, b) => {
        const ti = TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type);
        if (ti !== 0) return ti;
        return a.name.localeCompare(b.name);
      });

    const nodeMap = new Map<string, StarNode>();
    const rings = [135, 228, 318];
    const total = filtered.length;

    filtered.forEach((entry, idx) => {
      const id = `${entry.type}/${entry.id}`;
      const ringIdx = idx % rings.length;
      const radius =
        total <= 1
          ? 0
          : total <= 6
            ? 180
            : rings[ringIdx]! + ((idx % 2 === 0 ? -1 : 1) * 14);
      const angle =
        total <= 1
          ? 0
          : (idx / total) * Math.PI * 2 - Math.PI / 2 + ringIdx * 0.12;
      const x = 400 + Math.cos(angle) * radius;
      const y = 400 + Math.sin(angle) * radius;
      nodeMap.set(id, {
        id,
        entry,
        x,
        y,
        color: TYPE_COLOR[entry.type] ?? "#a78bfa",
        ring: radius,
      });
    });

    const edges: StarEdge[] = [];
    const seenEdge = new Set<string>();

    const pushEdge = (from: string, to: string, kind: "echo" | "inherits") => {
      if (from === to) return;
      if (!nodeMap.has(from) || !nodeMap.has(to)) return;
      const sig = `${kind}:${from}->${to}`;
      if (seenEdge.has(sig)) return;
      seenEdge.add(sig);
      edges.push({ id: sig, from, to, kind });
    };

    for (const node of nodeMap.values()) {
      const { entry, id: fromId } = node;
      for (const rawParent of entry.inherits) {
        const cleaned = rawParent.replace(/^@/, "");
        const normalized = cleaned.includes("/")
          ? cleaned
          : byId.has(`sigil/${cleaned}`)
            ? `sigil/${cleaned}`
            : `${entry.type}/${cleaned}`;
        if (byId.has(normalized)) {
          pushEdge(fromId, normalized, "inherits");
        }
      }
      if (edgeMode === "all" && entry.body) {
        const re = new RegExp(REF_REGEX.source, "g");
        let match: RegExpExecArray | null;
        while ((match = re.exec(entry.body))) {
          const type =
            match[1] !== undefined
              ? canonicalType(match[2]!)
              : canonicalType(match[5]!);
          const id = match[1] !== undefined ? match[3]! : match[6]!;
          const target = `${type}/${id}`;
          if (byId.has(target)) {
            pushEdge(fromId, target, "echo");
          }
        }
      }
    }

    return {
      nodes: Array.from(nodeMap.values()),
      nodeMap,
      edges,
    };
  }, [data.entries, visibleTypes, edgeMode, byId]);

  const activeId = hoveredId ?? pinnedId;
  const inspectedId = pinnedId ?? hoveredId;
  const inspectedNode = inspectedId
    ? graph.nodeMap.get(inspectedId) ?? null
    : null;

  const connectedToActive = useMemo(() => {
    const ids = new Set<string>();
    if (!activeId) return ids;
    ids.add(activeId);
    for (const e of graph.edges) {
      if (e.from === activeId) ids.add(e.to);
      if (e.to === activeId) ids.add(e.from);
    }
    return ids;
  }, [activeId, graph.edges]);

  const inspectorConnections = useMemo(() => {
    if (!inspectedNode) return [];
    const seen = new Set<string>();
    const list: Array<{ node: StarNode; kind: "echo" | "inherits"; dir: "out" | "in" }> = [];
    for (const edge of graph.edges) {
      if (edge.from === inspectedNode.id) {
        const target = graph.nodeMap.get(edge.to);
        if (target && !seen.has(`${edge.kind}:${target.id}`)) {
          seen.add(`${edge.kind}:${target.id}`);
          list.push({ node: target, kind: edge.kind, dir: "out" });
        }
      } else if (edge.to === inspectedNode.id) {
        const source = graph.nodeMap.get(edge.from);
        if (source && !seen.has(`${edge.kind}:${source.id}`)) {
          seen.add(`${edge.kind}:${source.id}`);
          list.push({ node: source, kind: edge.kind, dir: "in" });
        }
      }
    }
    return list;
  }, [inspectedNode, graph.edges, graph.nodeMap]);

  function toggleType(type: EntryType) {
    setVisibleTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        if (next.size === 1) return prev; // Keep at least one starlight class visible.
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }

  function adjustZoom(delta: number) {
    setZoom((z) => Math.min(2.5, Math.max(0.6, Number((z + delta).toFixed(2)))));
  }

  function resetViewport() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  if (data.entries.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center animate-panel-enter">
        <div className="panel-glass max-w-md p-8 space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Sparkles className="h-6 w-6" />
          </div>
          <h3 className="text-base font-semibold text-foreground">
            Empty Starfield
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Create entries in the Codex and weave <code className="font-mono text-primary">@type/id</code>{" "}
            echoes between them to illuminate the Constellation.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden animate-panel-enter">
      {/* Sleek Glassmorphic Header */}
      <header className="shrink-0 border-b border-border/70 bg-card/40 backdrop-blur-md px-5 py-3 flex flex-wrap items-center justify-between gap-3 z-10">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary shadow-sm">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-foreground">
                Constellation
              </h2>
              <p className="text-[11px] text-muted-foreground">
                {graph.nodes.length} stars · {graph.edges.length} celestial ties
              </p>
            </div>
          </div>

          <div className="h-5 w-px bg-border/60 hidden sm:block" />

          {/* Mode Toggle Pills */}
          <div className="inline-flex items-center rounded-xl border border-border/70 bg-card/45 p-0.5 backdrop-blur-sm">
            <button
              type="button"
              onClick={() => setEdgeMode("all")}
              className={cn(
                "px-3 py-1 rounded-lg text-xs font-medium transition-all",
                edgeMode === "all"
                  ? "active-theme-pill"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Echoes &amp; Lineage
            </button>
            <button
              type="button"
              onClick={() => setEdgeMode("inheritance")}
              className={cn(
                "px-3 py-1 rounded-lg text-xs font-medium transition-all",
                edgeMode === "inheritance"
                  ? "active-theme-pill"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Inheritance Only
            </button>
          </div>
        </div>

        {/* Filter Pills + Viewport Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-1">
            {TYPE_ORDER.map((type) => {
              const count = typeCounts.get(type) ?? 0;
              if (count === 0) return null;
              const active = visibleTypes.has(type);
              const color = TYPE_COLOR[type];
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => toggleType(type)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium capitalize transition-all interactive-lift",
                    active
                      ? "border-border/80 bg-card/75 text-foreground"
                      : "border-border/40 bg-card/25 text-muted-foreground/50 opacity-60",
                  )}
                  title={active ? `Hide ${type} stars` : `Show ${type} stars`}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{
                      backgroundColor: color,
                      boxShadow: active ? `0 0 8px ${color}` : undefined,
                    }}
                  />
                  <span>{type}</span>
                </button>
              );
            })}
            {visibleTypes.size < TYPE_ORDER.length && (
              <button
                type="button"
                onClick={() => setVisibleTypes(new Set(TYPE_ORDER))}
                className="rounded-full border border-border/60 bg-card/50 px-2 py-0.5 text-[10px] text-primary hover:border-primary/50"
              >
                All
              </button>
            )}
          </div>

          <div className="h-5 w-px bg-border/60 hidden md:block" />

          {/* Drift & Zoom Bar */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setDrift((d) => !d)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-all interactive-lift",
                drift
                  ? "border-primary/45 bg-primary/15 text-primary"
                  : "border-border/60 bg-card/50 text-muted-foreground hover:text-foreground",
              )}
              title="Toggle subtle astrolabe orbital drift"
            >
              <Orbit className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Drift</span>
            </button>

            <button
              type="button"
              onClick={() =>
                setLabelDensity((d) =>
                  d === "all" ? "connected" : d === "connected" ? "focus" : "all",
                )
              }
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-all interactive-lift",
                labelDensity !== "all"
                  ? "border-primary/45 bg-primary/15 text-primary"
                  : "border-border/60 bg-card/50 text-muted-foreground hover:text-foreground",
              )}
              title="Cycle label visibility: All, Connected only, or Focused only"
            >
              <Tag className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">
                Labels: {labelDensity === "all" ? "All" : labelDensity === "connected" ? "Connected" : "Focused"}
              </span>
            </button>

            <div className="inline-flex items-center rounded-lg border border-border/70 bg-card/50 p-0.5">
              <button
                type="button"
                onClick={() => adjustZoom(-0.2)}
                className="p-1 text-muted-foreground hover:text-foreground rounded"
                aria-label="Zoom out"
                title="Zoom out"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="px-1.5 text-[10px] font-mono text-muted-foreground min-w-[36px] text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => adjustZoom(0.2)}
                className="p-1 text-muted-foreground hover:text-foreground rounded"
                aria-label="Zoom in"
                title="Zoom in"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={resetViewport}
                className="p-1 text-muted-foreground hover:text-foreground rounded border-l border-border/50 ml-0.5"
                aria-label="Reset star-map view"
                title="Reset zoom and pan"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Celestial Astrolabe Interactive Viewport */}
      <div className="relative flex-1 overflow-hidden">
        <svg
          viewBox="0 0 800 800"
          className={cn(
            "h-full w-full select-none",
            isDragging ? "cursor-grabbing" : "cursor-grab",
          )}
          onWheel={(e) => {
            e.preventDefault();
            const step = e.deltaY < 0 ? 0.12 : -0.12;
            adjustZoom(step);
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
            if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
              drag.moved = true;
            }
            setPan({
              x: drag.origX + dx / zoom,
              y: drag.origY + dy / zoom,
            });
          }}
          onMouseUp={() => {
            const drag = dragRef.current;
            dragRef.current = null;
            setIsDragging(false);
            if (drag && !drag.moved) {
              setPinnedId(null);
            }
          }}
          onMouseLeave={() => {
            dragRef.current = null;
            setIsDragging(false);
          }}
        >
          <defs>
            <radialGradient id="lw-constellation-nebula" cx="50%" cy="50%" r="55%">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.18" />
              <stop offset="45%" stopColor="hsl(var(--ring))" stopOpacity="0.08" />
              <stop offset="100%" stopColor="hsl(var(--background))" stopOpacity="0" />
            </radialGradient>

            <linearGradient id="lw-edge-active" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.95" />
              <stop offset="100%" stopColor="hsl(var(--ring))" stopOpacity="0.95" />
            </linearGradient>

            <filter id="lw-star-bloom" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="4.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Pan & Zoom Transform Group */}
          <g
            transform={`translate(${400 + pan.x} ${400 + pan.y}) scale(${zoom}) translate(-400 -400)`}
          >
            {/* Central Celestial Nebula Glow */}
            <circle cx="400" cy="400" r="380" fill="url(#lw-constellation-nebula)" />

            {/* Outer Counter-Rotating Astrolabe Degree Ring */}
            <g
              className={drift ? "animate-spin-slow-reverse" : undefined}
              style={{ transformOrigin: "400px 400px" }}
            >
              <circle cx="400" cy="400" r="365" fill="none" stroke="none" />
              <circle
                cx="400"
                cy="400"
                r="356"
                fill="none"
                stroke="hsl(var(--border))"
                strokeOpacity="0.35"
                strokeWidth="1"
                strokeDasharray="2 10"
              />
              {Array.from({ length: 24 }, (_, i) => {
                const rad = (i / 24) * Math.PI * 2;
                const r1 = i % 6 === 0 ? 344 : 350;
                const r2 = 358;
                return (
                  <line
                    key={i}
                    x1={400 + Math.cos(rad) * r1}
                    y1={400 + Math.sin(rad) * r1}
                    x2={400 + Math.cos(rad) * r2}
                    y2={400 + Math.sin(rad) * r2}
                    stroke="hsl(var(--primary))"
                    strokeOpacity={i % 6 === 0 ? "0.45" : "0.18"}
                    strokeWidth={i % 6 === 0 ? "1.5" : "1"}
                  />
                );
              })}
            </g>

            {/* Inner Rotating Concentric Orbital Rings */}
            <g
              className={drift ? "animate-spin-slow" : undefined}
              style={{ transformOrigin: "400px 400px" }}
            >
              <circle cx="400" cy="400" r="365" fill="none" stroke="none" />
              {[135, 228, 318].map((r, i) => (
                <circle
                  key={r}
                  cx="400"
                  cy="400"
                  r={r}
                  fill="none"
                  stroke="hsl(var(--border))"
                  strokeOpacity={0.32 - i * 0.05}
                  strokeWidth="1"
                  strokeDasharray={i === 1 ? "6 6" : "3 9"}
                />
              ))}
              <line
                x1="40"
                y1="400"
                x2="760"
                y2="400"
                stroke="hsl(var(--border))"
                strokeOpacity="0.16"
                strokeDasharray="4 8"
              />
              <line
                x1="400"
                y1="40"
                x2="400"
                y2="760"
                stroke="hsl(var(--border))"
                strokeOpacity="0.16"
                strokeDasharray="4 8"
              />
            </g>

            {/* Center Astrolabe Core Sigil */}
            <circle
              cx="400"
              cy="400"
              r="5"
              fill="hsl(var(--primary))"
              fillOpacity="0.35"
              filter="url(#lw-star-bloom)"
            />

            {/* Curved Quadratic Bezier Starlight Edges */}
            {graph.edges.map((edge, idx) => {
              const fromNode = graph.nodeMap.get(edge.from);
              const toNode = graph.nodeMap.get(edge.to);
              if (!fromNode || !toNode) return null;

              const midX = (fromNode.x + toNode.x) / 2;
              const midY = (fromNode.y + toNode.y) / 2;
              // Bow arcs gently toward the astrolabe center (400, 400) for clean separation.
              const bend = edge.kind === "inherits" ? 0.28 : 0.2;
              const alt = idx % 2 === 0 ? 1 : -1;
              const ctrlX = midX * (1 - bend) + 400 * bend + alt * 6;
              const ctrlY = midY * (1 - bend) + 400 * bend - alt * 6;
              const d = `M ${fromNode.x.toFixed(1)} ${fromNode.y.toFixed(1)} Q ${ctrlX.toFixed(1)} ${ctrlY.toFixed(1)} ${toNode.x.toFixed(1)} ${toNode.y.toFixed(1)}`;

              const isHighlighted =
                activeId !== null &&
                (edge.from === activeId || edge.to === activeId);
              const isDimmed = activeId !== null && !isHighlighted;

              return (
                <g key={edge.id}>
                  <path
                    d={d}
                    fill="none"
                    stroke={
                      isHighlighted
                        ? "url(#lw-edge-active)"
                        : edge.kind === "inherits"
                          ? "hsl(var(--primary))"
                          : "hsl(var(--muted-foreground))"
                    }
                    strokeOpacity={
                      isHighlighted ? 0.85 : isDimmed ? 0.08 : edge.kind === "inherits" ? 0.42 : 0.25
                    }
                    strokeWidth={isHighlighted ? 2.2 : edge.kind === "inherits" ? 1.4 : 1.05}
                    strokeDasharray={
                      isHighlighted
                        ? "8 6"
                        : edge.kind === "inherits"
                          ? undefined
                          : "3 4"
                    }
                    className={isHighlighted ? "animate-stream-flow" : undefined}
                    filter={isHighlighted ? "url(#lw-star-bloom)" : undefined}
                  />
                </g>
              );
            })}

            {/* Luminous Star Nodes */}
            {graph.nodes.map((node) => {
              const isFocused = activeId === node.id || pinnedId === node.id;
              const isNeighbor = connectedToActive.has(node.id);
              const isDimmed = activeId !== null && !isNeighbor;

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x.toFixed(1)}, ${node.y.toFixed(1)})`}
                  role="button"
                  tabIndex={0}
                  data-sound="hover"
                  aria-label={`${node.entry.name} (${node.entry.type})`}
                  className="cursor-pointer focus:outline-none"
                  style={{ opacity: isDimmed ? 0.28 : 1, transition: "opacity 200ms ease" }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onMouseEnter={() => setHoveredId(node.id)}
                  onMouseLeave={() =>
                    setHoveredId((prev) => (prev === node.id ? null : prev))
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    setPinnedId((prev) => (prev === node.id ? null : node.id));
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    onJump({ kind: "entry", key: node.id });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      onJump({ kind: "entry", key: node.id });
                    } else if (e.key === " ") {
                      e.preventDefault();
                      setPinnedId(node.id);
                    }
                  }}
                >
                  {/* Invisible hit target radius for comfortable clicking */}
                  <circle r="18" fill="transparent" />

                  {/* Outer Aura */}
                  <circle
                    r={isFocused ? 18 : 11}
                    fill={node.color}
                    fillOpacity={isFocused ? 0.26 : 0.13}
                    filter="url(#lw-star-bloom)"
                  />

                  {/* Active Rotating Orbital Ring */}
                  {isFocused && (
                    <circle
                      r="14"
                      fill="none"
                      stroke={node.color}
                      strokeOpacity="0.85"
                      strokeWidth="1.2"
                      strokeDasharray="4 4"
                      className="animate-spin-slow"
                    />
                  )}

                  {/* Star Core + Specular Center */}
                  <circle
                    r={isFocused ? 6.5 : 4.5}
                    fill={node.color}
                    filter="url(#lw-star-bloom)"
                  />
                  <circle
                    r={isFocused ? 2.4 : 1.5}
                    fill="#ffffff"
                    fillOpacity="0.95"
                  />

                  {/* Soft, readable label with clean contrast */}
                  {(isFocused ||
                    (labelDensity === "focus"
                      ? false
                      : labelDensity === "connected"
                        ? isNeighbor
                        : zoom >= 0.72 || isNeighbor)) && (
                    isFocused ? (
                      <g className="pointer-events-none select-none">
                        <rect
                          x={(-Math.max(40, node.entry.name.length * 6.6 + 14) / 2).toFixed(1)}
                          y="13"
                          width={Math.max(40, node.entry.name.length * 6.6 + 14).toFixed(1)}
                          height="18"
                          rx="5"
                          className="fill-card/95"
                          stroke={node.color}
                          strokeOpacity="0.65"
                          style={{
                            strokeWidth: "1.2px",
                            filter: "drop-shadow(0 2px 8px hsl(var(--background) / 0.8))",
                          }}
                        />
                        <text
                          y="25.5"
                          textAnchor="middle"
                          fill="hsl(var(--foreground))"
                          fontSize="11"
                          fontWeight="600"
                          className="select-none"
                        >
                          {node.entry.name}
                        </text>
                      </g>
                    ) : (
                      <text
                        y={19}
                        textAnchor="middle"
                        fill={isNeighbor ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))"}
                        fillOpacity={isNeighbor ? 0.95 : 0.72}
                        fontSize={10.5}
                        fontWeight={isNeighbor ? 500 : 400}
                        className="select-none"
                        style={{
                          paintOrder: "stroke",
                          stroke: "hsl(var(--background) / 0.85)",
                          strokeWidth: "1.5px",
                          strokeLinejoin: "round",
                          filter: "drop-shadow(0 1px 2px hsl(var(--background) / 0.6))",
                        }}
                      >
                        {node.entry.name}
                      </text>
                    )
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        {/* Bottom-Left Subtle Navigation Hint */}
        <div className="pointer-events-none absolute bottom-4 left-4 hidden sm:flex items-center gap-2 rounded-full border border-border/50 bg-card/55 backdrop-blur-md px-3 py-1.5 text-[11px] text-muted-foreground">
          <Compass className="h-3.5 w-3.5 text-primary/80" />
          <span>Drag to pan · Scroll to zoom · Click star to inspect · Double-click to open</span>
        </div>

        {/* Floating Glassmorphic Star Inspector HUD Card */}
        {inspectedNode && (
          <aside className="absolute bottom-4 right-4 z-20 w-80 max-w-[calc(100%-2rem)] panel-glass p-4 shadow-2xl animate-panel-enter space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize border border-border/60 bg-card/70 text-foreground"
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{
                        backgroundColor: inspectedNode.color,
                        boxShadow: `0 0 8px ${inspectedNode.color}`,
                      }}
                    />
                    {inspectedNode.entry.type}
                  </span>
                  {inspectedNode.entry.status && (
                    <span className="rounded-full border border-border/60 bg-card/60 px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
                      {inspectedNode.entry.status}
                    </span>
                  )}
                </div>
                <h3 className="text-sm font-semibold text-foreground truncate">
                  {inspectedNode.entry.name}
                </h3>
              </div>

              {pinnedId === inspectedNode.id && (
                <button
                  type="button"
                  onClick={() => setPinnedId(null)}
                  className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-card/60"
                  aria-label="Close star inspector"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {summarizeBody(inspectedNode.entry.body) && (
              <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                {summarizeBody(inspectedNode.entry.body)}
              </p>
            )}

            <div className="space-y-1.5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Celestial Ties ({inspectorConnections.length})
              </div>
              {inspectorConnections.length === 0 ? (
                <p className="text-[11px] text-muted-foreground/70">
                  No direct echoes or lineage links in current filter.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pr-0.5">
                  {inspectorConnections.slice(0, 10).map((conn, idx) => (
                    <button
                      key={`${conn.kind}:${conn.node.id}:${idx}`}
                      type="button"
                      onClick={() => setPinnedId(conn.node.id)}
                      className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-card/65 px-2 py-0.5 text-[11px] text-foreground hover:border-primary/50 transition-colors"
                      title={`${conn.kind === "inherits" ? "Lineage" : "Echo"} (${conn.dir})`}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: conn.node.color }}
                      />
                      <span className="truncate max-w-[120px]">
                        {conn.node.entry.name}
                      </span>
                    </button>
                  ))}
                  {inspectorConnections.length > 10 && (
                    <span className="text-[10px] text-muted-foreground self-center px-1">
                      +{inspectorConnections.length - 10} more
                    </span>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => onJump({ kind: "entry", key: inspectedNode.id })}
              className="active-theme-pill interactive-lift w-full inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium"
            >
              Open in Codex
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </aside>
        )}
      </div>
    </div>
  );
}
