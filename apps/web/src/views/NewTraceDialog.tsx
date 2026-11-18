import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { TraceKind } from "../lib/lw.js";
import { lwWrite } from "../lib/lw.js";
import { filterTargets, slugify } from "../lib/helpers.js";

export interface TargetSuggestion {
  /** The string to insert (e.g. `@character/aaron` or `chapter:book-one/01-arrival`). */
  value: string;
  /** Friendly label (entry name or chapter title). */
  label: string;
  /** Secondary detail (entry id, tome name, etc). */
  detail?: string;
}

interface Props {
  sagaPath: string;
  /** Optional pre-filled target (e.g. `@character/aaron` or `chapter:book-one/01-arrival`). */
  initialTarget?: string;
  /** Suggestions for the target combobox. */
  suggestions?: TargetSuggestion[];
  onClose: () => void;
  onCreated: () => void;
}

const KINDS: TraceKind[] = ["idea", "todo", "remark", "question", "done"];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Minimal sticky-trace creation dialog. Writes `<saga>/traces/<id>.md` via the
 * existing lw_write plumbing, then tells the parent to reload the Saga so the
 * new trace appears in the list.
 */
export function NewTraceDialog({ sagaPath, initialTarget, suggestions, onClose, onCreated }: Props) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<TraceKind>("remark");
  const [target, setTarget] = useState(initialTarget ?? "");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showSuggest, setShowSuggest] = useState(false);

  const filteredSuggestions = useMemo(() => {
    if (!suggestions || suggestions.length === 0) return [];
    return filterTargets(suggestions, target);
  }, [target, suggestions]);

  const id = slugify(title);

  const canSave =
    title.trim().length > 0 && id.length > 0 && /^[a-z0-9][a-z0-9-]*$/.test(id);

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    setErr(null);
    try {
      const fm: string[] = [
        "---",
        `id: ${id}`,
        `kind: ${kind}`,
        ...(target.trim() ? [`target: ${JSON.stringify(target.trim())}`] : []),
        `created: ${todayIso()}`,
        `updated: ${todayIso()}`,
        "status: open",
        "---",
      ];
      const content = [
        fm.join("\n"),
        "",
        `# ${title.trim()}`,
        "",
        body.trim() || "_(no body yet)_",
        "",
      ].join("\n");
      await lwWrite(sagaPath, `traces/${id}.md`, content);
      onCreated();
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const modal = (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-[100] p-4 animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-card/95 border border-border/80 rounded-2xl shadow-2xl w-[32rem] max-w-full flex flex-col backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-6 py-4 border-b border-border/70 bg-muted/20 rounded-t-2xl flex items-center justify-between">
          <h2 className="text-base font-semibold tracking-tight text-foreground">New Trace</h2>
          <button
            onClick={onClose}
            className="text-xs text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted transition-colors"
          >
            esc
          </button>
        </header>

        <div className="p-6 space-y-4 text-sm">
          <label className="block text-xs">
            <span className="text-muted-foreground font-medium">Headline Title</span>
            <input
              autoFocus
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Short headline"
              className="mt-1 w-full bg-background border border-border rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-primary focus:outline-none transition-colors"
            />
            {title && (
              <span className="text-muted-foreground font-mono text-[11px] mt-1 block">
                id: {id || <em className="text-rose-400">invalid</em>}
              </span>
            )}
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs">
              <span className="text-muted-foreground font-medium">Trace Kind</span>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as TraceKind)}
                className="mt-1 w-full bg-background border border-border rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-primary focus:outline-none transition-colors"
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs">
              <span className="text-muted-foreground font-medium">
                Target Reference <span className="text-muted-foreground/70">(optional)</span>
              </span>
              <div className="relative">
                <input
                  type="text"
                  value={target}
                  onChange={(e) => {
                    setTarget(e.target.value);
                    setShowSuggest(true);
                  }}
                  onFocus={() => setShowSuggest(true)}
                  onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
                  placeholder="@character/aaron or chapter:..."
                  className="mt-1 w-full bg-background border border-border rounded-lg px-3 py-2 text-xs font-mono focus:ring-1 focus:ring-primary focus:outline-none transition-colors"
                />
                {showSuggest && filteredSuggestions.length > 0 && (
                  <ul className="absolute left-0 right-0 top-full mt-1 z-[110] bg-popover/95 backdrop-blur-md border border-border/90 rounded-xl shadow-2xl max-h-56 overflow-auto py-1">
                    {filteredSuggestions.map((s) => (
                      <li key={s.value}>
                        <button
                          type="button"
                          onMouseDown={(ev) => ev.preventDefault()}
                          onClick={() => {
                            setTarget(s.value);
                            setShowSuggest(false);
                          }}
                          className="w-full text-left px-3 py-1.5 hover:bg-muted transition-colors"
                        >
                          <div className="text-foreground text-xs font-medium">{s.label}</div>
                          <div className="text-muted-foreground text-[10px] font-mono truncate">
                            {s.value}
                            {s.detail ? ` · ${s.detail}` : ""}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </label>
          </div>

          <label className="block text-xs">
            <span className="text-muted-foreground font-medium">Trace Body</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              placeholder="Freeform markdown notes, observations, or ideas…"
              className="mt-1 w-full bg-background border border-border rounded-lg px-3 py-2 text-xs font-mono focus:ring-1 focus:ring-primary focus:outline-none transition-colors"
            />
          </label>

          {err && <div className="text-xs text-rose-400 font-mono p-3 bg-rose-500/10 rounded-lg border border-rose-500/30">{err}</div>}
        </div>

        <footer className="px-6 py-3.5 border-t border-border/70 bg-muted/20 rounded-b-2xl flex justify-end gap-2.5">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg border border-border text-foreground hover:bg-muted text-xs font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave || saving}
            className="px-4 py-1.5 rounded-lg border border-primary/50 bg-primary/20 text-primary font-medium hover:bg-primary/30 disabled:opacity-40 text-xs transition-colors shadow-sm"
          >
            {saving ? "Saving…" : "Create trace"}
          </button>
        </footer>
      </div>
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(modal, document.body)
    : modal;
}
