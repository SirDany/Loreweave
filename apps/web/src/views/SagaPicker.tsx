import { useEffect, useState } from "react";
import { listSagas, type DiscoveredSaga } from "../lib/lw.js";

interface Props {
  current: string;
  onPick: (path: string) => void;
  onClose: () => void;
}

/**
 * Saga switcher. Lists Sagas auto-discovered under ./sagas (via `lw list-sagas`)
 * and accepts a free-form path so writers can keep Sagas anywhere on disk.
 */
export function SagaPicker({ current, onPick, onClose }: Props) {
  const [items, setItems] = useState<DiscoveredSaga[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [root, setRoot] = useState("sagas");
  const [custom, setCustom] = useState(current);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    listSagas(root)
      .then((list) => {
        if (!cancelled) setItems(list);
      })
      .catch((e) => {
        if (!cancelled) setErr((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [root]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        className="w-full max-w-xl bg-card border border-border rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-3 border-b border-border">
          <div className="text-base text-foreground">Open Saga</div>
          <div className="text-xs text-muted-foreground">
            Pick a discovered Saga or enter a path.
          </div>
        </header>

        <div className="p-5 space-y-4 text-sm">
          <label className="block">
            <div className="text-xs text-muted-foreground mb-1">scan directory</div>
            <input
              value={root}
              onChange={(e) => setRoot(e.target.value)}
              className="w-full bg-background border border-border rounded px-2 py-1 font-mono text-xs"
            />
          </label>

          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
              Discovered
            </div>
            {loading && (
              <div className="text-xs text-muted-foreground">Scanning…</div>
            )}
            {err && (
              <div className="text-xs text-rose-400 whitespace-pre-wrap">{err}</div>
            )}
            {!loading && !err && items.length === 0 && (
              <div className="text-xs text-muted-foreground">No Sagas found in {root}.</div>
            )}
            <ul className="space-y-1">
              {items.map((s) => {
                const active = s.path === current;
                return (
                  <li key={s.path}>
                    <button
                      onClick={() => onPick(s.path)}
                      className={
                        "w-full text-left px-3 py-2 rounded border " +
                        (active
                          ? "border-primary bg-primary/20 text-primary-foreground"
                          : "border-border hover:bg-muted text-foreground")
                      }
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm">{s.title ?? s.id}</span>
                        <span className="text-xs text-muted-foreground">{s.id}</span>
                      </div>
                      <div className="text-xs text-muted-foreground font-mono truncate">
                        {s.path}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
              Custom path
            </div>
            <div className="flex gap-2">
              <input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="C:\\path\\to\\saga or sagas/my-saga"
                className="flex-1 bg-background border border-border rounded px-2 py-1 font-mono text-xs"
              />
              <button
                onClick={() => custom.trim() && onPick(custom.trim())}
                disabled={!custom.trim() || custom.trim() === current}
                className="px-3 py-1 rounded border border-primary bg-primary/20 text-primary-foreground hover:bg-primary/30 disabled:opacity-40 text-xs"
              >
                Open
              </button>
            </div>
          </div>
        </div>

        <footer className="px-5 py-3 border-t border-border flex justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1 rounded border border-border text-foreground/90 hover:bg-muted text-xs"
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}
