import { useEffect, useMemo, useRef, useState } from "react";
import { search, type SearchHit, type SearchResult, type SearchScope } from "../lib/lw.js";

interface Props {
  sagaPath: string;
  onClose: () => void;
  onJump: (loc: { kind: "entry" | "chapter"; key: string; line?: number }) => void;
}

const SCOPES: Array<{ id: SearchScope; label: string; hint: string }> = [
  { id: "all", label: "All", hint: "entries + prose" },
  { id: "entries", label: "Entries", hint: "Codex / Lexicon / Sigils" },
  { id: "prose", label: "Prose", hint: "chapters + scenes" },
  { id: "echoes", label: "Echoes", hint: "@type/id references — query is a target" },
];

/**
 * Global search across a Saga. Plain text by default; switch the scope to
 * "Echoes" to find every occurrence of an `@type/id` reference (the query is
 * then treated as a ref target, e.g. `character/aaron`).
 *
 * Click any hit to jump into the entry or chapter (line number when available).
 */
export function SearchPanel({ sagaPath, onClose, onJump }: Props) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<SearchScope>("all");
  const [type, setType] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Debounced auto-search.
  useEffect(() => {
    if (!query.trim()) {
      setResult(null);
      return;
    }
    const handle = setTimeout(() => {
      setBusy(true);
      setErr(null);
      search(sagaPath, query, {
        scope,
        type: type.trim() || undefined,
        case: caseSensitive,
        limit: 200,
      })
        .then(setResult)
        .catch((e) => setErr((e as Error).message))
        .finally(() => setBusy(false));
    }, 220);
    return () => clearTimeout(handle);
  }, [sagaPath, query, scope, type, caseSensitive]);

  const grouped = useMemo(() => groupHits(result?.hits ?? []), [result]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center p-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-lg border border-stone-700 bg-stone-950 shadow-2xl flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-stone-800 space-y-3">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              placeholder="search…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 px-3 py-2 rounded bg-stone-900 border border-stone-700 text-stone-100 text-sm"
            />
            <button
              type="button"
              onClick={onClose}
              className="px-2 py-1 text-xs rounded border border-stone-700 hover:bg-stone-800"
            >
              Esc
            </button>
          </div>
          <div className="flex flex-wrap gap-2 items-center text-xs">
            {SCOPES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setScope(s.id)}
                className={
                  "px-2 py-1 rounded border " +
                  (scope === s.id
                    ? "border-amber-500 bg-amber-900/40 text-amber-100"
                    : "border-stone-700 hover:bg-stone-800")
                }
                title={s.hint}
              >
                {s.label}
              </button>
            ))}
            <input
              type="text"
              placeholder="type filter (character, term, …)"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="ml-2 flex-1 min-w-[120px] px-2 py-1 rounded bg-stone-900 border border-stone-700 text-stone-200"
            />
            <label className="flex items-center gap-1 text-stone-400">
              <input
                type="checkbox"
                checked={caseSensitive}
                onChange={(e) => setCaseSensitive(e.target.checked)}
              />
              case
            </label>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-3">
          {busy && <div className="text-xs text-stone-500 px-1">searching…</div>}
          {err && (
            <pre className="text-xs text-rose-400 whitespace-pre-wrap px-1">{err}</pre>
          )}
          {!busy && !err && result && result.hits.length === 0 && (
            <div className="text-xs text-stone-500 px-1">no matches</div>
          )}
          {!query.trim() && !busy && !err && (
            <div className="text-xs text-stone-500 px-1">
              start typing — Echoes scope treats the query as <code>type/id</code>.
            </div>
          )}
          {grouped.length > 0 && (
            <div className="space-y-3">
              {grouped.map((g) => (
                <div key={g.ref + ":" + g.kind} className="rounded border border-stone-800">
                  <button
                    type="button"
                    onClick={() => {
                      const first = g.hits[0]!;
                      jumpTo(first, onJump);
                      onClose();
                    }}
                    className="w-full text-left px-3 py-2 bg-stone-900/60 hover:bg-stone-900 border-b border-stone-800"
                  >
                    <span className="text-xs font-mono text-cyan-300">{g.ref}</span>{" "}
                    <span className="text-[10px] text-stone-500">
                      {g.kind} · {g.hits.length}{" "}
                      {g.hits.length === 1 ? "match" : "matches"}
                    </span>
                  </button>
                  <ul className="divide-y divide-stone-900">
                    {g.hits.slice(0, 8).map((h, i) => (
                      <li key={i}>
                        <button
                          type="button"
                          onClick={() => {
                            jumpTo(h, onJump);
                            onClose();
                          }}
                          className="w-full text-left px-3 py-1.5 hover:bg-stone-900/60 text-xs flex gap-3"
                        >
                          <span className="text-stone-500 font-mono w-12 shrink-0">
                            :{h.line}
                          </span>
                          <span className="text-stone-200 truncate">{h.preview}</span>
                        </button>
                      </li>
                    ))}
                    {g.hits.length > 8 && (
                      <li className="px-3 py-1 text-[11px] text-stone-500">
                        + {g.hits.length - 8} more
                      </li>
                    )}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
        {result && (
          <div className="px-4 py-2 border-t border-stone-800 text-[11px] text-stone-500">
            {result.hits.length} hit{result.hits.length === 1 ? "" : "s"} ·{" "}
            scope: {result.scope}
          </div>
        )}
      </div>
    </div>
  );
}

interface HitGroup {
  ref: string;
  kind: SearchHit["kind"];
  hits: SearchHit[];
}

function groupHits(hits: SearchHit[]): HitGroup[] {
  const map = new Map<string, HitGroup>();
  for (const h of hits) {
    const key = `${h.kind}:${h.ref}`;
    let g = map.get(key);
    if (!g) {
      g = { ref: h.ref, kind: h.kind, hits: [] };
      map.set(key, g);
    }
    g.hits.push(h);
  }
  return [...map.values()];
}

function jumpTo(
  hit: SearchHit,
  onJump: (loc: { kind: "entry" | "chapter"; key: string; line?: number }) => void,
): void {
  if (hit.kind === "prose") {
    onJump({ kind: "chapter", key: hit.ref, line: hit.line });
  } else {
    onJump({ kind: "entry", key: hit.ref, line: hit.line });
  }
}
