import type { Note } from "../lib/lw.js";

interface Props {
  notes: Note[];
  /** When set, filter to notes attached to this target.
   * Accepted: "@type/id" or "chapter:tome/slug" or "saga" */
  forTarget?: string | null;
  onJump?: (target: string) => void;
}

const KIND_LABEL: Record<Note["kind"], string> = {
  idea: "💡",
  todo: "✅",
  remark: "🗒",
  question: "❓",
  done: "✔",
};

export function NotesList({ notes, forTarget, onJump }: Props) {
  const visible = forTarget
    ? notes.filter((n) => {
        const t = n.target ?? null;
        if (t === forTarget) return true;
        // allow "@" prefix tolerance
        if (forTarget.startsWith("@") && t === forTarget.slice(1)) return true;
        if (t?.startsWith("@") && t.slice(1) === forTarget) return true;
        return false;
      })
    : notes;

  if (visible.length === 0) {
    return (
      <div className="text-xs text-stone-500 italic">no notes</div>
    );
  }

  return (
    <ul className="space-y-2">
      {visible.map((n) => (
        <li
          key={n.id}
          className={
            "rounded border p-3 text-sm " +
            (n.status === "resolved"
              ? "border-stone-800 bg-stone-900/40 opacity-60"
              : n.kind === "todo"
                ? "border-amber-900/70 bg-amber-950/30"
                : n.kind === "question"
                  ? "border-sky-900/70 bg-sky-950/30"
                  : n.kind === "idea"
                    ? "border-violet-900/70 bg-violet-950/30"
                    : "border-stone-800 bg-stone-900/40")
          }
        >
          <div className="flex items-start gap-2">
            <span>{KIND_LABEL[n.kind]}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className="font-mono text-xs text-stone-400">{n.id}</div>
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-stone-500">
                  <span>{n.kind}</span>
                  {n.author && <span>· {n.author}</span>}
                  {n.created && <span>· {n.created}</span>}
                </div>
              </div>
              {n.target && (
                <div className="mt-0.5 text-[11px]">
                  <button
                    className="text-amber-300 hover:underline font-mono"
                    onClick={() => onJump?.(n.target!)}
                  >
                    {n.target}
                  </button>
                </div>
              )}
              <div className="mt-1.5 text-stone-300 whitespace-pre-wrap">
                {n.body}
              </div>
              {n.tags.length > 0 && (
                <div className="mt-1 text-[10px] text-stone-500">
                  {n.tags.map((t) => `#${t}`).join(" ")}
                </div>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
