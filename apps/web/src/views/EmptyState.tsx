import { Badge } from '../components/ui/badge.js';
import { cn } from '../lib/utils.js';
import type { DumpPayload } from '../lib/lw.js';
import type { Section } from '../state/types.js';

interface EmptyStateProps {
  section: Section;
  diagnostics: DumpPayload['diagnostics'];
}

const COPY: Record<string, { title: string; lines: string[] }> = {
  story: {
    title: 'Story',
    lines: [
      'Select a chapter from the Grimoire on the left to start writing and refining.',
      'Each chapter lives at sagas/<saga>/tomes/<tome>/story/NN-<slug>/chapter.md.',
    ],
  },
  codex: {
    title: 'Codex',
    lines: [
      'Characters, locations, concepts, lore, and waypoints live here.',
      'Select an entry from the list, or add a new one under sagas/<saga>/codex/.',
    ],
  },
  lexicon: {
    title: 'Lexicon',
    lines: [
      'Terms and dialect slang. Group related terms under a Sigil with kind: slang-group.',
    ],
  },
  sigils: {
    title: 'Sigils',
    lines: [
      'Tags and categorical groups. Sigils with kind: slang-group bind Lexicon terms to characters and locations.',
    ],
  },
  timeline: {
    title: 'Story Timeline',
    lines: [
      'Track draft storylines, revision checkpoints, and cloud synchronization.',
    ],
  },
};

/**
 * Default panel shown when no entry/chapter is selected and the
 * current section has no dedicated landing view.
 */
export function EmptyState({ section, diagnostics }: EmptyStateProps) {
  const copy = COPY[section] ?? {
    title: section,
    lines: ['Select an item from the Grimoire to view or edit.'],
  };

  return (
    <div className="flex-1 overflow-auto scrollbar-ember bg-background">
      <div className="mx-auto max-w-3xl p-10 animate-fade-in space-y-6">
        <div>
          <div className="label-rune mb-2 tracking-wider font-semibold text-primary">Workspace Section</div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground">{copy.title}</h2>
          <div className="mt-3 space-y-2 text-sm text-muted-foreground leading-relaxed">
            {copy.lines.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        </div>

        {diagnostics.length > 0 && (
          <div className="pt-4 border-t border-border/60">
            <div className="label-rune mb-3 text-muted-foreground tracking-wider font-semibold">Workspace Diagnostics</div>
            <ul className="space-y-2 rounded-xl border border-border/80 bg-card/60 backdrop-blur-sm p-4 text-sm shadow-sm">
              {diagnostics.map((d, i) => (
                <li
                  key={i}
                  className={cn(
                    'flex items-start gap-2.5',
                    d.severity === 'error' ? 'text-rose-300' : 'text-amber-300',
                  )}
                >
                  <Badge
                    variant={d.severity === 'error' ? 'danger' : 'warning'}
                    className="shrink-0 rounded-md font-mono text-[10px]"
                  >
                    {d.code}
                  </Badge>
                  <span className="text-xs leading-relaxed">
                    {d.message}
                    {d.file && (
                      <span className="text-muted-foreground font-mono">
                        {' '}
                        — {d.file}
                        {d.line ? `:${d.line}` : ''}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
