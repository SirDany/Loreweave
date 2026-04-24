import { useEffect, useState, type ReactNode } from "react";
import type { DumpEntry } from "../lib/lw.js";
import { entryDiff } from "../lib/lw.js";

type Tab = "resolved" | "usages" | "traces" | "diff";

interface Props {
  entry: DumpEntry | null;
  sagaPath?: string;
  usagesContent?: ReactNode;
  tracesContent?: ReactNode;
  tracesCount?: number;
  usagesCount?: number;
}

function provenanceBadge(prov: string | undefined) {
  if (!prov) return null;
  if (prov === "own") {
    return (
      <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-900/60 text-emerald-200">
        own
      </span>
    );
  }
  if (prov === "override") {
    return (
      <span className="text-xs px-1.5 py-0.5 rounded bg-rose-900/60 text-rose-200">
        override
      </span>
    );
  }
  if (prov.startsWith("sigil:") || prov.startsWith("tag:")) {
    return (
      <span className="text-xs px-1.5 py-0.5 rounded bg-sky-900/60 text-sky-200">
        {prov}
      </span>
    );
  }
  return (
    <span className="text-xs px-1.5 py-0.5 rounded bg-stone-700 text-stone-200">
      {prov}
    </span>
  );
}

function renderValue(v: unknown): string {
  if (v === null) return "null";
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

export function ResolvedPanel({
  entry,
  sagaPath,
  usagesContent,
  tracesContent,
  tracesCount = 0,
  usagesCount = 0,
}: Props) {
  const [tab, setTab] = useState<Tab>("resolved");
  if (!entry) {
    return (
      <aside className="w-80 bg-card/40 border-l border-border p-6 text-muted-foreground text-sm">
        <div className="label-rune mb-2">Inspector</div>
        Select an entry to see its Weave, Echoes, and Traces.
      </aside>
    );
  }
  const keys = Object.keys(entry.properties).sort();
  return (
    <aside className="w-80 bg-card/40 border-l border-border flex flex-col">
      <div className="px-4 pt-4 pb-3 border-b border-border">
        <div className="label-rune">{entry.type}</div>
        <div className="mt-1 font-serif text-lg text-foreground">{entry.name}</div>
        <div className="font-mono text-[11px] text-muted-foreground">
          {entry.type}/{entry.id}
        </div>
        {entry.appears_in && entry.appears_in.length > 0 && (
          <div className="mt-1 text-[11px] text-primary/80">
            appears in: {entry.appears_in.join(", ")}
          </div>
        )}
      </div>
      <nav className="flex text-xs border-b border-border">
        <TabButton
          active={tab === "resolved"}
          onClick={() => setTab("resolved")}
          label="Weave"
        />
        <TabButton
          active={tab === "usages"}
          onClick={() => setTab("usages")}
          label={`Echoes${usagesCount ? ` (${usagesCount})` : ""}`}
        />
        <TabButton
          active={tab === "traces"}
          onClick={() => setTab("traces")}
          label={`Traces${tracesCount ? ` (${tracesCount})` : ""}`}
        />
        <TabButton
          active={tab === "diff"}
          onClick={() => setTab("diff")}
          label="Diff"
        />
      </nav>
      <div className="flex-1 overflow-auto scrollbar-ember p-4">
        {tab === "resolved" && (
          <ResolvedTab entry={entry} keys={keys} />
        )}
        {tab === "usages" && (
          <div>{usagesContent ?? <div className="text-xs text-muted-foreground italic">no data</div>}</div>
        )}
        {tab === "traces" && (
          <div>{tracesContent ?? <div className="text-xs text-muted-foreground italic">no traces</div>}</div>
        )}
        {tab === "diff" && (
          <DiffTab entry={entry} sagaPath={sagaPath} />
        )}
      </div>
    </aside>
  );
}

function DiffTab({ entry, sagaPath }: { entry: DumpEntry; sagaPath?: string }) {
  const [patch, setPatch] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!sagaPath) return;
    setLoading(true);
    setErr(null);
    setPatch(null);
    entryDiff(sagaPath, `${entry.type}/${entry.id}`)
      .then((r) => setPatch(r.patch))
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, [sagaPath, entry.type, entry.id]);
  if (!sagaPath) return <div className="text-xs text-stone-500">no saga path</div>;
  if (loading) return <div className="text-xs text-stone-500">loading…</div>;
  if (err)
    return (
      <div className="text-xs text-rose-400 whitespace-pre-wrap">
        {err.includes("not a git repository")
          ? "This Saga isn't a git repo yet. Initialize it from the Versions panel."
          : err}
      </div>
    );
  if (!patch || !patch.trim())
    return <div className="text-xs text-stone-500">no changes against HEAD</div>;
  return <pre className="text-[11px] font-mono whitespace-pre-wrap">{colorize(patch)}</pre>;
}

function colorize(patch: string): ReactNode[] {
  return patch.split("\n").map((line, i) => {
    let cls = "text-stone-400";
    if (line.startsWith("+++") || line.startsWith("---")) cls = "text-stone-500";
    else if (line.startsWith("+")) cls = "text-emerald-300";
    else if (line.startsWith("-")) cls = "text-rose-300";
    else if (line.startsWith("@@")) cls = "text-cyan-400";
    return (
      <div key={i} className={cls}>
        {line || "\u00a0"}
      </div>
    );
  });
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "flex-1 px-3 py-2 uppercase tracking-widest transition-colors " +
        (active
          ? "bg-accent text-accent-foreground border-b-2 border-primary"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/60")
      }
    >
      {label}
    </button>
  );
}

function ResolvedTab({
  entry,
  keys,
}: {
  entry: DumpEntry;
  keys: string[];
}) {
  return (
    <div>
      {entry.inheritsChain.length > 0 && (
        <div className="text-xs text-stone-400 mb-3">
          inherits: {entry.inheritsChain.join(" → ")}
        </div>
      )}
      <div className="space-y-1.5">
        {keys.length === 0 && (
          <div className="text-sm text-stone-500 italic">no properties</div>
        )}
        {keys.map((k) => (
          <div key={k} className="text-sm">
            <div className="flex items-center gap-2">
              <span className="font-mono text-stone-300">{k}</span>
              {provenanceBadge(entry.provenance[k])}
            </div>
            <div className="font-mono text-xs text-amber-200/90 pl-2 break-all">
              {renderValue(entry.properties[k])}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
