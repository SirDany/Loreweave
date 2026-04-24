import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Bookmark,
  Bot,
  Compass,
  Database,
  FileText,
  GitBranch,
  Globe,
  Inbox,
  Library,
  Network,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  Tags,
  Upload,
  Waypoints,
} from 'lucide-react';
import { Badge } from './components/ui/badge.js';
import { Button } from './components/ui/button.js';
import { Input } from './components/ui/input.js';
import { Separator } from './components/ui/separator.js';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from './components/ui/tabs.js';
import { cn } from './lib/utils.js';
import { Editor } from './editor/LazyEditor.js';
import type { RefCatalog } from './editor/ReferenceExtension.js';
import type { DumpChapter, DumpEntry, DumpPayload } from './lib/lw.js';
import { lwWrite } from './lib/lw.js';
import { useSaga } from './state/useSaga.js';
import type { ChatContextAttachment } from './state/useChat.js';
import { AssistantPanel } from './views/AssistantPanel.js';
import { BackupsDialog } from './views/BackupsDialog.js';
import { ConstellationView } from './views/ConstellationView.js';
import { EntryEditor } from './views/EntryEditor.js';
import { ExportDialog } from './views/ExportDialog.js';
import { ImportDialog } from './views/ImportDialog.js';
import type { TargetSuggestion } from './views/NewTraceDialog.js';
import { NewTraceDialog } from './views/NewTraceDialog.js';
import { RenameDialog } from './views/RenameDialog.js';
import { ResolvedPanel } from './views/ResolvedPanel.js';
import { SagaPicker } from './views/SagaPicker.js';
import { SearchPanel } from './views/SearchPanel.js';
import { ThreadView } from './views/ThreadView.js';
import { TracesList } from './views/TracesList.js';
import { UsagesPanel } from './views/UsagesPanel.js';
import { VersionsPanel } from './views/VersionsPanel.js';

type Section =
  | 'story'
  | 'codex'
  | 'lexicon'
  | 'sigils'
  | 'threads'
  | 'traces'
  | 'constellation'
  | 'versions';

interface Selection {
  kind: 'entry' | 'chapter';
  key: string;
}

const SECTIONS: {
  id: Section;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'story', label: 'Story', hint: 'prose', icon: BookOpen },
  { id: 'codex', label: 'Codex', hint: 'characters, locations, lore', icon: Library },
  { id: 'lexicon', label: 'Lexicon', hint: 'terms & slang', icon: FileText },
  { id: 'sigils', label: 'Sigils', hint: 'tags & groups', icon: Tags },
  { id: 'threads', label: 'Threads', hint: 'timelines & waypoints', icon: Waypoints },
  { id: 'traces', label: 'Traces', hint: 'ideas & todos', icon: Sparkles },
  { id: 'constellation', label: 'Constellation', hint: 'graph of echoes', icon: Network },
  { id: 'versions', label: 'Versions', hint: 'git: branches & commits', icon: GitBranch },
];

/**
 * Build-time flag set by the GitHub Pages workflow (VITE_LW_DEMO=1). When
 * true, the app is running as a static preview with no `/lw` sidecar, so
 * we render a persistent banner and short-circuit the failure splash.
 */
const IS_DEMO = import.meta.env.VITE_LW_DEMO === '1';
const DEMO_SPLASH_DETAIL =
  "This is a static preview of the Loreweave UI hosted on GitHub Pages. The /lw sidecar that reads and writes your Sagas isn't available here — clone the repo and run `pnpm dev`, or open it in a GitHub Codespace, for the full editing experience.";

export default function App() {
  const saga = useSaga();
  const [section, setSection] = useState<Section>('codex');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [pickingSaga, setPickingSaga] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [searching, setSearching] = useState(false);
  const [showingBackups, setShowingBackups] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantSeed, setAssistantSeed] = useState<{
    agent?: string;
    prompt?: string;
    context?: ChatContextAttachment;
  } | null>(null);
  const [pendingRename, setPendingRename] = useState<{
    type: DumpEntry['type'];
    id: string;
    name: string;
  } | null>(null);
  const [storyTab, setStoryTab] = useState<'edit' | 'preview'>('edit');

  // Global Ctrl+P / Ctrl+K opens the search palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'k')) {
        e.preventDefault();
        setSearching(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
        e.preventDefault();
        setAssistantOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (saga.loading && !saga.data) {
    return <Splash message="Loading Saga…" />;
  }
  if (saga.error) {
    return (
      <Splash
        message={
          IS_DEMO ? 'Demo mode — no Saga filesystem available' : 'Failed to load Saga'
        }
        detail={IS_DEMO ? DEMO_SPLASH_DETAIL : saga.error}
        onRetry={IS_DEMO ? undefined : () => void saga.reload()}
      />
    );
  }
  if (!saga.data) return <Splash message="No Saga data." />;

  const data = saga.data;
  const catalog = buildCatalog(data);
  const visibleEntries = applyLens(data.entries, saga.tomeLens);

  const currentEntry =
    selection?.kind === 'entry'
      ? (data.entries.find((e) => `${e.type}/${e.id}` === selection.key) ??
        null)
      : null;
  const currentChapter =
    selection?.kind === 'chapter' ? findChapter(data, selection.key) : null;

  const usagesCount = currentEntry ? getUsagesCount(currentEntry, data) : 0;

  const errors = data.diagnostics.filter((d) => d.severity === 'error').length;
  const warnings = data.diagnostics.filter(
    (d) => d.severity === 'warning',
  ).length;

  const relatedTraces = currentEntry
    ? data.traces.filter((n) => {
        const t = n.target;
        if (!t) return false;
        const clean = t.replace(/^@/, '');
        return clean === `${currentEntry.type}/${currentEntry.id}`;
      })
    : [];

  const handleJump = (loc: {
    kind: 'entry' | 'chapter';
    key: string;
    line?: number;
  }) => {
    setSelection({ kind: loc.kind, key: loc.key });
    if (loc.kind === 'chapter') setSection('story');
    else setSection(entryTypeToSection(loc.key));
  };

  const handleJumpToTarget = (target: string) => {
    if (target.startsWith('chapter:')) {
      const key = target.slice('chapter:'.length).replace('/', '::');
      setSelection({ kind: 'chapter', key });
      setSection('story');
      return;
    }
    if (target.startsWith('tome:')) return;
    if (target === 'saga') return;
    const cleaned = target.replace(/^@/, '');
    setSelection({ kind: 'entry', key: cleaned });
    setSection(entryTypeToSection(cleaned));
  };

  return (
    <div className="flex h-full flex-col">
      {IS_DEMO && <DemoBanner />}
      <div className="flex min-h-0 flex-1 font-serif text-foreground antialiased">
      {/* ---------- Shelf ---------- */}
      <aside className="w-60 shrink-0 flex flex-col gap-5 border-r border-border bg-card/60 px-4 py-5 bg-parchment-grain">
        <div>
          <div className="flex items-center gap-2">
            <Compass className="h-4 w-4 text-primary" />
            <span className="label-rune">Shelf</span>
          </div>
          <div className="mt-2 font-serif text-xl leading-tight text-foreground">
            {data.saga.title ?? data.saga.id}
          </div>
          <div className="font-mono text-[11px] text-muted-foreground truncate">
            {data.saga.id}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 w-full justify-start gap-2"
            onClick={() => setPickingSaga(true)}
          >
            <Database className="h-3.5 w-3.5" />
            Open Saga…
          </Button>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <ShelfAction icon={Upload} label="Export" onClick={() => setExporting(true)} />
            <ShelfAction icon={Inbox} label="Import" onClick={() => setImporting(true)} />
            <ShelfAction
              icon={Search}
              label="Search"
              onClick={() => setSearching(true)}
              title="Ctrl+P"
            />
            <ShelfAction
              icon={Bookmark}
              label="Backups"
              onClick={() => setShowingBackups(true)}
            />
            <ShelfAction
              icon={Bot}
              label={assistantOpen ? 'Hide AI' : 'Assistant'}
              onClick={() => setAssistantOpen((v) => !v)}
              title="Ctrl+Shift+A"
            />
          </div>
        </div>

        <Separator />

        <div>
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary/80" />
            <span className="label-rune">Tome lens</span>
          </div>
          <ul className="mt-2 space-y-0.5">
            <TomeItem
              active={saga.tomeLens === null}
              onClick={() => saga.setTomeLens(null)}
              label="All Tomes"
            />
            {data.tomes.map((t) => (
              <TomeItem
                key={t.id}
                active={saga.tomeLens === t.id}
                onClick={() => saga.setTomeLens(t.id)}
                label={t.title}
              />
            ))}
          </ul>
        </div>

        <div className="mt-auto space-y-2">
          <Separator />
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="label-rune">Status</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge variant={errors ? 'danger' : 'success'}>
              {errors} error{errors !== 1 ? 's' : ''}
            </Badge>
            <Badge variant={warnings ? 'warning' : 'secondary'}>
              {warnings} warn{warnings !== 1 ? 's' : ''}
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
            onClick={() => void saga.reload()}
            disabled={saga.loading}
          >
            <RefreshCw
              className={cn('h-3.5 w-3.5', saga.loading && 'animate-spin')}
            />
            {saga.loading ? 'Reloading…' : 'Reload'}
          </Button>
        </div>
      </aside>

      {/* ---------- Grimoire ---------- */}
      <nav className="w-72 shrink-0 flex flex-col border-r border-border bg-background/40 overflow-hidden">
        <div className="px-4 pt-5 pb-3">
          <span className="label-rune">Grimoire</span>
          <ul className="mt-2 space-y-0.5">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const active = section === s.id;
              return (
                <li key={s.id}>
                  <button
                    onClick={() => setSection(s.id)}
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
            onSelect={setSelection}
            onRename={(e) =>
              setPendingRename({ type: e.type, id: e.id, name: e.name })
            }
          />
        </div>
      </nav>

      {/* ---------- Main area ---------- */}
      <main className="flex-1 flex flex-col overflow-hidden bg-background">
        {currentEntry && (
          <EntryView
            entry={currentEntry}
            catalog={catalog}
            sagaPath={saga.sagaPath}
            onSaved={() => void saga.reload()}
            onAsk={() => {
              setAssistantSeed({
                agent: 'muse',
                prompt: `Tell me about \`@${currentEntry.type}/${currentEntry.id}\`. Read the Codex and list what's established vs. open questions.`,
                context: {
                  path: currentEntry.relPath,
                  likelyRefs: [`${currentEntry.type}/${currentEntry.id}`],
                },
              });
              setAssistantOpen(true);
            }}
            key={selection?.key}
          />
        )}
        {currentChapter && section === 'story' && (
          <div className="border-b border-border bg-card/40">
            <div className="flex px-2 py-1 gap-1">
              <StoryTabButton
                active={storyTab === 'edit'}
                onClick={() => setStoryTab('edit')}
                label="Edit"
              />
              <StoryTabButton
                active={storyTab === 'preview'}
                onClick={() => setStoryTab('preview')}
                label="Preview"
              />
            </div>
          </div>
        )}
        {currentChapter && section === 'story' && storyTab === 'edit' && (
          <ChapterView
            chapter={currentChapter}
            catalog={catalog}
            sagaPath={saga.sagaPath}
            onSaved={() => void saga.reload()}
            onAskAssistant={(action, sel, relPath) => {
              const likelyRefs = Array.from(
                new Set(
                  currentChapter.chapter.refs.map((r) => `${r.type}/${r.id}`),
                ),
              );
              setAssistantSeed({
                agent: action,
                prompt: assistantPromptFor(action),
                context: {
                  selection: sel.text,
                  path: relPath,
                  lines: sel.lines,
                  likelyRefs,
                },
              });
              setAssistantOpen(true);
            }}
            onAsk={() => {
              const likelyRefs = Array.from(
                new Set(
                  currentChapter.chapter.refs.map((r) => `${r.type}/${r.id}`),
                ),
              );
              setAssistantSeed({
                agent: 'muse',
                prompt:
                  'Discuss this chapter with me — structure, pacing, what works, what doesn\'t.',
                context: {
                  path: currentChapter.chapter.relPath,
                  likelyRefs,
                },
              });
              setAssistantOpen(true);
            }}
            onAudit={() => {
              const likelyRefs = Array.from(
                new Set(
                  currentChapter.chapter.refs.map((r) => `${r.type}/${r.id}`),
                ),
              );
              setAssistantSeed({
                agent: 'warden',
                prompt:
                  'Audit this chapter against the Codex: list contradictions, broken @refs, slang misuse, and Thread conflicts. Cite files.',
                context: {
                  path: currentChapter.chapter.relPath,
                  likelyRefs,
                },
              });
              setAssistantOpen(true);
            }}
            key={selection?.key}
          />
        )}
        {currentChapter && section === 'story' && storyTab === 'preview' && (
          <ChapterPreview
            chapter={currentChapter.chapter}
            data={data}
            onJump={handleJump}
          />
        )}
        {!currentEntry && !currentChapter && section === 'threads' && (
          <ThreadView
            data={data}
            sagaPath={saga.sagaPath}
            tomeLens={saga.tomeLens}
          />
        )}
        {!currentEntry && !currentChapter && section === 'traces' && (
          <TracesView
            data={data}
            sagaPath={saga.sagaPath}
            onJump={handleJump}
            onReload={() => void saga.reload()}
          />
        )}
        {!currentEntry && !currentChapter && section === 'versions' && (
          <VersionsPanel
            sagaPath={saga.sagaPath}
            onChanged={() => void saga.reload()}
          />
        )}
        {!currentEntry && !currentChapter && section === 'constellation' && (
          <ConstellationView data={data} onJump={handleJump} />
        )}
        {!currentEntry &&
          !currentChapter &&
          section !== 'threads' &&
          section !== 'traces' &&
          section !== 'versions' &&
          section !== 'constellation' && (
            <EmptyState section={section} diagnostics={data.diagnostics} />
          )}
      </main>

      <ResolvedPanel
        entry={currentEntry}
        sagaPath={saga.sagaPath}
        usagesCount={usagesCount}
        tracesCount={relatedTraces.length}
        usagesContent={
          currentEntry && (
            <UsagesPanel entry={currentEntry} data={data} onJump={handleJump} />
          )
        }
        tracesContent={
          currentEntry && (
            <TracesList
              traces={relatedTraces}
              onJump={(t) => handleJumpToTarget(t)}
            />
          )
        }
      />

      {assistantOpen && (
        <AssistantPanel
          sagaRoot={saga.sagaPath}
          initialAgent={assistantSeed?.agent}
          initialPrompt={assistantSeed?.prompt}
          initialContext={assistantSeed?.context}
          onClose={() => {
            setAssistantOpen(false);
            setAssistantSeed(null);
          }}
          onApplied={() => void saga.reload()}
        />
      )}
      {pickingSaga && (
        <SagaPicker
          current={saga.sagaPath}
          onPick={(p) => {
            saga.setSagaPath(p);
            setSelection(null);
            setPickingSaga(false);
          }}
          onClose={() => setPickingSaga(false)}
        />
      )}

      {pendingRename && (
        <RenameDialog
          sagaPath={saga.sagaPath}
          type={pendingRename.type}
          id={pendingRename.id}
          name={pendingRename.name}
          onClose={() => setPendingRename(null)}
          onRenamed={() => {
            setPendingRename(null);
            void saga.reload();
          }}
        />
      )}

      {exporting && (
        <ExportDialog
          sagaPath={saga.sagaPath}
          data={data}
          onClose={() => setExporting(false)}
        />
      )}

      {importing && (
        <ImportDialog
          onClose={() => setImporting(false)}
          onImported={(target) => {
            saga.setSagaPath(target);
            setSelection(null);
            setImporting(false);
          }}
        />
      )}

      {searching && (
        <SearchPanel
          sagaPath={saga.sagaPath}
          onClose={() => setSearching(false)}
          onJump={(loc) => {
            handleJump(loc);
            setSearching(false);
          }}
        />
      )}

      {showingBackups && (
        <BackupsDialog
          sagaPath={saga.sagaPath}
          onClose={() => setShowingBackups(false)}
          onRestored={() => {
            void saga.reload();
            setShowingBackups(false);
          }}
        />
      )}
      </div>
    </div>
  );
}

function DemoBanner() {
  return (
    <div className="shrink-0 border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-100">
      <span className="font-semibold">Demo preview</span> — the filesystem
      sidecar isn&apos;t available on GitHub Pages, so reads and writes will
      fail. Clone the repo and run{' '}
      <code className="rounded bg-black/30 px-1 font-mono">pnpm dev</code>, or
      open it in a{' '}
      <a
        href="https://github.com/codespaces"
        target="_blank"
        rel="noreferrer"
        className="underline hover:text-white"
      >
        GitHub Codespace
      </a>
      , for the full editing experience.
    </div>
  );
}

// ---------- subcomponents ----------

function ShelfAction({
  icon: Icon,
  label,
  onClick,
  title,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  title?: string;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      className="h-8 justify-start gap-2 px-2 text-xs"
      onClick={onClick}
      title={title}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </Button>
  );
}

function StoryTabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-md px-4 py-1.5 text-xs uppercase tracking-widest transition-colors',
        active
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {label}
    </button>
  );
}

function TomeItem({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <li>
      <button
        onClick={onClick}
        className={cn(
          'w-full rounded-md px-2 py-1 text-left text-sm transition-colors',
          active
            ? 'bg-accent text-accent-foreground'
            : 'text-foreground/85 hover:bg-muted hover:text-foreground',
        )}
      >
        {label}
      </button>
    </li>
  );
}

function SectionList({
  section,
  data,
  visibleEntries,
  selection,
  onSelect,
  onRename,
}: {
  section: Section;
  data: DumpPayload;
  visibleEntries: DumpEntry[];
  selection: Selection | null;
  onSelect: (s: Selection) => void;
  onRename: (entry: DumpEntry) => void;
}) {
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

function EntryList({
  items,
  selection,
  onSelect,
  onRename,
}: {
  items: DumpEntry[];
  selection: Selection | null;
  onSelect: (s: Selection) => void;
  onRename: (entry: DumpEntry) => void;
}) {
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
                sel
                  ? 'bg-accent text-accent-foreground'
                  : 'hover:bg-muted',
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

function EntryView({
  entry,
  catalog,
  sagaPath,
  onSaved,
  onAsk,
}: {
  entry: DumpEntry;
  catalog: RefCatalog;
  sagaPath: string;
  onSaved: () => void;
  onAsk?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(entry.body);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const dirty = draft !== entry.body;

  const save = async () => {
    setSaving(true);
    setStatus(null);
    try {
      await lwWrite(sagaPath, entry.relPath, draft);
      setStatus('saved');
      onSaved();
    } catch (e) {
      setStatus('error: ' + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <header className="px-6 py-3 border-b border-border bg-card/40 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="font-mono text-[11px] text-muted-foreground truncate">
            {entry.relPath}
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <span className="font-serif text-lg">{entry.name}</span>
            <Badge variant="secondary">{entry.type}</Badge>
            {entry.appears_in && entry.appears_in.length > 0 && (
              <Badge variant="default">
                {entry.appears_in.join(', ')}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {status && (
            <span
              className={cn(
                status.startsWith('error')
                  ? 'text-rose-400'
                  : 'text-emerald-400',
              )}
            >
              {status}
            </span>
          )}
          {dirty && <span className="text-amber-400">• unsaved</span>}
          {onAsk && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5"
              onClick={onAsk}
              title="Ask the assistant about this entry"
            >
              <Bot className="h-3.5 w-3.5" />
              Ask
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRenaming(true)}
          >
            Rename
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditing(true)}
          >
            Frontmatter
          </Button>
          <Button
            variant={dirty ? 'default' : 'outline'}
            size="sm"
            onClick={save}
            disabled={!dirty || saving}
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </header>
      <div className="flex-1 overflow-hidden">
        <Editor value={draft} catalog={catalog} onChange={setDraft} />
      </div>
      {editing && (
        <EntryEditor
          entry={entry}
          sagaPath={sagaPath}
          onClose={() => setEditing(false)}
          onSaved={onSaved}
        />
      )}
      {renaming && (
        <RenameDialog
          sagaPath={sagaPath}
          type={entry.type}
          id={entry.id}
          name={entry.name}
          onClose={() => setRenaming(false)}
          onRenamed={() => onSaved()}
        />
      )}
    </div>
  );
}

function ChapterView({
  chapter,
  catalog,
  sagaPath,
  onSaved,
  onAskAssistant,
  onAsk,
  onAudit,
}: {
  chapter: { tome: string; chapter: DumpChapter };
  catalog: RefCatalog;
  sagaPath: string;
  onSaved: () => void;
  onAskAssistant?: (
    action: string,
    selection: { text: string; lines: [number, number] },
    path: string,
  ) => void;
  onAsk?: () => void;
  onAudit?: () => void;
}) {
  const [draft, setDraft] = useState(chapter.chapter.body);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const dirty = draft !== chapter.chapter.body;

  const save = async () => {
    setSaving(true);
    setStatus(null);
    try {
      await lwWrite(sagaPath, chapter.chapter.relPath, draft);
      setStatus('saved');
      onSaved();
    } catch (e) {
      setStatus('error: ' + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const refCount = chapter.chapter.refs.length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <header className="px-6 py-3 border-b border-border bg-card/40 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="font-mono text-[11px] text-muted-foreground truncate">
            {chapter.chapter.relPath}
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <span className="font-serif text-lg">{chapter.chapter.title}</span>
            <Badge variant="secondary">{chapter.tome}</Badge>
            <Badge variant="outline">
              {refCount} echo{refCount !== 1 ? 'es' : ''}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {status && (
            <span
              className={cn(
                status.startsWith('error')
                  ? 'text-rose-400'
                  : 'text-emerald-400',
              )}
            >
              {status}
            </span>
          )}
          {dirty && <span className="text-amber-400">• unsaved</span>}
          {onAsk && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5"
              onClick={onAsk}
              title="Ask the assistant about this chapter"
            >
              <Bot className="h-3.5 w-3.5" />
              Ask
            </Button>
          )}
          {onAudit && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5"
              onClick={onAudit}
              title="Run @warden audit on this chapter"
            >
              <Shield className="h-3.5 w-3.5" />
              Audit
            </Button>
          )}
          <Button
            variant={dirty ? 'default' : 'outline'}
            size="sm"
            onClick={save}
            disabled={!dirty || saving}
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </header>
      <div className="flex-1 overflow-hidden">
        <Editor
          value={draft}
          catalog={catalog}
          onChange={setDraft}
          onAskAssistant={
            onAskAssistant
              ? (action, sel) =>
                  onAskAssistant(action, sel, chapter.chapter.relPath)
              : undefined
          }
        />
      </div>
    </div>
  );
}

function EmptyState({
  section,
  diagnostics,
}: {
  section: Section;
  diagnostics: DumpPayload['diagnostics'];
}) {
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
                    d.severity === 'error'
                      ? 'text-rose-300'
                      : 'text-amber-300',
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

function assistantPromptFor(action: string): string {
  switch (action) {
    case 'scribe':
      return 'Rewrite the selected passage. Honor existing canon; do not invent new facts.';
    case 'warden':
      return 'Does the selected passage contradict anything in the Codex? Check canon and Sigil slang.';
    case 'polisher':
      return 'Polish the selected passage for grammar and flow. Do not change meaning or canon.';
    case 'muse':
    default:
      return 'What should I think about regarding this passage? Offer 2–4 distinct options, each with tradeoffs.';
  }
}

function Splash({
  message,
  detail,
  onRetry,
}: {
  message: string;
  detail?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-4 text-muted-foreground bg-parchment-grain">
      <Compass className="h-10 w-10 text-primary/70 animate-pulse" />
      <div className="font-serif text-xl text-foreground">{message}</div>
      {detail && (
        <pre className="max-w-2xl text-xs text-rose-300 whitespace-pre-wrap rounded-md border border-border bg-card p-3">
          {detail}
        </pre>
      )}
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" />
          Retry
        </Button>
      )}
    </div>
  );
}

// ---------- ChapterPreview ----------

function ChapterPreview({
  chapter,
  data,
  onJump,
}: {
  chapter: DumpChapter;
  data: DumpPayload;
  onJump: (loc: {
    kind: 'entry' | 'chapter';
    key: string;
    line?: number;
  }) => void;
}) {
  const entryMap = new Map(
    data.entries.map((e) => [`${e.type}/${e.id}`, e]),
  );
  const refRe = /@([a-zA-Z]+)\/([a-zA-Z0-9\-_]+)/g;

  function renderInline(line: string): React.ReactNode[] {
    const out: React.ReactNode[] = [];
    let last = 0;
    let idx = 0;
    for (const m of line.matchAll(refRe)) {
      const start = m.index ?? 0;
      if (start > last) out.push(line.slice(last, start));
      const [, type, id] = m;
      const key = `${type}/${id}`;
      const hit = entryMap.get(key);
      if (hit) {
        out.push(
          <button
            key={idx++}
            type="button"
            onClick={() => onJump({ kind: 'entry', key })}
            className="rounded bg-primary/15 px-1 text-primary underline-offset-2 hover:bg-primary/25 hover:underline"
          >
            {hit.name}
          </button>,
        );
      } else {
        out.push(
          <span key={idx++} className="rounded bg-rose-500/15 px-1 text-rose-300">
            {m[0]}
          </span>,
        );
      }
      last = start + m[0].length;
    }
    if (last < line.length) out.push(line.slice(last));
    return out;
  }

  const blocks = chapter.body.split(/\n\n+/).map((block, i) => {
    const trimmed = block.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('# ')) {
      return (
        <h2 key={i} className="font-serif text-2xl text-foreground">
          {renderInline(trimmed.slice(2))}
        </h2>
      );
    }
    if (trimmed.startsWith('## ')) {
      return (
        <h3 key={i} className="font-serif text-xl text-foreground">
          {renderInline(trimmed.slice(3))}
        </h3>
      );
    }
    return (
      <p key={i} className="leading-relaxed">
        {trimmed.split('\n').map((line, j, arr) => (
          <span key={j}>
            {renderInline(line)}
            {j < arr.length - 1 && <br />}
          </span>
        ))}
      </p>
    );
  });

  return (
    <div className="flex-1 overflow-auto scrollbar-ember bg-parchment-grain">
      <article className="mx-auto max-w-2xl px-10 py-12 font-serif text-[1.05rem] text-foreground/90 animate-fade-in">
        <header className="mb-8">
          <div className="label-rune">Chapter</div>
          <h1 className="mt-1 font-serif text-4xl">{chapter.title}</h1>
        </header>
        <div className="space-y-5">{blocks}</div>
      </article>
    </div>
  );
}

// ---------- helpers ----------

const REF_RE = /@([a-zA-Z]+)\/([a-zA-Z0-9\-_]+)/g;

function getUsagesCount(entry: DumpEntry, data: DumpPayload): number {
  const bodies: string[] = [];
  for (const e of data.entries) bodies.push(e.body);
  for (const t of data.tomes) for (const c of t.chapters) bodies.push(c.body);
  const needle = `${entry.type}/${entry.id}`;
  let count = 0;
  for (const body of bodies) {
    for (const m of body.matchAll(REF_RE)) {
      if (`${m[1]}/${m[2]}` === needle) count++;
    }
  }
  return count;
}

function buildCatalog(data: DumpPayload): RefCatalog {
  const sigils = data.entries
    .filter((e) => e.type === 'sigil')
    .map((e) => e.id);
  return {
    entries: data.entries.map((e) => ({
      type: e.type,
      id: e.id,
      name: e.name,
      summary: entrySummary(e),
    })),
    sigils,
  };
}

function entrySummary(e: DumpEntry): string | undefined {
  const fm = e.frontmatter as Record<string, unknown>;
  if (e.type === 'term' && typeof fm.definition === 'string') {
    return fm.definition as string;
  }
  const first = e.body
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !l.startsWith('#'));
  if (first && first.length > 200) return first.slice(0, 200) + '…';
  return first;
}

function applyLens(entries: DumpEntry[], tome: string | null): DumpEntry[] {
  if (!tome) return entries;
  return entries.filter(
    (e) =>
      !e.appears_in || e.appears_in.length === 0 || e.appears_in.includes(tome),
  );
}

function findChapter(
  data: DumpPayload,
  key: string,
): { tome: string; chapter: DumpChapter } | null {
  const [tomeId, slug] = key.split('::');
  const tome = data.tomes.find((t) => t.id === tomeId);
  if (!tome) return null;
  const chapter = tome.chapters.find((c) => c.slug === slug);
  return chapter ? { tome: tome.id, chapter } : null;
}

function entryTypeToSection(key: string): Section {
  const type = key.split('/')[0];
  if (type === 'term') return 'lexicon';
  if (type === 'sigil') return 'sigils';
  return 'codex';
}

function TracesView({
  data,
  sagaPath,
  onJump,
  onReload,
}: {
  data: DumpPayload;
  sagaPath: string;
  onJump: (loc: {
    kind: 'entry' | 'chapter';
    key: string;
    line?: number;
  }) => void;
  onReload: () => void;
}) {
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
              {f}{' '}
              <span className="text-muted-foreground">({counts[f]})</span>
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

function buildTargetSuggestions(data: DumpPayload): TargetSuggestion[] {
  const out: TargetSuggestion[] = [];
  for (const e of data.entries) {
    out.push({
      value: `@${e.type}/${e.id}`,
      label: e.name,
      detail: e.type,
    });
  }
  for (const t of data.tomes) {
    for (const c of t.chapters) {
      out.push({
        value: `chapter:${t.id}/${c.slug}`,
        label: c.title,
        detail: t.title,
      });
    }
  }
  return out;
}
