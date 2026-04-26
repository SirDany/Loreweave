import { useState } from 'react';
import { Input } from '../components/ui/input.js';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../components/ui/tabs.js';
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
}

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
}: SectionListProps) {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('character');

  if (section === 'story') {
    return (
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
    );
  }

  if (section === 'codex') {
    const types = [
      'character',
      'location',
      'concept',
      'lore',
      'waypoint',
    ] as const;
    const filteredItems = (type: string) =>
      visibleEntries
        .filter((e) => e.type === type)
        .filter((e) => e.name.toLowerCase().includes(search.toLowerCase()));

    return (
      <div className="space-y-3">
        <Input
          placeholder="Search entries…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 text-sm"
        />
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-5 h-8 p-0.5">
            {types.map((type) => (
              <TabsTrigger
                key={type}
                value={type}
                className="text-[10px] px-1 py-0.5 capitalize"
                title={`${type}s`}
              >
                {type[0]}
                <span className="ml-1 text-muted-foreground">
                  {filteredItems(type).length}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
          {types.map((type) => (
            <TabsContent key={type} value={type} className="mt-3">
              <EntryList
                items={filteredItems(type)}
                selection={selection}
                onSelect={onSelect}
                onRename={onRename}
              />
            </TabsContent>
          ))}
        </Tabs>
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
  return (
    <div className="space-y-2">
      <Input
        placeholder="Search…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="h-8 text-sm"
      />
      <EntryList
        items={items.filter((e) =>
          e.name.toLowerCase().includes(search.toLowerCase()),
        )}
        selection={selection}
        onSelect={onSelect}
        onRename={onRename}
      />
    </div>
  );
}

interface EntryListProps {
  items: DumpEntry[];
  selection: Selection | null;
  onSelect: (s: Selection) => void;
  onRename: (entry: DumpEntry) => void;
}

function EntryList({ items, selection, onSelect, onRename }: EntryListProps) {
  if (items.length === 0) {
    return (
      <div className="px-2 py-4 text-center text-xs italic text-muted-foreground">
        nothing to show
      </div>
    );
  }
  return (
    <ul className="space-y-0.5 text-sm">
      {items.map((e) => {
        const key = `${e.type}/${e.id}`;
        const sel = selection?.kind === 'entry' && selection.key === key;
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
                'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left transition-colors',
                sel ? 'bg-accent text-accent-foreground' : 'hover:bg-muted',
              )}
            >
              <span className="truncate">{e.name}</span>
              {e.appears_in && e.appears_in.length > 0 && (
                <span className="shrink-0 font-mono text-[10px] text-primary/80">
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
