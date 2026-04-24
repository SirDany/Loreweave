import { useState } from "react";
import {
  importApply,
  importPlan,
  type ImportApplyResult,
  type ImportPlan,
} from "../lib/lw.js";

interface Props {
  onClose: () => void;
  onImported: (target: string) => void;
}

/**
 * Import a Loreweave saga zip. Two-step UX: first compute a plan to show
 * new / conflict / unchanged file counts, then apply with a chosen
 * conflict-resolution strategy.
 */
export function ImportDialog({ onClose, onImported }: Props) {
  const [zipPath, setZipPath] = useState("");
  const [into, setInto] = useState("sagas");
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [resolution, setResolution] = useState<"keep" | "overwrite">("keep");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<ImportApplyResult | null>(null);

  const doPlan = async () => {
    if (!zipPath.trim()) return;
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      const p = await importPlan(zipPath.trim(), into.trim() || "sagas");
      setPlan(p);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const doApply = async () => {
    if (!plan) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await importApply(zipPath.trim(), into.trim() || "sagas", resolution);
      setResult(r);
      onImported(r.plan.targetSaga);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="w-full max-w-2xl bg-card border border-border rounded-lg shadow-2xl">
        <header className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div>
            <div className="text-base text-foreground">Import Saga zip</div>
            <div className="text-xs text-muted-foreground">
              Drop a Loreweave .zip; preview the plan; apply with conflict policy.
            </div>
          </div>
          <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">
            esc
          </button>
        </header>

        <div className="p-5 space-y-4 text-sm">
          <label className="block text-xs">
            <span className="text-muted-foreground">zip path</span>
            <input
              value={zipPath}
              onChange={(e) => {
                setZipPath(e.target.value);
                setPlan(null);
                setResult(null);
              }}
              placeholder="path/to/saga-export.zip"
              className="mt-1 w-full bg-background border border-border rounded px-2 py-1 font-mono text-xs"
            />
          </label>

          <label className="block text-xs">
            <span className="text-muted-foreground">import into</span>
            <input
              value={into}
              onChange={(e) => {
                setInto(e.target.value);
                setPlan(null);
                setResult(null);
              }}
              className="mt-1 w-full bg-background border border-border rounded px-2 py-1 font-mono text-xs"
            />
            <div className="mt-1 text-muted-foreground">
              The bundle root becomes a subdirectory of this folder.
            </div>
          </label>

          <div className="flex gap-2">
            <button
              onClick={() => void doPlan()}
              disabled={busy || !zipPath.trim()}
              className="px-3 py-1 rounded border border-border text-foreground hover:bg-muted text-xs disabled:opacity-40"
            >
              {busy && !plan ? "Planning…" : plan ? "Re-plan" : "Plan"}
            </button>
          </div>

          {plan && (
            <div className="border border-border rounded p-3 bg-background text-xs space-y-2">
              <div>
                <span className="text-muted-foreground">target:</span>{" "}
                <span className="font-mono text-primary">{plan.targetSaga}</span>
              </div>
              <div className="flex gap-3">
                <span className="text-emerald-400">+{plan.newFiles.length} new</span>
                <span className="text-amber-300">~{plan.conflicts.length} conflicts</span>
                <span className="text-muted-foreground">·{plan.unchanged.length} unchanged</span>
              </div>
              {plan.conflicts.length > 0 && (
                <details>
                  <summary className="text-muted-foreground cursor-pointer">
                    show {plan.conflicts.length} conflict file(s)
                  </summary>
                  <ul className="mt-1 max-h-32 overflow-auto font-mono text-[11px] text-primary/80">
                    {plan.conflicts.map((c) => (
                      <li key={c.relPath}>~ {c.relPath}</li>
                    ))}
                  </ul>
                </details>
              )}
              {plan.newFiles.length > 0 && (
                <details>
                  <summary className="text-muted-foreground cursor-pointer">
                    show {plan.newFiles.length} new file(s)
                  </summary>
                  <ul className="mt-1 max-h-32 overflow-auto font-mono text-[11px] text-emerald-300/80">
                    {plan.newFiles.map((f) => (
                      <li key={f}>+ {f}</li>
                    ))}
                  </ul>
                </details>
              )}

              {plan.conflicts.length > 0 && (
                <fieldset className="border border-border rounded p-2 mt-2">
                  <legend className="text-muted-foreground px-1">conflict policy</legend>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="radio"
                      name="resolution"
                      checked={resolution === "keep"}
                      onChange={() => setResolution("keep")}
                    />
                    Keep existing files (only apply new ones)
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="radio"
                      name="resolution"
                      checked={resolution === "overwrite"}
                      onChange={() => setResolution("overwrite")}
                    />
                    Overwrite existing with incoming
                  </label>
                </fieldset>
              )}
            </div>
          )}

          {result && (
            <div className="border border-emerald-900 bg-emerald-950/30 rounded p-3 text-xs">
              Applied:
              <ul className="mt-1">
                <li className="text-emerald-300">
                  {result.actions.filter((a) => a.action === "created").length} created
                </li>
                <li className="text-primary">
                  {result.actions.filter((a) => a.action === "overwritten").length} overwritten
                </li>
                <li className="text-muted-foreground">
                  {result.actions.filter((a) => a.action === "kept").length} kept
                </li>
              </ul>
            </div>
          )}

          {err && (
            <div className="text-rose-400 text-xs whitespace-pre-wrap">{err}</div>
          )}
        </div>

        <footer className="px-5 py-3 border-t border-border flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1 rounded border border-border text-foreground/90 hover:bg-muted text-xs"
          >
            Close
          </button>
          <button
            onClick={() => void doApply()}
            disabled={busy || !plan || (plan.newFiles.length === 0 && plan.conflicts.length === 0)}
            className="px-3 py-1 rounded border border-primary bg-primary/20 text-primary-foreground hover:bg-primary/30 disabled:opacity-40 text-xs"
          >
            {busy && plan ? "Importing…" : "Apply import"}
          </button>
        </footer>
      </div>
    </div>
  );
}
