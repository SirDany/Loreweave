import { useEffect, useState } from "react";
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="w-full max-w-xl bg-stone-900 border border-stone-700 rounded-lg shadow-2xl">
        <header className="px-5 py-3 border-b border-stone-800">
          <div className="text-xs text-stone-500">{type}/{id}</div>
          <div className="text-base text-stone-100">Rename "{name}"</div>
        </header>

        <div className="p-5 space-y-3 text-sm">
          <label className="block">
            <div className="text-xs text-stone-400 mb-1">
              new id <span className="text-stone-600">· kebab-case</span>
            </div>
            <input
              autoFocus
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
              className="w-full bg-stone-950 border border-stone-700 rounded px-2 py-1 font-mono"
            />
          </label>

          {!validId && newId !== id && (
            <div className="text-rose-400 text-xs">
              id must match <code>[a-z0-9][a-z0-9-]*</code>
            </div>
          )}

          {planning && (
            <div className="text-stone-400 text-xs">Computing impact…</div>
          )}

          {plan && (
            <div className="border border-stone-800 rounded p-3 text-xs space-y-1 bg-stone-950">
              <div>
                <span className="text-stone-400">file:</span>{" "}
                <span className="font-mono text-stone-200">
                  {plan.sourceFile ?? "(none)"}
                </span>
                {plan.targetFile && plan.targetFile !== plan.sourceFile && (
                  <>
                    {" → "}
                    <span className="font-mono text-amber-300">
                      {plan.targetFile}
                    </span>
                  </>
                )}
              </div>
              <div>
                <span className="text-stone-400">echoes:</span>{" "}
                <span className="text-stone-200">
                  {totalEchoes} in {plan.hits.length} file
                  {plan.hits.length === 1 ? "" : "s"}
                </span>
              </div>
              {plan.extraHits.length > 0 && (
                <div>
                  <span className="text-stone-400">other refs:</span>{" "}
                  <span className="text-stone-200">{totalExtra}</span>
                </div>
              )}
              {plan.conflicts.length > 0 && (
                <div className="text-rose-400 mt-2">
                  conflicts:
                  <ul className="list-disc ml-5">
                    {plan.conflicts.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {err && <div className="text-rose-400 text-xs whitespace-pre-wrap">{err}</div>}
        </div>

        <footer className="px-5 py-3 border-t border-stone-800 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1 rounded border border-stone-700 text-stone-300 hover:bg-stone-800 text-xs"
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
            className="px-3 py-1 rounded border border-amber-500 bg-amber-900/40 text-amber-100 hover:bg-amber-800/50 disabled:opacity-40 text-xs"
          >
            {applying ? "Renaming…" : "Apply rename"}
          </button>
        </footer>
      </div>
    </div>
  );
}
