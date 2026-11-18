import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  renameApply,
  renamePlan,
  type EntryType,
  type RenamePlanSummary,
} from "../lib/lw.js";

interface Props {
  sagaPath: string;
  type: EntryType;
  id: string;
  name: string;
  onClose: () => void;
  onRenamed: (newId: string) => void;
}

export function RenameDialog({
  sagaPath,
  type,
  id,
  name,
  onClose,
  onRenamed,
}: Props) {
  const [newId, setNewId] = useState(id);
  const [plan, setPlan] = useState<RenamePlanSummary | null>(null);
  const [planning, setPlanning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  // Recompute the plan when newId changes (debounced).
  useEffect(() => {
    setPlan(null);
    setErr(null);
    if (!/^[a-z0-9][a-z0-9-]*$/.test(newId) || newId === id) return;
    let cancelled = false;
    setPlanning(true);
    const handle = setTimeout(() => {
      void renamePlan(sagaPath, `${type}/${id}`, newId)
        .then((p) => {
          if (!cancelled) setPlan(p);
        })
        .catch((e) => {
          if (!cancelled) setErr((e as Error).message);
        })
        .finally(() => {
          if (!cancelled) setPlanning(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [newId, sagaPath, type, id]);

  const apply = async () => {
    if (!plan || plan.conflicts.length > 0) return;
    setApplying(true);
    setErr(null);
    try {
      await renameApply(sagaPath, `${type}/${id}`, newId);
      onRenamed(newId);
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setApplying(false);
    }
  };

  const totalEchoes = plan?.hits.reduce((n, h) => n + h.count, 0) ?? 0;
  const totalExtra = plan?.extraHits.reduce((n, h) => n + h.count, 0) ?? 0;
  const validId = /^[a-z0-9][a-z0-9-]*$/.test(newId);

  const modal = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        className="w-full max-w-xl bg-card/95 border border-border/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-6 py-4 border-b border-border/70 bg-muted/20">
          <div className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">{type}/{id}</div>
          <div className="text-base font-semibold tracking-tight text-foreground">Rename "{name}"</div>
        </header>

        <div className="p-6 space-y-4 text-sm">
          <label className="block">
            <div className="text-xs text-muted-foreground mb-1.5 font-medium">
              New Identifier <span className="text-muted-foreground/70 font-mono">· kebab-case</span>
            </div>
            <input
              autoFocus
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 font-mono text-sm focus:ring-1 focus:ring-primary focus:outline-none transition-colors"
            />
          </label>

          {!validId && newId !== id && (
            <div className="text-rose-400 text-xs font-mono">
              Identifier must match <code>[a-z0-9][a-z0-9-]*</code>
            </div>
          )}

          {planning && (
            <div className="text-muted-foreground text-xs italic">Computing link impact and affected references…</div>
          )}

          {plan && (
            <div className="border border-border/70 rounded-xl p-4 text-xs space-y-2 bg-muted/20">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Target file:</span>
                <span className="font-mono text-foreground">
                  {plan.sourceFile ?? "(none)"}
                </span>
                {plan.targetFile && plan.targetFile !== plan.sourceFile && (
                  <>
                    <span className="text-muted-foreground">→</span>
                    <span className="font-mono text-primary font-medium">
                      {plan.targetFile}
                    </span>
                  </>
                )}
              </div>
              <div>
                <span className="text-muted-foreground">Direct echoes:</span>{" "}
                <span className="text-foreground font-medium">
                  {totalEchoes} in {plan.hits.length} file
                  {plan.hits.length === 1 ? "" : "s"}
                </span>
              </div>
              {plan.extraHits.length > 0 && (
                <div>
                  <span className="text-muted-foreground">Other references:</span>{" "}
                  <span className="text-foreground font-medium">{totalExtra}</span>
                </div>
              )}
              {plan.conflicts.length > 0 && (
                <div className="text-rose-400 mt-2 p-3 bg-rose-500/10 rounded-lg border border-rose-500/30">
                  <div className="font-semibold mb-1">Conflicts detected:</div>
                  <ul className="list-disc ml-5 space-y-0.5">
                    {plan.conflicts.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {err && <div className="text-rose-400 text-xs whitespace-pre-wrap font-mono p-3 bg-rose-500/10 rounded-lg border border-rose-500/30">{err}</div>}
        </div>

        <footer className="px-6 py-3.5 border-t border-border/70 bg-muted/20 flex justify-end gap-2.5">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg border border-border text-foreground hover:bg-muted text-xs font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => void apply()}
            disabled={
              applying ||
              !plan ||
              plan.conflicts.length > 0 ||
              newId === id ||
              !validId
            }
            className="px-4 py-1.5 rounded-lg border border-primary/50 bg-primary/20 text-primary font-medium hover:bg-primary/30 disabled:opacity-40 text-xs transition-colors shadow-sm"
          >
            {applying ? "Renaming…" : "Apply rename"}
          </button>
        </footer>
      </div>
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(modal, document.body)
    : modal;
}
