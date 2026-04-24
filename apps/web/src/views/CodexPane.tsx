/**
 * Side pane shown alongside the chapter editor. Renders the Codex entry
 * under the writer's cursor (the `@echo` that contains the caret), using
 * the cached canon digest for zero-latency resolution.
 */
import { BookOpen } from 'lucide-react';
import type { RefAtCursor } from '../editor/refAtCursor.js';
import type { CanonDigestPayload } from '../lib/lw.js';

interface Props {
  cursorRef: RefAtCursor | null;
  digest: CanonDigestPayload | null;
  onJump?: (type: string, id: string) => void;
}

export function CodexPane({ cursorRef, digest, onJump }: Props) {
  if (!digest) {
    return (
      <div className="h-full p-4 text-xs text-muted-foreground">
        Canon digest loading…
      </div>
    );
  }
  if (!cursorRef) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-xs text-muted-foreground">
        <BookOpen className="h-5 w-5 opacity-60" />
        <div>Place the cursor inside an</div>
        <div className="font-mono text-foreground/70">@type/id</div>
        <div>to see the entry here.</div>
      </div>
    );
  }
  const needle = `@${cursorRef.type}/${cursorRef.id}`;
  const entry = digest.phoneBook.find((p) => p.ref === needle);
  const weave = digest.weaves.find((w) => w.ref === needle);
  if (!entry) {
    return (
      <div className="h-full p-4 text-xs text-rose-400">
        Unknown reference: <span className="font-mono">{needle}</span>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-border bg-card/40 px-4 py-2">
        <button
          className="font-serif text-base hover:underline"
          onClick={() => onJump?.(entry.type, entry.id)}
          title="Open in Codex"
        >
          {entry.name}
        </button>
        <div className="font-mono text-[11px] text-muted-foreground">
          {entry.ref}
        </div>
        {entry.status && (
          <span
            className={
              'mt-1 inline-block rounded border border-border px-1.5 py-[1px] text-[10px] uppercase ' +
              (entry.status === 'draft' ? 'text-amber-300' : 'text-emerald-300')
            }
          >
            {entry.status}
          </span>
        )}
      </div>
      <div className="flex-1 overflow-auto px-4 py-3 text-sm">
        {entry.aliases && entry.aliases.length > 0 && (
          <div className="mb-2 text-xs text-muted-foreground">
            a.k.a. {entry.aliases.join(', ')}
          </div>
        )}
        {entry.summary && <p className="text-foreground/90">{entry.summary}</p>}
        {weave && Object.keys(weave.properties).length > 0 && (
          <div className="mt-3">
            <div className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
              Properties
            </div>
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              {Object.entries(weave.properties).map(([k, v]) => (
                <PropRow key={k} k={k} value={v.value} from={v.from} />
              ))}
            </div>
          </div>
        )}
        {entry.tags && entry.tags.length > 0 && (
          <div className="mt-3 text-[11px] text-muted-foreground">
            {entry.tags.map((t) => (
              <span key={t} className="mr-2 font-mono">
                #{t}
              </span>
            ))}
          </div>
        )}
        {weave && weave.inheritsChain.length > 0 && (
          <div className="mt-3 text-[11px] text-muted-foreground">
            Inherits:{' '}
            {weave.inheritsChain
              .map((c) => c.replace(/^sigil:/, '#'))
              .join(' → ')}
          </div>
        )}
      </div>
    </div>
  );
}

function PropRow({
  k,
  value,
  from,
}: {
  k: string;
  value: unknown;
  from: string;
}) {
  const inherited = from.startsWith('sigil:');
  return (
    <>
      <div className="text-muted-foreground">{k}</div>
      <div
        className={
          'break-words ' +
          (inherited ? 'italic text-foreground/80' : 'text-foreground/95')
        }
        title={inherited ? `inherited from ${from}` : undefined}
      >
        {format(value)}
      </div>
    </>
  );
}

function format(v: unknown): string {
  if (v == null) return '—';
  if (Array.isArray(v)) return v.map((x) => format(x)).join(', ');
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v);
    } catch {
      return '[object]';
    }
  }
  return String(v);
}
