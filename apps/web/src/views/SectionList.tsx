import {
  BookText,
  Flag,
  Lightbulb,
  MapPin,
  Plus,
  Scroll,
  Sparkles,
  Tag,
  User,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Input } from '../components/ui/input.js';
import { cn } from '../lib/utils.js';
import type { DumpEntry, DumpPayload } from '../lib/lw.js';
import type { Section, Selection } from '../state/types.js';

interface SectionListProps {
  section: Section;
  data: DumpPayload;
  visibleEntries: DumpEntry[];
  selection: Selection | null;
  onSelect: (s: Selection) => void;
  onRename: (entry: DumpEntry) => void;
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

/**
 * The Grimoire's middle column — renders the appropriate list for the
 * active section. Story shows tomes/chapters, Codex shows tabs by type,
 * Lexicon/Sigils show a flat filter, and the visual sections (Threads,
 * Traces, Versions, Constellation) render nothing here (their content
 * lives in the main pane).
 */
export function SectionList({
  section,
  data,
  visibleEntries,
  selection,
  onSelect,
  onRename,
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
      <div className="space-y-2">
        {onNewChapter && (
          <button
            onClick={onNewChapter}
            className="flex w-full items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Plus className="h-3 w-3" /> New chapter
          </button>
        )}
        <ul className="space-y-3 text-sm">
          {data.tomes.map((t) => (
            <li key={t.id}>
              <div className="label-rune px-1">{t.title}</div>
              <ul className="mt-1 space-y-0.5">
                {t.chapters.map((c) => {
                  const key = `${t.id}::${c.slug}`;
                  const sel =
                    selection?.kind === 'chapter' && selection.key === key;
                  return (
                    <li key={key}>
                      <button
                        onClick={() => onSelect({ kind: 'chapter', key })}
                        className={cn(
                          'w-full rounded-md px-2 py-1 text-left transition-colors',
                          sel
                            ? 'bg-accent text-accent-foreground'
                            : 'hover:bg-muted',
                        )}
                      >
                        {c.title}
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
      activeTab === 'all' ? CODEX_TYPES.some((t) => t.id === e.type) : e.type === activeTab;
    const filtered = visibleEntries.filter((e) => matchesType(e) && haystack(e));
    const countFor = (type: 'all' | 'character' | 'location' | 'concept' | 'lore' | 'waypoint') =>
      type === 'all'
        ? visibleEntries.filter(
            (e) => CODEX_TYPES.some((t) => t.id === e.type) && haystack(e),
          ).length
        : visibleEntries.filter((e) => e.type === type && haystack(e)).length;
    const newType =
      activeTab === 'all' ? 'character' : (activeTab as 'character');

    return (
      <div className="flex flex-col gap-2">
        <Input
          placeholder="Search by name, id, alias…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 text-sm"
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
            onClick={() => onNewCodex(newType)}
            className="flex w-full items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Plus className="h-3 w-3" />
            New {newType}
          </button>
        )}
        <div className="-mx-2">
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

  const filter: (e: DumpEntry) => boolean =
    section === 'lexicon'
      ? (e) => e.type === 'term'
      : section === 'sigils'
        ? (e) => e.type === 'sigil'
        : () => false;

  if (section === 'threads') return null;
  if (section === 'traces') return null;
  if (section === 'versions') return null;
  if (section === 'constellation') return null;

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
  return (
    <div className="flex flex-col gap-2">
      <Input
        placeholder="Search by name, id, alias…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="h-8 text-sm"
      />
      {onNew && (
        <button
          onClick={onNew}
          className="flex w-full items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Plus className="h-3 w-3" /> New {newLabel}
        </button>
      )}
      <div className="-mx-2">
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
      onClick={onClick}
      title={label}
      className={cn(
        'flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors',
        active
          ? 'border-primary/60 bg-primary/15 text-primary-foreground'
          : 'border-border bg-background hover:bg-muted',
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">{label}</span>
      <span
        className={cn(
          'rounded px-1 font-mono text-[10px]',
          active ? 'bg-primary/30' : 'bg-muted text-muted-foreground',
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
 * Two-line entry row: icon + name on top, type · id (and alias hint) below.
 * Bigger touch target than the old single-line tab list. Right-click =
 * rename. The list is scrollable from its parent's overflow container.
 */
function RichEntryList({
  items,
  selection,
  onSelect,
  onRename,
}: EntryListProps) {
  if (items.length === 0) {
    return (
      <div className="px-3 py-6 text-center text-xs italic text-muted-foreground">
        nothing to show
      </div>
    );
  }
  return (
    <ul className="text-sm">
      {items.map((e) => {
        const key = `${e.type}/${e.id}`;
        const sel = selection?.kind === 'entry' && selection.key === key;
        const Icon = ICON_FOR_TYPE[e.type] ?? Sparkles;
        return (
          <li key={key}>
            <button
              onClick={() => onSelect({ kind: 'entry', key })}
              onContextMenu={(ev) => {
                ev.preventDefault();
                onRename(e);
              }}
              title="Right-click to rename"
              className={cn(
                'group flex w-full items-start gap-2 px-2 py-1.5 text-left transition-colors',
                sel
                  ? 'bg-accent text-accent-foreground'
                  : 'hover:bg-muted',
              )}
            >
              <Icon
                className={cn(
                  'mt-0.5 h-4 w-4 shrink-0',
                  sel
                    ? 'text-primary'
                    : 'text-muted-foreground group-hover:text-foreground',
                )}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <span className="truncate">{e.name}</span>
                  {e.status === 'draft' && (
                    <span className="rounded border border-border px-1 py-[1px] font-mono text-[9px] uppercase text-amber-300">
                      draft
                    </span>
                  )}
                </div>
                <div className="truncate font-mono text-[10px] text-muted-foreground/80">
                  {e.type}/{e.id}
                  {e.aliases.length > 0 && (
                    <span className="ml-1 opacity-70">
                      · a.k.a. {e.aliases.slice(0, 2).join(', ')}
                    </span>
                  )}
                </div>
              </div>
              {e.appears_in && e.appears_in.length > 0 && (
                <span className="shrink-0 self-center font-mono text-[10px] text-primary/80">
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
