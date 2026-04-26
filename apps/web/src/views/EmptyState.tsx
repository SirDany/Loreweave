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
      'Pick a chapter from the Grimoire on the left to start writing.',
      'Each chapter lives at sagas/<saga>/tomes/<tome>/story/NN-<slug>/chapter.md.',
    ],
  },
  codex: {
    title: 'Codex',
    lines: [
      'Characters, locations, concepts, lore, and waypoints live here.',
      'Pick an entry from the list, or add a new one under sagas/<saga>/codex/.',
    ],
  },
  lexicon: {
    title: 'Lexicon',
    lines: [
      'Terms and slang. Group related terms under a Sigil with kind: slang-group.',
    ],
  },
  sigils: {
    title: 'Sigils',
    lines: [
      'Tags and groups. Sigils with kind: slang-group bind Lexicon terms to characters and locations.',
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
    lines: ['Select something from the Grimoire.'],
  };

  return (
    <div className="flex-1 overflow-auto scrollbar-ember">
      <div className="mx-auto max-w-3xl p-10 animate-fade-in">
        <div className="label-rune mb-2">Section</div>
        <h2 className="font-serif text-3xl text-foreground">{copy.title}</h2>
        <div className="mt-5 space-y-2 text-sm text-muted-foreground leading-relaxed">
          {copy.lines.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
        {diagnostics.length > 0 && (
          <div className="mt-10">
            <div className="label-rune mb-3">Diagnostics</div>
            <ul className="space-y-1.5 rounded-lg border border-border bg-card/40 p-4 text-sm">
              {diagnostics.map((d, i) => (
                <li
                  key={i}
                  className={cn(
                    'flex items-start gap-2',
                    d.severity === 'error' ? 'text-rose-300' : 'text-amber-300',
                  )}
                >
                  <Badge
                    variant={d.severity === 'error' ? 'danger' : 'warning'}
                    className="shrink-0"
                  >
                    {d.code}
                  </Badge>
                  <span>
                    {d.message}
                    {d.file && (
                      <span className="text-muted-foreground">
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
