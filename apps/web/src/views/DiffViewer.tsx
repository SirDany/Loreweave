import { createPortal } from 'react-dom';

interface Props {
  file: string;
  patch: string;
  onClose: () => void;
}

/**
 * Render a unified-diff string with light syntax coloring. Hunks are split on
 * `@@` markers; lines beginning with `+`/`-` are colored.
 */
export function DiffViewer({ file, patch, onClose }: Props) {
  const modal = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-md p-6 animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div
        className="w-full max-w-4xl h-[80vh] bg-card/95 border border-border/80 rounded-xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-6 py-4 border-b border-border/70 flex items-center gap-3 bg-muted/20">
          <div className="flex-1 min-w-0">
            <div className="text-xs uppercase tracking-wider font-semibold text-primary">
              Revision Diff
            </div>
            <div className="text-sm font-mono text-foreground truncate mt-0.5">
              {file || '(all pending story changes)'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg border border-border/80 text-foreground/90 hover:bg-muted text-xs font-medium transition-colors"
          >
            Close
          </button>
        </header>
        <div className="flex-1 overflow-auto bg-background/90 font-mono text-xs leading-relaxed scrollbar-ember">
          {patch.trim().length === 0 ? (
            <div className="p-8 text-muted-foreground text-center">No textual differences found.</div>
          ) : (
            <pre className="p-5 whitespace-pre">
              {patch.split('\n').map((line, i) => {
                let cls = 'text-foreground/90';
                if (line.startsWith('+++') || line.startsWith('---')) cls = 'text-muted-foreground';
                else if (line.startsWith('@@')) cls = 'text-primary font-semibold py-1 bg-primary/10 rounded px-1 inline-block my-1';
                else if (line.startsWith('+')) cls = 'text-emerald-400 bg-emerald-500/10 px-1 rounded-sm';
                else if (line.startsWith('-')) cls = 'text-rose-400 bg-rose-500/10 px-1 rounded-sm';
                else if (line.startsWith('diff ') || line.startsWith('index ')) cls = 'text-muted-foreground/60';
                return (
                  <div key={i} className={cls}>
                    {line || '\u00A0'}
                  </div>
                );
              })}
            </pre>
          )}
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modal, document.body)
    : modal;
}
