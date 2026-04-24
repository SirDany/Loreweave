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
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        className="w-full max-w-4xl h-[80vh] bg-card border border-border rounded-lg shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-3 border-b border-border flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-xs text-muted-foreground">diff</div>
            <div className="text-sm font-mono text-foreground truncate">{file || "(working tree)"}</div>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded border border-border text-foreground/90 hover:bg-muted text-xs"
          >
            Close
          </button>
        </header>
        <div className="flex-1 overflow-auto bg-background font-mono text-xs leading-relaxed">
          {patch.trim().length === 0 ? (
            <div className="p-6 text-muted-foreground">No changes.</div>
          ) : (
            <pre className="p-4 whitespace-pre">
              {patch.split("\n").map((line, i) => {
                let cls = "text-foreground/90";
                if (line.startsWith("+++") || line.startsWith("---")) cls = "text-muted-foreground";
                else if (line.startsWith("@@")) cls = "text-cyan-400";
                else if (line.startsWith("+")) cls = "text-emerald-400";
                else if (line.startsWith("-")) cls = "text-rose-400";
                else if (line.startsWith("diff ") || line.startsWith("index ")) cls = "text-muted-foreground/70";
                return (
                  <div key={i} className={cls}>
                    {line || "\u00A0"}
                  </div>
                );
              })}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
