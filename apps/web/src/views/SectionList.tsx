import {
  AlertTriangle,
  BookText,
  Compass,
  Flag,
  GitBranch,
  Lightbulb,
  MapPin,
  Plus,
  Scroll,
  ShieldAlert,
  Sparkles,
  Tag,
  User,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Input } from '../components/ui/input.js';
import type { DumpEntry, DumpPayload } from '../lib/lw.js';
import type { Jumper } from '../lib/saga-helpers.js';
import { cn } from '../lib/utils.js';
import type { Section, Selection } from '../state/types.js';

interface SectionListProps {
  section: Section;
  data: DumpPayload;
  visibleEntries: DumpEntry[];
  selection: Selection | null;
  onSelect: (s: Selection) => void;
  onRename: (entry: DumpEntry) => void;
  onJump?: Jumper;
  /** Codex tab → "new <type>". Type is one of character/location/concept/lore/waypoint. */
  onNewCodex?: (type: string) => void;
  onNewTerm?: () => void;
  onNewSigil?: () => void;
  onNewChapter?: () => void;
}

const CODEX_TYPES: ReadonlyArray<{
  id: 'character' | 'location' | 'concept' | 'lore' | 'waypoint';
  label: string;
  plural: string;
  icon: LucideIcon;
}> = [
  { id: 'character', label: 'Character', plural: 'Characters', icon: User },
  { id: 'location', label: 'Location', plural: 'Locations', icon: MapPin },
  { id: 'concept', label: 'Concept', plural: 'Concepts', icon: Lightbulb },
  { id: 'lore', label: 'Lore', plural: 'Lore', icon: Scroll },
  { id: 'waypoint', label: 'Waypoint', plural: 'Waypoints', icon: Flag },
];

const ICON_FOR_TYPE: Record<string, LucideIcon> = {
  character: User,
  location: MapPin,
  concept: Lightbulb,
  lore: Scroll,
  waypoint: Flag,
  term: BookText,
  sigil: Tag,
};

const STAR_COLOR: Record<string, string> = {
  character: '#fbbf24',
  location: '#34d399',
  concept: '#60a5fa',
  lore: '#a78bfa',
  waypoint: '#f87171',
  term: '#22d3ee',
  sigil: '#f472b6',
};

/**
 * Full-height contextual sidebar directory for the active Grimoire section.
 * Provides deep navigable lists across Story, Codex, Lexicon, Sigils,
 * Chronology, Constellation, Traces, Integrity, and Versions.
 */
export function SectionList({
  section,
  data,
  visibleEntries,
  selection,
  onSelect,
  onRename,
  onJump,
  onNewCodex,
  onNewTerm,
  onNewSigil,
  onNewChapter,
}: SectionListProps) {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<
    'all' | 'character' | 'location' | 'concept' | 'lore' | 'waypoint'
  >('all');

  if (section === 'story') {
    return (
      <div key="story" className="space-y-2.5 animate-panel-enter">
        {onNewChapter && (
          <button
            type="button"
            onClick={onNewChapter}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/80 px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground hover:border-primary/40 interactive-lift"
          >
            <Plus className="h-3.5 w-3.5 text-primary" /> New chapter
          </button>
        )}
        <ul className="space-y-3 text-sm">
          {data.tomes.map((t) => (
            <li key={t.id}>
              <div className="label-rune px-1 font-semibold text-primary/90 flex items-center justify-between">
                <span className="truncate">{t.title}</span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {t.chapters.length}
                </span>
              </div>
              <ul className="mt-1 space-y-0.5">
                {t.chapters.map((c) => {
                  const key = `${t.id}::${c.slug}`;
                  const sel =
                    selection?.kind === 'chapter' && selection.key === key;
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        onClick={() => onSelect({ kind: 'chapter', key })}
                        className={cn(
                          'w-full rounded-lg px-2.5 py-1.5 text-left text-xs font-medium interactive-lift flex items-center justify-between gap-2 border',
                          sel
                            ? 'active-theme-pill font-semibold'
                            : 'hover:bg-muted/60 text-foreground/85 hover:text-foreground border-transparent',
                        )}
                      >
                        <span className="truncate">{c.title}</span>
                        <span className="font-mono text-[10px] opacity-70 shrink-0">
                          {c.refs.length}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (section === 'codex') {
    const haystack = (e: DumpEntry) => {
      const q = search.toLowerCase();
      if (!q) return true;
      if (e.name.toLowerCase().includes(q)) return true;
      if (e.id.toLowerCase().includes(q)) return true;
      return e.aliases.some((a) => a.toLowerCase().includes(q));
    };
    const matchesType = (e: DumpEntry) =>
      activeTab === 'all'
        ? CODEX_TYPES.some((t) => t.id === e.type)
        : e.type === activeTab;
    const filtered = visibleEntries.filter((e) => matchesType(e) && haystack(e));
    const countFor = (
      type: 'all' | 'character' | 'location' | 'concept' | 'lore' | 'waypoint',
    ) =>
      type === 'all'
        ? visibleEntries.filter(
            (e) => CODEX_TYPES.some((t) => t.id === e.type) && haystack(e),
          ).length
        : visibleEntries.filter((e) => e.type === type && haystack(e)).length;
    const newType =
      activeTab === 'all' ? 'character' : (activeTab as 'character');

    return (
      <div key="codex" className="flex flex-col gap-2 animate-panel-enter">
        <Input
          placeholder="Filter by name, id, alias…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-7 text-xs"
        />
        <div className="flex flex-wrap gap-1">
          <CodexChip
            label="All"
            icon={Sparkles}
            count={countFor('all')}
            active={activeTab === 'all'}
            onClick={() => setActiveTab('all')}
          />
          {CODEX_TYPES.map((t) => (
            <CodexChip
              key={t.id}
              label={t.plural}
              icon={t.icon}
              count={countFor(t.id)}
              active={activeTab === t.id}
              onClick={() => setActiveTab(t.id)}
            />
          ))}
        </div>
        {onNewCodex && (
          <button
            type="button"
            onClick={() => onNewCodex(newType)}
            className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-border/80 px-2 py-1 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground hover:border-primary/40 interactive-lift"
          >
            <Plus className="h-3 w-3 text-primary" />
            New {newType}
          </button>
        )}
        <div className="-mx-1">
          <RichEntryList
            items={filtered}
            selection={selection}
            onSelect={onSelect}
            onRename={onRename}
          />
        </div>
      </div>
    );
  }

  if (section === 'threads') {
    const entryKeys = new Set(data.entries.map((e) => `${e.type}/${e.id}`));
    return (
      <div key="threads" className="space-y-3 animate-panel-enter">
        <div className="label-rune px-1">
          Temporal Threads ({data.threads.length})
        </div>
        {data.threads.length === 0 ? (
          <p className="text-xs text-muted-foreground px-1">
            No timeline threads defined yet.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {data.threads.map((t) => (
              <li
                key={t.id}
                className="rounded-lg border border-border/60 bg-card/45 p-2.5 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground truncate">
                    <Compass className="h-3.5 w-3.5 text-primary shrink-0" />
                    {t.id}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {t.waypoints.length} pts
                  </span>
                </div>
                {t.waypoints.length > 0 && (
                  <ul className="space-y-0.5 pl-2 border-l border-border/60">
                    {t.waypoints.map((w) => {
                      const canJump =
                        Boolean(onJump) && entryKeys.has(`waypoint/${w.id}`);
                      return (
                        <li key={w.id}>
                          <button
                            type="button"
                            disabled={!canJump}
                            onClick={() => {
                              if (canJump && onJump) {
                                onJump({ kind: 'entry', key: `waypoint/${w.id}` });
                              }
                            }}
                            className={cn(
                              'w-full flex items-center justify-between gap-1.5 rounded px-1.5 py-1 text-left text-[11px] transition-colors',
                              canJump
                                ? 'text-foreground/85 hover:bg-muted/60 hover:text-primary'
                                : 'text-muted-foreground/80 cursor-default',
                            )}
                          >
                            <span className="truncate">{w.label || w.id}</span>
                            {w.at && (
                              <span className="font-mono text-[9px] text-muted-foreground shrink-0">
                                {w.at}
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (section === 'constellation') {
    const q = search.toLowerCase().trim();
    const starEntries = visibleEntries.filter(
      (e) =>
        !q ||
        e.name.toLowerCase().includes(q) ||
        e.id.toLowerCase().includes(q) ||
        e.type.toLowerCase().includes(q),
    );
    return (
      <div key="constellation" className="flex flex-col gap-2 animate-panel-enter">
        <Input
          placeholder="Find star by name or kind…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-7 text-xs"
        />
        <div className="label-rune px-1">
          Starfield Directory ({starEntries.length})
        </div>
        <ul className="space-y-0.5 -mx-1">
          {starEntries.map((e) => {
            const key = `${e.type}/${e.id}`;
            const color = STAR_COLOR[e.type] ?? '#a78bfa';
            return (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => {
                    if (onJump) {
                      onJump({ kind: 'entry', key });
                    } else {
                      onSelect({ kind: 'entry', key });
                    }
                  }}
                  className="w-full flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-muted/60 text-foreground/85 hover:text-foreground interactive-lift"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{
                        backgroundColor: color,
                        boxShadow: `0 0 6px ${color}`,
                      }}
                    />
                    <span className="truncate font-medium">{e.name}</span>
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground capitalize shrink-0">
                    {e.type}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  if (section === 'traces') {
    const openTraces = data.traces.filter((t) => t.status === 'open');
    return (
      <div key="traces" className="space-y-2.5 animate-panel-enter">
        <div className="flex items-center justify-between px-1">
          <span className="label-rune">Active Traces</span>
          <span className="font-mono text-[10px] text-primary">
            {openTraces.length} open / {data.traces.length}
          </span>
        </div>
        {data.traces.length === 0 ? (
          <p className="text-xs text-muted-foreground px-1">No traces recorded yet.</p>
        ) : (
          <ul className="space-y-1">
            {data.traces.slice(0, 40).map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (!t.target || !onJump) return;
                    if (t.target.startsWith('chapter:')) {
                      onJump({
                        kind: 'chapter',
                        key: t.target.slice('chapter:'.length).replace('/', '::'),
                      });
                    } else {
                      const cleaned = t.target.replace(/^@/, '');
                      if (cleaned.includes('/')) {
                        onJump({ kind: 'entry', key: cleaned });
                      }
                    }
                  }}
                  className="w-full rounded-lg border border-border/50 bg-card/45 px-2.5 py-1.5 text-left hover:border-primary/40 interactive-lift space-y-0.5"
                >
                  <div className="flex items-center justify-between gap-1.5 text-[10px] font-mono">
                    <span className="uppercase text-primary">{t.kind}</span>
                    <span className="text-muted-foreground">{t.status}</span>
                  </div>
                  <p className="text-xs text-foreground/90 line-clamp-2">{t.body}</p>
                  {t.target && (
                    <div className="text-[10px] font-mono text-muted-foreground truncate">
                      → {t.target}
                    </div>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (section === 'integrity') {
    const errors = data.diagnostics.filter((d) => d.severity === 'error');
    const warnings = data.diagnostics.filter((d) => d.severity === 'warning');
    return (
      <div key="integrity" className="space-y-2.5 animate-panel-enter">
        <div className="label-rune px-1">Canon Health Checks</div>
        <div className="grid grid-cols-2 gap-1.5">
          <div className="rounded-lg border border-border/60 bg-card/50 p-2">
            <div className="text-[10px] text-muted-foreground">Errors</div>
            <div className="text-base font-bold text-rose-400">{errors.length}</div>
          </div>
          <div className="rounded-lg border border-border/60 bg-card/50 p-2">
            <div className="text-[10px] text-muted-foreground">Warnings</div>
            <div className="text-base font-bold text-amber-400">{warnings.length}</div>
          </div>
        </div>
        {data.diagnostics.length === 0 ? (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-300 flex items-center gap-2">
            <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
            <span>Zero canon conflicts detected.</span>
          </div>
        ) : (
          <ul className="space-y-1">
            {data.diagnostics.slice(0, 30).map((d, i) => (
              <li
                key={i}
                className="rounded-lg border border-border/60 bg-card/45 p-2 text-[11px] space-y-0.5"
              >
                <div className="flex items-center gap-1.5 font-mono text-[10px]">
                  <AlertTriangle
                    className={cn(
                      'h-3 w-3 shrink-0',
                      d.severity === 'error' ? 'text-rose-400' : 'text-amber-400',
                    )}
                  />
                  <span className="font-semibold text-foreground">{d.code}</span>
                </div>
                <p className="text-muted-foreground line-clamp-2">{d.message}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (section === 'versions') {
    return (
      <div key="versions" className="space-y-2.5 animate-panel-enter">
        <div className="label-rune px-1">Storyline Versioning</div>
        <div className="rounded-lg border border-border/60 bg-card/45 p-3 space-y-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5 font-semibold text-foreground">
            <GitBranch className="h-3.5 w-3.5 text-primary" />
            <span>Automatic Checkpoints</span>
          </div>
          <p className="leading-relaxed">
            Every chapter or Codex edit records a milestone in the background. Switch or spin up alternate storylines from the main canvas.
          </p>
        </div>
      </div>
    );
  }

  const filter: (e: DumpEntry) => boolean =
    section === 'lexicon'
      ? (e) => e.type === 'term'
      : section === 'sigils'
        ? (e) => e.type === 'sigil'
        : () => false;

  const items = visibleEntries.filter(filter);
  const onNew =
    section === 'lexicon' ? onNewTerm : section === 'sigils' ? onNewSigil : null;
  const newLabel = section === 'lexicon' ? 'term' : 'sigil';
  const filteredFlat = items.filter((e) => {
    const q = search.toLowerCase();
    if (!q) return true;
    if (e.name.toLowerCase().includes(q)) return true;
    if (e.id.toLowerCase().includes(q)) return true;
    return e.aliases.some((a) => a.toLowerCase().includes(q));
  });

  if (section !== 'lexicon' && section !== 'sigils' && items.length === 0) {
    return (
      <div key={section} className="space-y-2 animate-panel-enter">
        <div className="label-rune px-1 capitalize">{section}</div>
        <p className="text-xs text-muted-foreground px-1">
          Custom workspace lens active on the main canvas.
        </p>
      </div>
    );
  }

  return (
    <div key={section} className="flex flex-col gap-2 animate-panel-enter">
      <Input
        placeholder="Filter by name, id, alias…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="h-7 text-xs"
      />
      {onNew && (
        <button
          type="button"
          onClick={onNew}
          className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-border/80 px-2 py-1 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground hover:border-primary/40 interactive-lift"
        >
          <Plus className="h-3 w-3 text-primary" /> New {newLabel}
        </button>
      )}
      <div className="-mx-1">
        <RichEntryList
          items={filteredFlat}
          selection={selection}
          onSelect={onSelect}
          onRename={onRename}
        />
      </div>
    </div>
  );
}

interface CodexChipProps {
  label: string;
  icon: LucideIcon;
  count: number;
  active: boolean;
  onClick: () => void;
}

function CodexChip({ label, icon: Icon, count, active, onClick }: CodexChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={cn(
        'flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[11px] font-medium interactive-lift',
        active
          ? 'active-theme-pill font-semibold'
          : 'border-border/80 bg-background/60 hover:bg-muted text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon className="h-3 w-3" />
      <span className="hidden sm:inline">{label}</span>
      <span
        className={cn(
          'rounded px-1 py-0.2 font-mono text-[10px]',
          active ? 'bg-background/20 font-semibold' : 'bg-muted text-muted-foreground',
        )}
      >
        {count}
      </span>
    </button>
  );
}

interface EntryListProps {
  items: DumpEntry[];
  selection: Selection | null;
  onSelect: (s: Selection) => void;
  onRename: (entry: DumpEntry) => void;
}

/**
 * Compact two-line entry row using full-height sidebar allocation cleanly.
 */
function RichEntryList({
  items,
  selection,
  onSelect,
  onRename,
}: EntryListProps) {
  if (items.length === 0) {
    return (
      <div className="px-3 py-5 text-center text-xs italic text-muted-foreground">
        nothing to show
      </div>
    );
  }
  return (
    <ul className="text-sm space-y-0.5">
      {items.map((e) => {
        const key = `${e.type}/${e.id}`;
        const sel = selection?.kind === 'entry' && selection.key === key;
        const Icon = ICON_FOR_TYPE[e.type] ?? Sparkles;
        return (
          <li key={key}>
            <button
              type="button"
              onClick={() => onSelect({ kind: 'entry', key })}
              onContextMenu={(ev) => {
                ev.preventDefault();
                onRename(e);
              }}
              title="Right-click to rename"
              className={cn(
                'group flex w-full items-start gap-2 px-2 py-1.5 rounded-lg text-left interactive-lift border',
                sel
                  ? 'active-theme-pill font-medium'
                  : 'hover:bg-muted/60 text-foreground/85 hover:text-foreground border-transparent',
              )}
            >
              <Icon
                className={cn(
                  'mt-0.5 h-3.5 w-3.5 shrink-0 transition-colors',
                  sel
                    ? 'opacity-100'
                    : 'text-muted-foreground group-hover:text-foreground',
                )}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-medium text-xs">{e.name}</span>
                  {e.status === 'draft' && (
                    <span className="rounded-full border border-amber-500/40 bg-amber-500/15 px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-wider text-amber-300">
                      draft
                    </span>
                  )}
                </div>
                <div className="truncate font-mono text-[10px] opacity-70 mt-0.5">
                  {e.type}/{e.id}
                  {e.aliases.length > 0 && (
                    <span className="ml-1">
                      · {e.aliases.slice(0, 2).join(', ')}
                    </span>
                  )}
                </div>
              </div>
              {e.appears_in && e.appears_in.length > 0 && (
                <span className="shrink-0 self-center font-mono text-[9px] bg-primary/15 rounded px-1.5 py-0.5 border border-primary/25">
                  {e.appears_in.join(',')}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
