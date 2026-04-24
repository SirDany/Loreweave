import { useMemo, useState } from "react";
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

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded shadow-xl w-[32rem] max-w-full p-4 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base">New trace</h2>
          <button
            onClick={onClose}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            esc
          </button>
        </div>

        <label className="block text-xs">
          <span className="text-muted-foreground">title</span>
          <input
            autoFocus
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="short headline"
            className="mt-1 w-full bg-background border border-border rounded px-2 py-1 text-sm"
          />
          {title && (
            <span className="text-muted-foreground font-mono">
              id: {id || <em className="text-red-400">invalid</em>}
            </span>
          )}
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs">
            <span className="text-muted-foreground">kind</span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as TraceKind)}
              className="mt-1 w-full bg-background border border-border rounded px-2 py-1 text-sm"
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs">
            <span className="text-muted-foreground">
              target <span className="text-muted-foreground/70">(optional)</span>
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
                placeholder="@character/aaron or chapter:book-one/01-arrival"
                className="mt-1 w-full bg-background border border-border rounded px-2 py-1 text-sm font-mono"
              />
              {showSuggest && filteredSuggestions.length > 0 && (
                <ul className="absolute left-0 right-0 top-full mt-1 z-10 bg-background border border-border rounded shadow-lg max-h-56 overflow-auto">
                  {filteredSuggestions.map((s) => (
                    <li key={s.value}>
                      <button
                        type="button"
                        onMouseDown={(ev) => ev.preventDefault()}
                        onClick={() => {
                          setTarget(s.value);
                          setShowSuggest(false);
                        }}
                        className="w-full text-left px-2 py-1 hover:bg-muted"
                      >
                        <div className="text-foreground text-xs">{s.label}</div>
                        <div className="text-muted-foreground text-[11px] font-mono truncate">
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
          <span className="text-muted-foreground">body</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            placeholder="freeform markdown…"
            className="mt-1 w-full bg-background border border-border rounded px-2 py-1 text-sm font-mono"
          />
        </label>

        {err && <div className="text-xs text-red-400">{err}</div>}

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="px-3 py-1 text-sm border border-border rounded hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave || saving}
            className={
              "px-3 py-1 text-sm rounded " +
              (canSave && !saving
                ? "bg-primary hover:bg-primary/90 text-primary-foreground"
                : "bg-muted text-muted-foreground cursor-not-allowed")
            }
          >
            {saving ? "Saving…" : "Create trace"}
          </button>
        </div>
      </div>
    </div>
  );
}
