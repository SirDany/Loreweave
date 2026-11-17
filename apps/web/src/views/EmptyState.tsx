import {
  ArrowRight,
  BookOpen,
  Compass,
  Library,
  Sparkles,
  Tag,
} from 'lucide-react';
import { Badge } from '../components/ui/badge.js';
import type { DumpEntry, DumpPayload } from '../lib/lw.js';
import type { Jumper } from '../lib/saga-helpers.js';
import { cn } from '../lib/utils.js';
import type { Section } from '../state/types.js';

interface EmptyStateProps {
  section: Section;
  diagnostics: DumpPayload['diagnostics'];
  data?: DumpPayload;
  onJump?: Jumper;
}

const COPY: Record<string, { title: string; line: string }> = {
  story: {
    title: 'Story Manuscript',
    line: 'Select any chapter card below or from the left directory to resume drafting.',
  },
  codex: {
    title: 'Lore Codex',
    line: 'Characters, locations, concepts, lore, and waypoints shaping this Saga.',
  },
  lexicon: {
    title: 'Lexicon & Dialect',
    line: 'Idioms, regional terms, and voice markers linked across characters and scenes.',
  },
  sigils: {
    title: 'Sigils & Taxonomy',
    line: 'Categorical tags and slang-group bindings organizing your worldbuilding.',
  },
};

function wordCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function cleanSnippet(body: string): string {
  const line = body
    .split(/\r?\n/)
    .map((l) => l.replace(/^#+\s*/, '').replace(/^[-*]\s+/, '').trim())
    .find((l) => l.length > 0);
  if (!line) return 'No prose yet — click to begin writing.';
  return line.replace(/@([a-z-]+)\/([a-z0-9-]+)/g, '$2');
}

/**
 * Saga Command Overview & Quick-Jump Deck — turns unselected workspaces into
 * high-density telemetry & immediate entry/chapter access cards.
 */
export function EmptyState({ section, diagnostics, data, onJump }: EmptyStateProps) {
  const copy = COPY[section] ?? {
    title: section,
    line: 'Select an item from the directory or pick a quick-access card below.',
  };

  const chapterTotal =
    data?.tomes.reduce((acc, t) => acc + t.chapters.length, 0) ?? 0;
  const codexEntries: DumpEntry[] =
    data?.entries.filter((e) =>
      ['character', 'location', 'concept', 'lore', 'waypoint'].includes(e.type),
    ) ?? [];
  const lexSigilCount =
    data?.entries.filter((e) => e.type === 'term' || e.type === 'sigil').length ?? 0;
  const threadTraceCount =
    (data?.threads.length ?? 0) + (data?.traces.length ?? 0);

  const chapterCards =
    section === 'story' && data
      ? data.tomes.flatMap((t) =>
          t.chapters.map((c) => ({ tome: t.title, tomeId: t.id, chapter: c })),
        )
      : [];

  const entryCards: DumpEntry[] = !data
    ? []
    : section === 'codex'
      ? codexEntries.slice(0, 12)
      : section === 'lexicon'
        ? data.entries.filter((e) => e.type === 'term').slice(0, 12)
        : section === 'sigils'
          ? data.entries.filter((e) => e.type === 'sigil').slice(0, 12)
          : data.entries.slice(0, 9);

  return (
    <div className="flex-1 overflow-auto scrollbar-ember animate-panel-enter">
      <div className="mx-auto max-w-5xl p-5 space-y-4">
        {/* Hero Telemetry Deck */}
        <section className="panel-glass p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1 max-w-xl">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/50 px-2.5 py-0.5 label-rune text-primary">
                <Sparkles className="h-3 w-3" />
                <span>Saga Overview · {copy.title}</span>
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-foreground">
                {data?.saga.title ?? copy.title}
              </h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {copy.line}
              </p>
            </div>

            {/* 4 Live Saga Telemetry Tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full lg:w-auto">
              <TelemetryTile
                icon={BookOpen}
                label="Chapters"
                value={chapterTotal}
                accent="primary"
              />
              <TelemetryTile
                icon={Library}
                label="Codex"
                value={codexEntries.length}
                accent="ring"
              />
              <TelemetryTile
                icon={Tag}
                label="Lexicon / Sigils"
                value={lexSigilCount}
                accent="primary"
              />
              <TelemetryTile
                icon={Compass}
                label="Threads / Traces"
                value={threadTraceCount}
                accent="ring"
              />
            </div>
          </div>
        </section>

        {/* Quick-Access Interactive Cards Grid */}
        {section === 'story' && chapterCards.length > 0 && (
          <section className="space-y-2.5">
            <div className="flex items-center justify-between px-1">
              <h3 className="label-rune">Manuscript Quick-Jump</h3>
              <span className="font-mono text-[11px] text-muted-foreground">
                {chapterCards.length} chapters ready
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {chapterCards.slice(0, 12).map(({ tome, tomeId, chapter }) => {
                const key = `${tomeId}::${chapter.slug}`;
                const words = wordCount(chapter.body);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onJump?.({ kind: 'chapter', key })}
                    className="panel-glass interactive-lift p-3.5 text-left flex flex-col justify-between gap-2.5"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2 text-[10px] font-mono text-primary">
                        <span className="truncate">{tome}</span>
                        <span className="shrink-0 opacity-80">
                          {words}w · {chapter.refs.length} echoes
                        </span>
                      </div>
                      <div className="text-sm font-semibold text-foreground line-clamp-1">
                        {chapter.title}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {cleanSnippet(chapter.body)}
                      </p>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-border/50 text-[11px] font-medium text-primary">
                      <span className="font-mono text-[10px] text-muted-foreground truncate">
                        {chapter.slug}
                      </span>
                      <span className="inline-flex items-center gap-1 shrink-0">
                        Open <ArrowRight className="h-3 w-3" />
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {section !== 'story' && entryCards.length > 0 && (
          <section className="space-y-2.5">
            <div className="flex items-center justify-between px-1">
              <h3 className="label-rune">Quick-Access Entries</h3>
              <span className="font-mono text-[11px] text-muted-foreground">
                {entryCards.length} shown
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {entryCards.map((entry) => {
                const key = `${entry.type}/${entry.id}`;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onJump?.({ kind: 'entry', key })}
                    className="panel-glass interactive-lift p-3.5 text-left flex flex-col justify-between gap-2.5"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="rounded-md border border-border/70 bg-background/50 px-2 py-0.5 text-[10px] font-mono capitalize text-primary">
                          {entry.type}
                        </span>
                        {entry.status && (
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {entry.status}
                          </span>
                        )}
                      </div>
                      <div className="text-sm font-semibold text-foreground line-clamp-1">
                        {entry.name}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {cleanSnippet(entry.body)}
                      </p>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-border/50 text-[11px]">
                      <span className="font-mono text-[10px] text-muted-foreground truncate">
                        {key}
                      </span>
                      <span className="inline-flex items-center gap-1 font-medium text-primary shrink-0">
                        Inspect <ArrowRight className="h-3 w-3" />
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Compact Diagnostics List */}
        {diagnostics.length > 0 && (
          <section className="panel-glass p-4 space-y-2.5">
            <div className="label-rune text-muted-foreground">
              Workspace Diagnostics ({diagnostics.length})
            </div>
            <ul className="space-y-1.5 text-sm">
              {diagnostics.slice(0, 8).map((d, i) => (
                <li
                  key={i}
                  className={cn(
                    'flex items-start gap-2 rounded-lg border border-border/50 bg-background/40 px-2.5 py-1.5',
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
          </section>
        )}
      </div>
    </div>
  );
}

function TelemetryTile({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof BookOpen;
  label: string;
  value: number;
  accent: 'primary' | 'ring';
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/45 px-3 py-2 min-w-[104px]">
      <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <span className="truncate">{label}</span>
        <Icon
          className={cn(
            'h-3 w-3 shrink-0',
            accent === 'primary' ? 'text-primary' : 'text-ring',
          )}
        />
      </div>
      <div className="mt-0.5 text-lg font-bold tracking-tight text-foreground">
        {value}
      </div>
    </div>
  );
}
