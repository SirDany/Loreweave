import { useState } from "react";
import { createPortal } from "react-dom";
import {
  fileToBase64,
  importApply,
  importPlan,
  uploadImportZip,
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

  const browseZip = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".zip,application/zip";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      setBusy(true);
      setErr(null);
      setPlan(null);
      setResult(null);
      try {
        const b64 = await fileToBase64(file);
        const uploaded = await uploadImportZip(file.name, b64);
        setZipPath(uploaded.zipPath);
        const p = await importPlan(uploaded.zipPath, into.trim() || "sagas");
        setPlan(p);
      } catch (ex) {
        setErr((ex as Error).message);
      } finally {
        setBusy(false);
      }
    };
    input.click();
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
        className="w-full max-w-2xl bg-card/95 border border-border/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-6 py-4 border-b border-border/70 bg-muted/20 flex items-center justify-between">
          <div>
            <div className="text-base font-semibold tracking-tight text-foreground">Import Saga Zip</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Select or provide a Loreweave .zip bundle; preview the plan; apply with conflict policy.
            </div>
          </div>
          <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted transition-colors">
            esc
          </button>
        </header>

        <div className="p-6 space-y-4 text-sm">
          <label className="block text-xs">
            <span className="text-muted-foreground font-medium">ZIP Archive Path</span>
            <div className="mt-1 flex gap-2">
              <input
                value={zipPath}
                onChange={(e) => {
                  setZipPath(e.target.value);
                  setPlan(null);
                  setResult(null);
                }}
                placeholder="path/to/saga-export.zip"
                className="flex-1 bg-background border border-border rounded-lg px-3 py-2 font-mono text-xs focus:ring-1 focus:ring-primary focus:outline-none transition-colors"
              />
              <button
                type="button"
                onClick={browseZip}
                disabled={busy}
                className="px-3 py-2 rounded-lg border border-border text-foreground hover:bg-muted text-xs font-medium disabled:opacity-40 transition-colors shrink-0"
              >
                Browse .zip…
              </button>
            </div>
          </label>

          <label className="block text-xs">
            <span className="text-muted-foreground font-medium">Import Destination Folder</span>
            <input
              value={into}
              onChange={(e) => {
                setInto(e.target.value);
                setPlan(null);
                setResult(null);
              }}
              className="mt-1 w-full bg-background border border-border rounded-lg px-3 py-2 font-mono text-xs focus:ring-1 focus:ring-primary focus:outline-none transition-colors"
            />
            <div className="mt-1 text-muted-foreground text-[11px]">
              The bundle root is extracted into this target folder.
            </div>
          </label>

          <div className="flex gap-2">
            <button
              onClick={() => void doPlan()}
              disabled={busy || !zipPath.trim()}
              className="px-3 py-1.5 rounded-lg border border-border text-foreground hover:bg-muted text-xs font-medium disabled:opacity-40 transition-colors"
            >
              {busy && !plan ? "Planning…" : plan ? "Re-plan" : "Preview Plan"}
            </button>
          </div>

          {plan && (
            <div className="border border-border/70 rounded-xl p-4 bg-muted/20 text-xs space-y-3">
              <div>
                <span className="text-muted-foreground">Target location:</span>{" "}
                <span className="font-mono text-primary font-medium">{plan.targetSaga}</span>
              </div>
              <div className="flex gap-4">
                <span className="text-emerald-400 font-medium">+{plan.newFiles.length} new</span>
                <span className="text-amber-300 font-medium">~{plan.conflicts.length} conflicts</span>
                <span className="text-muted-foreground">· {plan.unchanged.length} unchanged</span>
              </div>
              {plan.conflicts.length > 0 && (
                <details className="mt-1">
                  <summary className="text-muted-foreground cursor-pointer hover:text-foreground">
                    show {plan.conflicts.length} conflict file(s)
                  </summary>
                  <ul className="mt-1 max-h-32 overflow-auto font-mono text-[11px] text-amber-300/90 space-y-0.5">
                    {plan.conflicts.map((c) => (
                      <li key={c.relPath}>~ {c.relPath}</li>
                    ))}
                  </ul>
                </details>
              )}
              {plan.newFiles.length > 0 && (
                <details className="mt-1">
                  <summary className="text-muted-foreground cursor-pointer hover:text-foreground">
                    show {plan.newFiles.length} new file(s)
                  </summary>
                  <ul className="mt-1 max-h-32 overflow-auto font-mono text-[11px] text-emerald-300/80 space-y-0.5">
                    {plan.newFiles.map((f) => (
                      <li key={f}>+ {f}</li>
                    ))}
                  </ul>
                </details>
              )}

              {plan.conflicts.length > 0 && (
                <fieldset className="border border-border/70 rounded-lg p-3 mt-2 bg-background/50">
                  <legend className="text-muted-foreground px-1 text-[11px] uppercase tracking-wider font-semibold">Conflict Policy</legend>
                  <div className="space-y-2 mt-1">
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="radio"
                        name="resolution"
                        className="accent-primary"
                        checked={resolution === "keep"}
                        onChange={() => setResolution("keep")}
                      />
                      <span>Keep existing files (only apply new files)</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="radio"
                        name="resolution"
                        className="accent-primary"
                        checked={resolution === "overwrite"}
                        onChange={() => setResolution("overwrite")}
                      />
                      <span>Overwrite existing files with incoming bundle</span>
                    </label>
                  </div>
                </fieldset>
              )}
            </div>
          )}

          {result && (
            <div className="border border-emerald-500/30 bg-emerald-500/10 rounded-xl p-4 text-xs font-mono">
              <div className="font-semibold text-emerald-400 mb-1">Import Applied Successfully:</div>
              <ul className="space-y-0.5">
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
            <div className="text-rose-400 text-xs whitespace-pre-wrap font-mono p-3 bg-rose-500/10 rounded-lg border border-rose-500/30">{err}</div>
          )}
        </div>

        <footer className="px-6 py-3.5 border-t border-border/70 bg-muted/20 flex justify-end gap-2.5">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg border border-border text-foreground hover:bg-muted text-xs font-medium transition-colors"
          >
            {result ? "Done" : "Close"}
          </button>
          {!result && (
            <button
              onClick={() => void doApply()}
              disabled={busy || !plan || (plan.newFiles.length === 0 && plan.conflicts.length === 0)}
              className="px-4 py-1.5 rounded-lg border border-primary/50 bg-primary/20 text-primary font-medium hover:bg-primary/30 disabled:opacity-40 text-xs transition-colors shadow-sm"
            >
              {busy && plan ? "Importing…" : "Apply import"}
            </button>
          )}
        </footer>
      </div>
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(modal, document.body)
    : modal;
}
