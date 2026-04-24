import { useEffect, useState } from "react";
import {
  listBackups,
  restoreApply,
  restorePlan,
  runBackup,
  type BackupSnapshot,
  type RestorePlan,
} from "../lib/lw.js";

interface Props {
  sagaPath: string;
  onClose: () => void;
  onRestored: () => void;
}

/**
 * Lists existing snapshots under `<saga>/.loreweave/backups/`. Lets the
 * writer take a fresh snapshot, plan a restore, and apply it (with an
 * automatic pre-restore safety backup unless explicitly skipped).
 */
export function BackupsDialog({ sagaPath, onClose, onRestored }: Props) {
  const [snapshots, setSnapshots] = useState<BackupSnapshot[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [planFor, setPlanFor] = useState<BackupSnapshot | null>(null);
  const [plan, setPlan] = useState<RestorePlan | null>(null);
  const [skipPreBackup, setSkipPreBackup] = useState(false);

  const refresh = () => {
    setErr(null);
    listBackups(sagaPath)
      .then((r) => setSnapshots(r.snapshots))
      .catch((e) => setErr((e as Error).message));
  };
  useEffect(refresh, [sagaPath]);

  const wrap = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    setErr(null);
    setInfo(null);
    try {
      await fn();
      if (ok) setInfo(ok);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-lg border border-border bg-background shadow-2xl flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-border flex items-center gap-3">
          <div className="text-base">Backups</div>
          <div className="text-xs text-muted-foreground font-mono truncate">
            {sagaPath}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto px-2 py-1 text-xs rounded border border-border hover:bg-muted"
          >
            Close
          </button>
        </div>

        <div className="p-4 border-b border-border flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="label (optional)"
            className="flex-1 min-w-[180px] px-2 py-1 rounded bg-card border border-border text-foreground text-xs"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void wrap(async () => {
                const r = await runBackup(sagaPath, {
                  label: label.trim() || undefined,
                });
                setLabel("");
                setInfo(`snapshot → ${r.path}`);
                refresh();
              })
            }
            className="px-3 py-1 rounded border border-emerald-500 bg-emerald-900/40 text-emerald-100 hover:bg-emerald-800/50 disabled:opacity-40 text-xs"
          >
            Snapshot now
          </button>
          <button
            type="button"
            onClick={refresh}
            className="px-3 py-1 rounded border border-border hover:bg-muted text-xs"
          >
            Refresh
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          {snapshots.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">
              No snapshots yet.
            </div>
          ) : (
            <ul className="divide-y divide-stone-900">
              {snapshots.map((s) => {
                const selected = planFor?.path === s.path;
                return (
                  <li
                    key={s.path}
                    className={
                      "px-4 py-2 " +
                      (selected ? "bg-primary/10" : "hover:bg-muted/50")
                    }
                  >
                    <div className="flex items-center gap-2 text-sm">
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-xs truncate text-foreground">
                          {s.file}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {(s.bytes / 1024).toFixed(1)} KB ·{" "}
                          {new Date(s.modified).toLocaleString()}
                          {s.label ? (
                            <span className="ml-2 text-primary">
                              [{s.label}]
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void wrap(async () => {
                            const p = await restorePlan(s.path, sagaPath);
                            setPlanFor(s);
                            setPlan(p);
                          })
                        }
                        className="px-2 py-1 rounded border border-primary bg-primary/20 text-primary-foreground hover:bg-primary/30 disabled:opacity-40 text-xs"
                      >
                        Restore…
                      </button>
                    </div>
                    {selected && plan && (
                      <div className="mt-2 ml-1 rounded border border-primary/60 bg-background p-3 text-xs">
                        <div className="text-foreground/90 mb-2">
                          will write{" "}
                          <span className="text-emerald-300">+{plan.newFiles} new</span>,{" "}
                          <span className="text-primary">
                            ~{plan.overwritten} overwritten
                          </span>
                          ,{" "}
                          <span className="text-rose-300">
                            -{plan.removed} removed
                          </span>{" "}
                          ({plan.unchanged} unchanged)
                        </div>
                        {plan.removedFiles && plan.removedFiles.length > 0 && (
                          <details className="mb-2">
                            <summary className="cursor-pointer text-muted-foreground">
                              Files that will be removed ({plan.removedFiles.length})
                            </summary>
                            <ul className="mt-1 ml-4 font-mono text-[11px] text-rose-300 max-h-40 overflow-auto">
                              {plan.removedFiles.slice(0, 100).map((f) => (
                                <li key={f}>- {f}</li>
                              ))}
                              {plan.removedFiles.length > 100 && (
                                <li className="text-muted-foreground">
                                  …and {plan.removedFiles.length - 100} more
                                </li>
                              )}
                            </ul>
                          </details>
                        )}
                        <label className="flex items-center gap-1 text-muted-foreground mb-2">
                          <input
                            type="checkbox"
                            checked={skipPreBackup}
                            onChange={(e) => setSkipPreBackup(e.target.checked)}
                          />
                          skip pre-restore safety snapshot
                        </label>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void wrap(async () => {
                                const r = await restoreApply(
                                  s.path,
                                  sagaPath,
                                  skipPreBackup,
                                );
                                setPlanFor(null);
                                setPlan(null);
                                setInfo(
                                  `restored: +${r.newFiles}/~${r.overwritten}/-${r.removed}` +
                                    (r.preBackup ? `\nsafety backup: ${r.preBackup}` : ""),
                                );
                                refresh();
                                onRestored();
                              })
                            }
                            className="px-3 py-1 rounded border border-rose-500 bg-rose-900/40 text-rose-100 hover:bg-rose-800/50 disabled:opacity-40 text-xs"
                          >
                            Apply restore
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setPlanFor(null);
                              setPlan(null);
                            }}
                            className="px-3 py-1 rounded border border-border hover:bg-muted text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {(err || info) && (
          <div className="border-t border-border p-3">
            {err && (
              <pre className="text-xs text-rose-400 whitespace-pre-wrap">{err}</pre>
            )}
            {info && (
              <pre className="text-xs text-emerald-300 whitespace-pre-wrap">
                {info}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
