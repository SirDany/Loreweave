import { useEffect, useState } from 'react';
import { Editor } from './editor/Editor.js';
import type { RefCatalog } from './editor/ReferenceExtension.js';
import type { DumpChapter, DumpEntry, DumpPayload } from './lib/lw.js';
import { lwWrite } from './lib/lw.js';
import { useSaga } from './state/useSaga.js';
import { BackupsDialog } from './views/BackupsDialog.js';
import { ConstellationView } from './views/ConstellationView.js';
import { EntryEditor } from './views/EntryEditor.js';
import { ExportDialog } from './views/ExportDialog.js';
import { ImportDialog } from './views/ImportDialog.js';
import type { TargetSuggestion } from './views/NewTraceDialog.js';
import { NewTraceDialog } from './views/NewTraceDialog.js';
import { TracesList } from './views/TracesList.js';
import { RenameDialog } from './views/RenameDialog.js';
import { ResolvedPanel } from './views/ResolvedPanel.js';
import { SagaPicker } from './views/SagaPicker.js';
import { SearchPanel } from './views/SearchPanel.js';
import { ThreadView } from './views/ThreadView.js';
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

const SECTIONS: { id: Section; label: string; hint: string }[] = [
  { id: 'story', label: 'Story', hint: 'prose' },
  { id: 'codex', label: 'Codex', hint: 'characters, locations, lore' },
  { id: 'lexicon', label: 'Lexicon', hint: 'terms & slang' },
  { id: 'sigils', label: 'Sigils', hint: 'tags & groups' },
  { id: 'threads', label: 'Threads', hint: 'timelines & waypoints' },
  { id: 'traces', label: 'Traces', hint: 'ideas & todos' },
  { id: 'constellation', label: 'Constellation', hint: 'graph of echoes' },
  { id: 'versions', label: 'Versions', hint: 'git: branches & commits' },
];

export default function App() {
  const saga = useSaga();
  const [section, setSection] = useState<Section>('codex');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [pickingSaga, setPickingSaga] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [searching, setSearching] = useState(false);
  const [showingBackups, setShowingBackups] = useState(false);
  const [pendingRename, setPendingRename] = useState<{
    type: DumpEntry['type'];
    id: string;
    name: string;
  } | null>(null);

  if (saga.loading && !saga.data) {
    return <Splash message="Loading Saga…" />;
  }
  if (saga.error) {
    return (
      <Splash
        message="Failed to load Saga"
        detail={saga.error}
        onRetry={() => void saga.reload()}
      />
    );
  }
  if (!saga.data) return <Splash message="No Saga data." />;

  const data = saga.data;
  const catalog = buildCatalog(data);
  const visibleEntries = applyLens(data.entries, saga.tomeLens);
  const currentEntry =
    selection?.kind === 'entry'
      ? data.entries.find((e) => `${e.type}/${e.id}` === selection.key) ?? null
      : null;
  const currentChapter =
    selection?.kind === 'chapter' ? findChapter(data, selection.key) : null;

  const errors = data.diagnostics.filter((d) => d.severity === 'error').length;
  const warnings = data.diagnostics.filter(
    (d) => d.severity === 'warning'
  ).length;

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

  // Global Ctrl+P / Ctrl+K opens the search palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'k')) {
        e.preventDefault();
        setSearching(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const relatedTraces = currentEntry
    ? data.traces.filter((n) => {
        const t = n.target;
        if (!t) return false;
        const clean = t.replace(/^@/, '');
        return clean === `${currentEntry.type}/${currentEntry.id}`;
      })
    : [];

  const usagesCount = currentEntry
    ? countInbound(currentEntry.type, currentEntry.id, data)
    : 0;

  return (
    <div className="flex h-full font-serif">
      {/* Shelf */}
      <aside className="w-56 bg-stone-900 border-r border-stone-800 p-4 flex flex-col gap-4 shrink-0">
        <div>
          <div className="text-xs uppercase tracking-widest text-stone-500">
            Shelf
          </div>
          <div className="mt-2 text-lg">{data.saga.title ?? data.saga.id}</div>
          <div className="text-xs text-stone-500">{data.saga.id}</div>
          <button
            onClick={() => setPickingSaga(true)}
            className="mt-2 text-xs px-2 py-1 rounded border border-stone-700 hover:bg-stone-800 w-full text-left"
          >
            Open Saga…
          </button>
          <div className="mt-1 grid grid-cols-2 gap-1">
            <button
              onClick={() => setExporting(true)}
              className="text-xs px-2 py-1 rounded border border-stone-700 hover:bg-stone-800"
            >
              Export…
            </button>
            <button
              onClick={() => setImporting(true)}
              className="text-xs px-2 py-1 rounded border border-stone-700 hover:bg-stone-800"
            >
              Import…
            </button>
            <button
              onClick={() => setSearching(true)}
              className="text-xs px-2 py-1 rounded border border-stone-700 hover:bg-stone-800"
              title="Ctrl+P"
            >
              Search…
            </button>
            <button
              onClick={() => setShowingBackups(true)}
              className="text-xs px-2 py-1 rounded border border-stone-700 hover:bg-stone-800"
            >
              Backups…
            </button>
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-widest text-stone-500">
            Tome lens
          </div>
          <ul className="mt-1 space-y-1">
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
        <div className="mt-auto text-xs">
          <div className="text-stone-500 uppercase tracking-widest">Status</div>
          <div className={errors ? 'text-rose-400' : 'text-emerald-400'}>
            {errors} error{errors !== 1 ? 's' : ''}
          </div>
          <div className={warnings ? 'text-amber-400' : 'text-stone-500'}>
            {warnings} warning{warnings !== 1 ? 's' : ''}
          </div>
          <button
            className="mt-2 text-xs px-2 py-1 rounded border border-stone-700 hover:bg-stone-800"
            onClick={() => void saga.reload()}
            disabled={saga.loading}
          >
            {saga.loading ? 'Reloading…' : 'Reload'}
          </button>
        </div>
      </aside>

      {/* Grimoire */}
      <nav className="w-64 bg-stone-900/60 border-r border-stone-800 p-4 shrink-0 overflow-auto">
        <div className="text-xs uppercase tracking-widest text-stone-500">
          Grimoire
        </div>
        <ul className="mt-2 space-y-1">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <button
                className={
                  'w-full text-left px-2 py-1 rounded ' +
                  (section === s.id
                    ? 'bg-amber-800/40 text-amber-100'
                    : 'hover:bg-stone-800')
                }
                onClick={() => setSection(s.id)}
              >
                <div>{s.label}</div>
                <div className="text-xs text-stone-500">{s.hint}</div>
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-6 border-t border-stone-800 pt-4">
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

      {/* Main area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {currentEntry && (
          <EntryView
            entry={currentEntry}
            catalog={catalog}
            sagaPath={saga.sagaPath}
            onSaved={() => void saga.reload()}
            key={selection?.key}
          />
        )}
        {currentChapter && (
          <ChapterView
            chapter={currentChapter}
            catalog={catalog}
            sagaPath={saga.sagaPath}
            onSaved={() => void saga.reload()}
            key={selection?.key}
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
  );
}

// ---------- subcomponents ----------

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
        className={
          'w-full text-left text-sm px-2 py-1 rounded ' +
          (active ? 'bg-amber-800/40 text-amber-100' : 'hover:bg-stone-800')
        }
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
  if (section === 'story') {
    return (
      <ul className="space-y-2 text-sm">
        {data.tomes.map((t) => (
          <li key={t.id}>
            <div className="text-xs uppercase tracking-widest text-stone-500">
              {t.title}
            </div>
            <ul className="mt-1 space-y-0.5">
              {t.chapters.map((c) => {
                const key = `${t.id}::${c.slug}`;
                const sel =
                  selection?.kind === 'chapter' && selection.key === key;
                return (
                  <li key={key}>
                    <button
                      onClick={() => onSelect({ kind: 'chapter', key })}
                      className={
                        'w-full text-left px-2 py-1 rounded ' +
                        (sel
                          ? 'bg-amber-800/40 text-amber-100'
                          : 'hover:bg-stone-800')
                      }
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

  const filter: (e: DumpEntry) => boolean =
    section === 'codex'
      ? (e) =>
          e.type === 'character' ||
          e.type === 'location' ||
          e.type === 'concept' ||
          e.type === 'lore' ||
          e.type === 'waypoint'
      : section === 'lexicon'
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
    <ul className="space-y-0.5 text-sm">
      {items.length === 0 && (
        <li className="text-stone-500 text-xs italic">nothing to show</li>
      )}
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
              className={
                'w-full text-left px-2 py-1 rounded flex items-center justify-between gap-2 ' +
                (sel ? 'bg-amber-800/40 text-amber-100' : 'hover:bg-stone-800')
              }
            >
              <span>{e.name}</span>
              {e.appears_in && e.appears_in.length > 0 && (
                <span className="text-[10px] text-amber-400/80">
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
}: {
  entry: DumpEntry;
  catalog: RefCatalog;
  sagaPath: string;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [renaming, setRenaming] = useState(false);
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <header className="px-6 py-3 border-b border-stone-800 flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="text-xs text-stone-500 truncate">{entry.relPath}</div>
          <div className="text-lg">{entry.name}</div>
        </div>
        <button
          onClick={() => setRenaming(true)}
          className="px-3 py-1 rounded border border-stone-700 text-stone-200 hover:bg-stone-800 text-xs"
        >
          Rename
        </button>
        <button
          onClick={() => setEditing(true)}
          className="px-3 py-1 rounded border border-stone-700 text-stone-200 hover:bg-stone-800 text-xs"
        >
          Edit frontmatter
        </button>
      </header>
      <div className="flex-1 overflow-hidden">
        <Editor value={entry.body} catalog={catalog} readOnly />
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
}: {
  chapter: { tome: string; chapter: DumpChapter };
  catalog: RefCatalog;
  sagaPath: string;
  onSaved: () => void;
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

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <header className="px-6 py-3 border-b border-stone-800 flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="text-xs text-stone-500 truncate">
            {chapter.chapter.relPath}
          </div>
          <div className="text-lg">{chapter.chapter.title}</div>
          <div className="text-xs text-stone-500">
            Tome: {chapter.tome} · {chapter.chapter.refs.length} reference
            {chapter.chapter.refs.length !== 1 ? 's' : ''}
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {status && (
            <span
              className={
                status.startsWith('error')
                  ? 'text-rose-400'
                  : 'text-emerald-400'
              }
            >
              {status}
            </span>
          )}
          {dirty && <span className="text-amber-400">• unsaved</span>}
          <button
            onClick={save}
            disabled={!dirty || saving}
            className={
              'px-3 py-1 rounded border ' +
              (dirty && !saving
                ? 'border-amber-500 bg-amber-900/40 text-amber-100 hover:bg-amber-800/50'
                : 'border-stone-700 text-stone-500')
            }
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </header>
      <div className="flex-1 overflow-hidden">
        <Editor value={draft} catalog={catalog} onChange={setDraft} />
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
    <div className="p-8 text-stone-300 space-y-4 overflow-auto max-w-3xl">
      <h2 className="text-xl text-stone-100">{copy.title}</h2>
      {copy.lines.map((line, i) => (
        <p key={i} className="text-sm">
          {line}
        </p>
      ))}
      {diagnostics.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm uppercase tracking-widest text-stone-500 mb-2">
            Diagnostics
          </h3>
          <ul className="space-y-1 text-sm">
            {diagnostics.map((d, i) => (
              <li
                key={i}
                className={
                  d.severity === 'error' ? 'text-rose-400' : 'text-amber-400'
                }
              >
                <span className="font-mono text-xs">[{d.code}]</span>{' '}
                {d.message}
                {d.file && (
                  <span className="text-stone-500 text-xs">
                    {' '}
                    — {d.file}
                    {d.line ? `:${d.line}` : ''}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
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
    <div className="h-full flex flex-col items-center justify-center text-stone-400 gap-3">
      <div className="text-lg">{message}</div>
      {detail && (
        <pre className="max-w-2xl text-xs text-rose-300 whitespace-pre-wrap bg-stone-900 p-3 rounded border border-stone-800">
          {detail}
        </pre>
      )}
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-sm px-3 py-1 rounded border border-stone-700 hover:bg-stone-800"
        >
          Retry
        </button>
      )}
    </div>
  );
}

// ---------- helpers ----------

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
  // For Lexicon terms, prefer the definition.
  const fm = e.frontmatter as Record<string, unknown>;
  if (e.type === 'term' && typeof fm.definition === 'string') {
    return fm.definition as string;
  }
  // Otherwise, first non-empty prose line.
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
      !e.appears_in || e.appears_in.length === 0 || e.appears_in.includes(tome)
  );
}

function findChapter(
  data: DumpPayload,
  key: string
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

const REF_RE = /@([a-zA-Z]+)\/([a-zA-Z0-9\-_]+)/g;

function countInbound(type: string, id: string, data: DumpPayload): number {
  const needle = `${type}/${id}`;
  let count = 0;
  const bodies: string[] = [];
  for (const e of data.entries)
    if (!(e.type === type && e.id === id)) bodies.push(e.body);
  for (const t of data.tomes) for (const c of t.chapters) bodies.push(c.body);
  for (const b of bodies) {
    for (const m of b.matchAll(REF_RE)) {
      if (`${m[1]}/${m[2]}` === needle) count++;
    }
  }
  return count;
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
      <header className="px-6 py-3 border-b border-stone-800 flex items-center gap-3">
        <div className="text-lg">Traces</div>
        <div className="flex gap-1 text-xs">
          {(['all', 'open', 'todo', 'idea', 'question'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={
                'px-2 py-1 rounded border ' +
                (filter === f
                  ? 'border-amber-500 bg-amber-800/40 text-amber-100'
                  : 'border-stone-700 hover:bg-stone-800')
              }
            >
              {f} ({counts[f]})
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <button
          onClick={() => setCreating(true)}
          className="text-xs px-3 py-1 rounded bg-amber-700 hover:bg-amber-600 text-amber-50"
        >
          + New trace
        </button>
      </header>
      <div className="flex-1 overflow-auto p-6">
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
