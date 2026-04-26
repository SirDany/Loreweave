import { Separator } from '../components/ui/separator.js';
import type { DumpEntry, DumpPayload } from '../lib/lw.js';
import { cn } from '../lib/utils.js';
import { getSections } from '../state/sections.js';
import type { Section, Selection } from '../state/types.js';
import { SectionList } from '../views/SectionList.js';

interface GrimoireProps {
  section: Section;
  onSectionChange: (s: Section) => void;
  data: DumpPayload;
  visibleEntries: DumpEntry[];
  selection: Selection | null;
  onSelect: (s: Selection) => void;
  onRename: (entry: DumpEntry) => void;
  onNewCodex?: (type: string) => void;
  onNewTerm?: () => void;
  onNewSigil?: () => void;
  onNewChapter?: () => void;
}

/**
 * The Grimoire — middle column. Top half is the section nav,
 * bottom half is the section-specific list.
 */
export function Grimoire({
  section,
  onSectionChange,
  data,
  visibleEntries,
  selection,
  onSelect,
  onRename,
  onNewCodex,
  onNewTerm,
  onNewSigil,
  onNewChapter,
}: GrimoireProps) {
  const sections = getSections();
  return (
    <nav className="w-80 shrink-0 flex flex-col border-r border-border bg-background/40 overflow-hidden">
      <div className="px-4 pt-5 pb-3">
        <span className="label-rune">Grimoire</span>
        <ul className="mt-2 space-y-0.5">
          {sections.map((s) => {
            const Icon = s.icon;
            const active = section === s.id;
            return (
              <li key={s.id}>
                <button
                  onClick={() => onSectionChange(s.id)}
                  className={cn(
                    'group flex w-full items-center gap-3 rounded-md px-2.5 py-1.5 text-left transition-colors',
                    active
                      ? 'bg-accent text-accent-foreground'
                      : 'text-foreground/80 hover:bg-muted hover:text-foreground',
                  )}
                >
                  <Icon
                    className={cn(
                      'h-4 w-4 shrink-0',
                      active
                        ? 'text-primary'
                        : 'text-muted-foreground group-hover:text-foreground',
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{s.label}</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {s.hint}
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <Separator />

      <div className="flex-1 overflow-auto scrollbar-ember px-4 py-3">
        <SectionList
          section={section}
          data={data}
          visibleEntries={visibleEntries}
          selection={selection}
          onSelect={onSelect}
          onRename={onRename}
          onNewCodex={onNewCodex}
          onNewTerm={onNewTerm}
          onNewSigil={onNewSigil}
          onNewChapter={onNewChapter}
        />
      </div>
    </nav>
  );
}
