import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../components/ui/button.js';
import type { DumpPayload } from '../lib/lw.js';
import { buildTargetSuggestions, type Jumper } from '../lib/saga-helpers.js';
import { cn } from '../lib/utils.js';
import { NewTraceDialog } from './NewTraceDialog.js';
import { TracesList } from './TracesList.js';

interface TracesViewProps {
  data: DumpPayload;
  sagaPath: string;
  onJump: Jumper;
  onReload: () => void;
}

/**
 * The Traces section's main pane. Shows a filterable list of all
 * traces in the Saga and a "+ New trace" button.
 */
export function TracesView({
  data,
  sagaPath,
  onJump,
  onReload,
}: TracesViewProps) {
  const [filter, setFilter] = useState<
    'all' | 'open' | 'todo' | 'idea' | 'question'
  >('open');
  const [creating, setCreating] = useState(false);
  const filtered = data.traces.filter((n) => {
    if (filter === 'all') return true;
    if (filter === 'open') return n.status === 'open';
    return n.kind === filter;
  });
  const counts = {
    all: data.traces.length,
    open: data.traces.filter((n) => n.status === 'open').length,
    todo: data.traces.filter((n) => n.kind === 'todo').length,
    idea: data.traces.filter((n) => n.kind === 'idea').length,
    question: data.traces.filter((n) => n.kind === 'question').length,
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <header className="px-6 py-3 border-b border-border bg-card/40 flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary/80" />
          <span className="font-serif text-lg">Traces</span>
        </div>
        <div className="flex flex-wrap gap-1 text-xs">
          {(['all', 'open', 'todo', 'idea', 'question'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'rounded-md border px-2 py-1 capitalize transition-colors',
                filter === f
                  ? 'border-primary bg-primary/15 text-primary-foreground/90'
                  : 'border-border hover:bg-muted',
              )}
            >
              {f} <span className="text-muted-foreground">({counts[f]})</span>
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <Button size="sm" onClick={() => setCreating(true)}>
          + New trace
        </Button>
      </header>
      <div className="flex-1 overflow-auto scrollbar-ember p-6">
        <TracesList
          traces={filtered}
          onJump={(target) => {
            if (target.startsWith('chapter:')) {
              const key = target.slice('chapter:'.length).replace('/', '::');
              onJump({ kind: 'chapter', key });
              return;
            }
            const cleaned = target.replace(/^@/, '');
            if (cleaned.includes('/')) onJump({ kind: 'entry', key: cleaned });
          }}
        />
      </div>
      {creating && (
        <NewTraceDialog
          sagaPath={sagaPath}
          suggestions={buildTargetSuggestions(data)}
          onClose={() => setCreating(false)}
          onCreated={onReload}
        />
      )}
    </div>
  );
}
