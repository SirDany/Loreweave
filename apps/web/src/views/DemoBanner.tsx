/**
 * Persistent banner shown only on the GitHub Pages demo build.
 */
export function DemoBanner() {
  return (
    <div className="shrink-0 border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-100">
      <span className="font-semibold">Demo preview</span> — the filesystem
      sidecar isn&apos;t available on GitHub Pages, so reads and writes will
      fail. Clone the repo and run{' '}
      <code className="rounded bg-black/30 px-1 font-mono">pnpm dev</code>, or
      open it in a{' '}
      <a
        href="https://github.com/codespaces"
        target="_blank"
        rel="noreferrer"
        className="underline hover:text-white"
      >
        GitHub Codespace
      </a>
      , for the full editing experience.
    </div>
  );
}
