import type { Trace } from '../lib/lw.js';

interface Props {
  traces: Trace[];
  /** When set, filter to traces attached to this target.
   * Accepted: "@type/id" or "chapter:tome/slug" or "saga" */
  forTarget?: string | null;
  onJump?: (target: string) => void;
}

const KIND_LABEL: Record<Trace['kind'], string> = {
  idea: '💡',
  todo: '✅',
  remark: '🗒',
  question: '❓',
  done: '✔',
};

export function TracesList({ traces, forTarget, onJump }: Props) {
  const visible = forTarget
    ? traces.filter((n) => {
        const t = n.target ?? null;
        if (t === forTarget) return true;
        // allow "@" prefix tolerance
        if (forTarget.startsWith('@') && t === forTarget.slice(1)) return true;
        if (t?.startsWith('@') && t.slice(1) === forTarget) return true;
        return false;
      })
    : traces;

  if (visible.length === 0) {
    return <div className="text-xs text-muted-foreground italic">no traces</div>;
  }

  return (
    <ul className="space-y-2.5">
      {visible.map((n) => (
        <li
          key={n.id}
          className={
            'rounded-xl border p-4 text-sm transition-all duration-150 backdrop-blur-sm shadow-sm ' +
            (n.status === 'resolved'
              ? 'border-border/60 bg-card/30 opacity-60'
              : n.kind === 'todo'
              ? 'border-primary/40 bg-primary/10'
              : n.kind === 'question'
              ? 'border-sky-500/30 bg-sky-500/10'
              : n.kind === 'idea'
              ? 'border-violet-500/30 bg-violet-500/10'
              : 'border-border/80 bg-card/60')
          }
        >
          <div className="flex items-start gap-3">
            <span className="text-base select-none">{KIND_LABEL[n.kind]}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className="font-mono text-xs text-foreground font-semibold">{n.id}</div>
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
                  <span className="rounded bg-muted px-1.5 py-0.5">{n.kind}</span>
                  {n.author && <span>· {n.author}</span>}
                  {n.created && <span>· {n.created}</span>}
                </div>
              </div>
              {n.target && (
                <div className="mt-1 text-[11px]">
                  <button
                    className="text-primary hover:underline font-mono"
                    onClick={() => onJump?.(n.target!)}
                  >
                    {n.target}
                  </button>
                </div>
              )}
              <div className="mt-2 text-foreground/90 whitespace-pre-wrap text-xs leading-relaxed">
                {n.body}
              </div>
              {n.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {n.tags.map((t) => (
                    <span key={t} className="rounded bg-muted/60 border border-border/50 px-1.5 py-0.5 text-[10px] text-muted-foreground font-mono">
                      #{t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
