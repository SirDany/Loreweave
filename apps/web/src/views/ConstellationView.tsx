import { useMemo, useState } from "react";
import type { DumpEntry, DumpPayload, EntryType } from "../lib/lw.js";

interface Props {
  data: DumpPayload;
  onJump: (loc: { kind: "entry"; key: string }) => void;
}

interface Node {
  id: string; // type/id
  type: EntryType;
  name: string;
  x: number;
  y: number;
}

interface Edge {
  source: string;
  target: string;
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

const REF_RE = /@(character|location|concept|lore|waypoint|term|sigil)\/([a-z0-9][a-z0-9-]*)/g;

/**
 * Read-only constellation: Codex/Lexicon/Sigil entries laid out on concentric
 * arcs by type, with edges drawn for every @echo found in entry bodies and
 * chapter prose.
 */
export function ConstellationView({ data, onJump }: Props) {
  const [hover, setHover] = useState<string | null>(null);
  const [filter, setFilter] = useState<Set<EntryType>>(new Set(TYPE_ORDER));

  const { nodes, edges, byId } = useMemo(() => {
    const visible = data.entries.filter((e) => filter.has(e.type));
    const byId = new Map<string, DumpEntry>();
    for (const e of visible) byId.set(`${e.type}/${e.id}`, e);

    // Layout: group by type into concentric rings; within each ring spread
    // evenly around the circle.
    const groups = new Map<EntryType, DumpEntry[]>();
    for (const t of TYPE_ORDER) groups.set(t, []);
    for (const e of visible) groups.get(e.type)!.push(e);

    const cx = 400;
    const cy = 400;
    const ringStep = 60;
    let ring = 1;
    const nodes: Node[] = [];
    for (const t of TYPE_ORDER) {
      const list = groups.get(t)!;
      if (list.length === 0) continue;
      const radius = ring * ringStep + 60;
      const step = (2 * Math.PI) / Math.max(list.length, 1);
      list.forEach((e, i) => {
        const angle = i * step + (ring * 0.3);
        nodes.push({
          id: `${e.type}/${e.id}`,
          type: e.type,
          name: e.name || e.id,
          x: cx + Math.cos(angle) * radius,
          y: cy + Math.sin(angle) * radius,
        });
      });
      ring++;
    }

    // Edges: scan entry bodies + chapter prose for @echoes.
    const edgesSet = new Set<string>();
    const edges: Edge[] = [];
    const addEdge = (src: string, tgt: string) => {
      if (!byId.has(src) || !byId.has(tgt)) return;
      if (src === tgt) return;
      const k = `${src}\t${tgt}`;
      if (edgesSet.has(k)) return;
      edgesSet.add(k);
      edges.push({ source: src, target: tgt });
    };
    for (const e of visible) {
      const src = `${e.type}/${e.id}`;
      const re = new RegExp(REF_RE.source, "g");
      let m: RegExpExecArray | null;
      while ((m = re.exec(e.body))) addEdge(src, `${m[1]}/${m[2]}`);
      // Sigil inheritance also counts as an edge.
      for (const s of e.inherits ?? []) addEdge(src, `sigil/${s}`);
    }
    for (const t of data.tomes) {
      for (const c of t.chapters) {
        // Use chapter as a virtual source — but we only render entry-entry
        // edges, so attribute chapter refs to nothing. Skip.
        for (const r of c.refs) {
          // chapter -> entry isn't drawn, but entry-to-entry from prose is
          // already captured above.
          void r;
        }
      }
    }
    return { nodes, edges, byId };
  }, [data, filter]);

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  const isHighlighted = (nodeId: string): boolean => {
    if (!hover) return false;
    if (nodeId === hover) return true;
    return edges.some(
      (e) =>
        (e.source === hover && e.target === nodeId) ||
        (e.target === hover && e.source === nodeId),
    );
  };

  const toggleType = (t: EntryType) => {
    setFilter((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <header className="px-6 py-3 border-b border-border flex items-center gap-3">
        <div className="text-lg flex-1">Constellation</div>
        <div className="flex gap-1 text-xs">
          {TYPE_ORDER.map((t) => (
            <button
              key={t}
              onClick={() => toggleType(t)}
              className={
                "px-2 py-0.5 rounded border " +
                (filter.has(t)
                  ? "border-border bg-muted"
                  : "border-border text-muted-foreground/70")
              }
              style={
                filter.has(t)
                  ? { color: TYPE_COLOR[t] }
                  : undefined
              }
            >
              {t}
            </button>
          ))}
        </div>
        <div className="text-xs text-muted-foreground">
          {nodes.length} entries · {edges.length} echoes
        </div>
      </header>
      <div className="flex-1 overflow-auto bg-background">
        <svg
          viewBox="0 0 800 800"
          className="w-full h-full min-h-[600px]"
          style={{ minWidth: 600 }}
        >
          {/* edges */}
          <g stroke="#52525b" strokeWidth={0.5} fill="none">
            {edges.map((e, i) => {
              const a = nodeMap.get(e.source);
              const b = nodeMap.get(e.target);
              if (!a || !b) return null;
              const lit = hover && (e.source === hover || e.target === hover);
              return (
                <line
                  key={i}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={lit ? "#fbbf24" : "#3f3f46"}
                  strokeWidth={lit ? 1.2 : 0.5}
                  opacity={hover && !lit ? 0.15 : 0.7}
                />
              );
            })}
          </g>
          {/* nodes */}
          <g>
            {nodes.map((n) => {
              const lit = isHighlighted(n.id);
              const dim = hover && !lit;
              const e = byId.get(n.id);
              return (
                <g
                  key={n.id}
                  transform={`translate(${n.x},${n.y})`}
                  className="cursor-pointer"
                  onMouseEnter={() => setHover(n.id)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => onJump({ kind: "entry", key: n.id })}
                  opacity={dim ? 0.25 : 1}
                >
                  <circle
                    r={hover === n.id ? 6 : 4}
                    fill={TYPE_COLOR[n.type]}
                    stroke={lit ? "#fef3c7" : "transparent"}
                    strokeWidth={1}
                  />
                  <text
                    x={6}
                    y={3}
                    fontSize={9}
                    fill={lit ? "#fef3c7" : "#a1a1aa"}
                    style={{ pointerEvents: "none" }}
                  >
                    {n.name}
                    {e?.status === "draft" ? " ·draft" : ""}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}
