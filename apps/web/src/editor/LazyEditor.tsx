import { lazy, Suspense } from 'react';
import type { ComponentProps } from 'react';
import type { Editor as EditorImpl } from './Editor.js';

/**
 * Lazy-loaded wrapper around the CodeMirror-based Editor.
 *
 * Splits the ~530 KiB CodeMirror bundle out of the initial paint so the
 * shell (sidebars, empty states, previews) shows up fast. The real editor
 * only loads when a writer clicks an entry or chapter.
 */
const LazyEditor = lazy(() =>
  import('./Editor.js').then((m) => ({ default: m.Editor })),
);

export function Editor(props: ComponentProps<typeof EditorImpl>) {
  return (
    <Suspense fallback={<EditorFallback />}>
      <LazyEditor {...props} />
    </Suspense>
  );
}

function EditorFallback() {
  return (
    <div className="h-full w-full animate-pulse bg-card/40">
      <div className="flex flex-col gap-3 p-6">
        <div className="h-3 w-2/3 rounded bg-muted" />
        <div className="h-3 w-5/6 rounded bg-muted" />
        <div className="h-3 w-1/2 rounded bg-muted" />
        <div className="h-3 w-4/5 rounded bg-muted" />
        <div className="h-3 w-3/4 rounded bg-muted" />
      </div>
    </div>
  );
}
