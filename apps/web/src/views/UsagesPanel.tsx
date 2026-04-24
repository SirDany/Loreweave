import type { DumpEntry, DumpPayload } from "../lib/lw.js";

interface Props {
  entry: DumpEntry;
  data: DumpPayload;
  onJump?: (location: { kind: "entry" | "chapter"; key: string; line?: number }) => void;
}

interface Hit {
  from: string;
  kind: "entry" | "chapter";
  key: string;
  line: number;
  snippet: string;
}

const REF_RE = /@([a-zA-Z]+)\/([a-zA-Z0-9\-_]+)/g;

function scanFor(
  type: string,
  id: string,
  sources: Array<{ key: string; kind: "entry" | "chapter"; label: string; body: string }>,
): Hit[] {
  const needle = `${type}/${id}`;
  const hits: Hit[] = [];
  for (const src of sources) {
    const lines = src.body.split("\n");
    lines.forEach((line, i) => {
      for (const m of line.matchAll(REF_RE)) {
        if (`${m[1]}/${m[2]}` === needle) {
          hits.push({
            from: src.label,
            kind: src.kind,
            key: src.key,
            line: i + 1,
            snippet: line.trim(),
          });
        }
      }
    });
  }
  return hits;
}

function outboundOf(entry: DumpEntry): Array<{ type: string; id: string; line: number }> {
  const out: Array<{ type: string; id: string; line: number }> = [];
  entry.body.split("\n").forEach((line, i) => {
    for (const m of line.matchAll(REF_RE)) {
      const type = m[1];
      const id = m[2];
      if (!type || !id) continue;
      out.push({ type, id, line: i + 1 });
    }
  });
  return out;
}

export function UsagesPanel({ entry, data, onJump }: Props) {
  const sources: Array<{ key: string; kind: "entry" | "chapter"; label: string; body: string }> = [];
  for (const e of data.entries) {
    if (e.type === entry.type && e.id === entry.id) continue;
    sources.push({
      key: `${e.type}/${e.id}`,
      kind: "entry",
      label: `${e.type}/${e.id}`,
      body: e.body,
    });
  }
  for (const t of data.tomes) {
    for (const c of t.chapters) {
      sources.push({
        key: `${t.id}::${c.slug}`,
        kind: "chapter",
        label: `${t.title} — ${c.title}`,
        body: c.body,
      });
    }
  }

  const inbound = scanFor(entry.type, entry.id, sources);
  const outbound = outboundOf(entry);

  return (
    <div className="space-y-4">
      <section>
        <div className="text-xs uppercase tracking-widest text-stone-500 mb-1">
          mentioned in ({inbound.length})
        </div>
        {inbound.length === 0 && (
          <div className="text-xs text-stone-500 italic">no mentions yet</div>
        )}
        <ul className="space-y-1 text-sm">
          {inbound.map((h, i) => (
            <li key={i}>
              <button
                className="text-left w-full hover:bg-stone-800/60 rounded px-1 py-0.5"
                onClick={() =>
                  onJump?.({ kind: h.kind, key: h.key, line: h.line })
                }
              >
                <div className="font-mono text-xs text-amber-300">
                  {h.from}:{h.line}
                </div>
                <div className="text-stone-400 text-xs truncate">
                  {h.snippet || "—"}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <div className="text-xs uppercase tracking-widest text-stone-500 mb-1">
          references from this entry ({outbound.length})
        </div>
        {outbound.length === 0 && (
          <div className="text-xs text-stone-500 italic">none</div>
        )}
        <ul className="space-y-0.5 text-sm font-mono">
          {outbound.map((o, i) => (
            <li key={i}>
              <button
                className="text-cyan-300 hover:underline"
                onClick={() =>
                  onJump?.({ kind: "entry", key: `${o.type}/${o.id}` })
                }
              >
                @{o.type}/{o.id}
              </button>
              <span className="text-stone-500 text-xs"> :{o.line}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
