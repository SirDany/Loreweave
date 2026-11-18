import {
  AlertTriangle,
  BookOpen,
  Bot,
  Check,
  ChevronDown,
  FolderCog,
  Layers,
  Palette,
  PanelRight,
  Plus,
  Search,
  Settings,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AmbientBackground } from '../components/AmbientBackground.js';
import { Badge } from '../components/ui/badge.js';
import { addRecentSaga } from '../lib/desktop.js';
import { DEMO_SPLASH_DETAIL, IS_DEMO } from '../lib/env.js';
import {
  deleteSaga,
  fetchConfig,
  gitCommit,
  listSagas,
  type DiscoveredSaga,
  type DumpEntry,
  type DumpPayload,
} from '../lib/lw.js';
import { useSoundEnabled } from '../lib/sound.js';
import { cn } from '../lib/utils.js';
import { usePanelResize } from '../hooks/usePanelResize.js';
import { useSkin } from '../theme/SkinProvider.js';
import { getSectionCount, getSections } from '../state/sections.js';
import { BUILTIN_SECTIONS, type Section } from '../state/types.js';
import { DEFAULT_SAGA, removeSagaMemory } from '../state/useSaga.js';
import type { AppState } from '../state/useApp.js';
import { useShortcuts } from '../state/useShortcuts.js';
import { AssistantPanel } from '../views/AssistantPanel.js';
import { DemoBanner } from '../views/DemoBanner.js';
import { ResolvedPanel } from '../views/ResolvedPanel.js';
import { Splash } from '../views/Splash.js';
import { TracesList } from '../views/TracesList.js';
import { UsagesPanel } from '../views/UsagesPanel.js';
import { ActionsMenu } from './ActionsMenu.js';
import { Dialogs } from './Dialogs.js';
import { Grimoire } from './Grimoire.js';
import { Workbench } from './Workbench.js';

interface ShellProps {
  app: AppState;
}

const DISCOVERY_ROOT_KEY = 'lw.sagaDiscoveryRoot';

function loadDiscoveryRoot(): string {
  try {
    const raw = localStorage.getItem(DISCOVERY_ROOT_KEY);
    if (raw && raw.trim()) return raw.trim();
  } catch {
    /* ignore */
  }
  return 'sagas';
}

/**
 * Top-level spatial workspace: AmbientBackground behind a floating Command Deck header
 * and floating glass panels (Grimoire | Workbench | ResolvedPanel? | ScribePanel?),
 * with glowing drag-to-resize dividers and centralized Dialogs.
 */
export function Shell({ app }: ShellProps) {
  const {
    saga,
    selectSaga,
    section,
    setSection,
    selection,
    setSelection,
    catalog,
    visibleEntries,
    currentEntry,
    currentChapter,
    usagesCount,
    relatedTraces,
    assistantOpen,
    assistantSeed,
    openAssistant,
    toggleAssistant,
    closeAssistant,
    inspectorOpen,
    toggleInspector,
    openDialog,
    setPendingRename,
    setPendingNew,
    handleJump,
    handleJumpToTarget,
  } = app;

  const grimoireResize = usePanelResize({
    storageKey: 'lw.panel.grimoire',
    defaultWidth: 320,
    minWidth: 220,
    maxWidth: 480,
    growOnRight: true,
  });

  const resolvedResize = usePanelResize({
    storageKey: 'lw.panel.resolved',
    defaultWidth: 320,
    minWidth: 240,
    maxWidth: 500,
    growOnRight: false,
  });

  const scribeResize = usePanelResize({
    storageKey: 'lw.panel.scribe',
    defaultWidth: 420,
    minWidth: 280,
    maxWidth: 700,
    growOnRight: false,
  });

  useShortcuts({
    onSearch: () => openDialog('searching'),
    onToggleAssistant: toggleAssistant,
  });

  const { skin } = useSkin();
  const [soundEnabled, , toggleSound] = useSoundEnabled();

  if (saga.loading && !saga.data) {
    return <Splash message="Loading Saga…" />;
  }
  if (saga.error) {
    return (
      <Splash
        message={
          IS_DEMO
            ? 'Demo mode — no Saga filesystem available'
            : 'Failed to load Saga'
        }
        detail={IS_DEMO ? DEMO_SPLASH_DETAIL : saga.error}
        onRetry={IS_DEMO ? undefined : () => void saga.reload()}
        onResetDefault={
          !IS_DEMO && saga.sagaPath !== DEFAULT_SAGA
            ? () => saga.resetToDefaultSaga()
            : undefined
        }
      />
    );
  }
  if (!saga.data || !catalog) {
    return (
      <Splash
        message="No Saga data."
        onResetDefault={
          saga.sagaPath !== DEFAULT_SAGA
            ? () => saga.resetToDefaultSaga()
            : undefined
        }
      />
    );
  }

  const data = saga.data;
  const chapterCount = data.tomes.reduce((acc, t) => acc + t.chapters.length, 0);
  const onSaved = () => {
    void saga.reload();
    if (!IS_DEMO && saga.sagaPath) {
      const timeStr = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      gitCommit(saga.sagaPath, `Checkpoint: Saved updates (${timeStr})`).catch(
        () => {
          // Silent fallback if saga is not git-tracked or working tree clean
        },
      );
    }
  };

  return (
    <div
      data-skin={skin.id}
      data-archetype={skin.archetype}
      className="relative flex h-full flex-col text-foreground overflow-hidden"
    >
      <AmbientBackground />

      {IS_DEMO && (
        <div className="relative z-20">
          <DemoBanner />
        </div>
      )}

      {saga.switchError && (
        <div className="relative z-30 mx-2 mt-2 flex items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/15 backdrop-blur-md px-4 py-2 text-xs text-amber-200 shadow-lg animate-fade-in">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
            <span className="truncate">{saga.switchError}</span>
          </div>
          <button
            type="button"
            onClick={saga.clearSwitchError}
            className="rounded-md p-1 hover:bg-amber-500/20 text-amber-300"
            title="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Floating Command Deck Header */}
      <header className="relative z-40 mx-1.5 mt-1.5 h-11 header-glass px-3 flex items-center justify-between gap-2.5 shrink-0 select-none">
        {/* Left: Scalable Saga Switcher, Tome Lens Switcher & View/Lens Breadcrumb */}
        <div className="flex items-center gap-1.5 min-w-0 shrink-0">
          <SagaSwitcherMenu
            data={data}
            currentSagaPath={saga.sagaPath}
            onSelectSaga={(path) => {
              selectSaga(path);
              void addRecentSaga(path);
            }}
            onResetDefaultSaga={() => saga.resetToDefaultSaga()}
            onOpenSettings={() => openDialog('settings')}
          />
          <TomeLensMenu
            data={data}
            tomeLens={saga.tomeLens}
            onSelectTomeLens={saga.setTomeLens}
          />
          <span className="hidden md:inline text-muted-foreground/40 font-mono text-xs px-0.5">
            /
          </span>
          <SectionLensMenu
            section={section}
            onSelectSection={setSection}
            data={data}
            visibleEntries={visibleEntries}
            onComposeLens={() => openDialog('composing')}
          />
          <span className="hidden 2xl:inline-flex items-center rounded-md border border-border/60 bg-background/40 px-2 py-0.5 text-[10px] font-mono text-muted-foreground ml-1">
            {data.entries.length} entries · {chapterCount} ch
          </span>
        </div>

        {/* Center: Wide Global Search Bar (Ctrl+K) */}
        <button
          type="button"
          onClick={() => openDialog('searching')}
          className="hidden sm:flex flex-1 min-w-[260px] sm:min-w-[320px] md:min-w-[400px] max-w-lg items-center justify-between gap-3 px-3.5 py-1.5 rounded-xl border border-border/70 bg-background/55 hover:bg-muted/50 text-xs text-muted-foreground hover:text-foreground interactive-lift shadow-sm"
        >
          <span className="flex items-center gap-2.5 min-w-0">
            <Search className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="truncate">Search Codex, Stories &amp; Echoes…</span>
          </span>
          <kbd className="shrink-0 font-mono text-[10px] bg-muted/70 border border-border/70 rounded px-1.5 py-0.5 text-muted-foreground">
            Ctrl K
          </kbd>
        </button>

        {/* Right: Actions, Theme Dropdown, Sound Toggle, Inspector Toggle, Scribe Toggle, Settings */}
        <div className="flex items-center gap-1.5 shrink-0">
          <ActionsMenu
            onExport={() => openDialog('exporting')}
            onImport={() => openDialog('importing')}
            onHarvest={() => openDialog('harvesting')}
            onComposeLens={() => openDialog('composing')}
            onRules={() => openDialog('rules')}
            onReload={() => void saga.reload()}
            loading={saga.loading}
          />

          <ThemeDropdownMenu />

          {/* Sound Effects Toggle */}
          <button
            type="button"
            onClick={() => toggleSound()}
            className={cn(
              'p-1.5 rounded-xl border transition-all duration-200 interactive-lift',
              soundEnabled
                ? 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/20'
                : 'border-border/70 bg-background/50 text-muted-foreground hover:text-foreground hover:bg-muted/50',
            )}
            title={
              soundEnabled
                ? 'UI Sound Effects: On (click to mute)'
                : 'UI Sound Effects: Muted (click to enable)'
            }
            aria-label="Toggle UI Sound Effects"
          >
            {soundEnabled ? (
              <Volume2 className="h-3.5 w-3.5" />
            ) : (
              <VolumeX className="h-3.5 w-3.5" />
            )}
          </button>

          {/* Inspector Toggle */}
          <button
            type="button"
            onClick={toggleInspector}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium interactive-lift shadow-sm border',
              inspectorOpen
                ? 'active-theme-pill font-semibold'
                : 'border-border/70 bg-background/50 text-muted-foreground hover:text-foreground hover:bg-muted/50',
            )}
            title="Toggle Inspector Panel"
          >
            <PanelRight className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Inspector</span>
          </button>

          {/* Scribe Assistant Toggle */}
          <button
            type="button"
            onClick={toggleAssistant}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold interactive-lift shadow-sm',
              assistantOpen
                ? 'bg-primary text-primary-foreground shadow-primary/25 ring-1 ring-primary/40 border border-primary'
                : 'bg-primary/10 border border-primary/35 text-primary hover:bg-primary/20',
            )}
            title="Toggle Scribe AI Assistant"
          >
            <Bot className="h-3.5 w-3.5" />
            <span>Scribe</span>
            <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
          </button>

          {/* Settings Trigger */}
          <button
            type="button"
            onClick={() => openDialog('settings')}
            className="p-1.5 rounded-xl border border-border/70 bg-background/50 hover:bg-muted/50 text-muted-foreground hover:text-foreground interactive-lift"
            title="Settings & Saga Discovery"
            aria-label="Open Settings"
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      {/* Spatial Floating Grid (extra left padding clears the left-edge Radial Grimoire dock) */}
      <div className="relative z-10 flex min-h-0 flex-1 p-1.5 pl-4 gap-1 font-sans text-foreground antialiased overflow-hidden">
        <Grimoire
          section={section}
          onSectionChange={setSection}
          data={data}
          visibleEntries={visibleEntries}
          selection={selection}
          onSelect={setSelection}
          onRename={(e) =>
            setPendingRename({ type: e.type, id: e.id, name: e.name })
          }
          onJump={handleJump}
          onNewCodex={(t) =>
            setPendingNew({
              kind: 'codex',
              type: t as
                | 'character'
                | 'location'
                | 'concept'
                | 'lore'
                | 'waypoint',
            })
          }
          onNewTerm={() => setPendingNew({ kind: 'term' })}
          onNewSigil={() => setPendingNew({ kind: 'sigil' })}
          onNewChapter={() =>
            setPendingNew({ kind: 'chapter', tome: saga.tomeLens ?? undefined })
          }
          width={grimoireResize.width}
        />

        {/* Resize handle between Grimoire and Workbench */}
        <div
          onMouseDown={grimoireResize.handleMouseDown}
          className="resize-handle-pro"
          title="Drag to resize Grimoire"
        />

        <Workbench
          section={section}
          data={data}
          catalog={catalog}
          digest={saga.digest}
          kinds={saga.kinds}
          sagaPath={saga.sagaPath}
          tomeLens={saga.tomeLens}
          currentEntry={currentEntry}
          currentChapter={currentChapter}
          selectionKey={selection?.key}
          onJump={handleJump}
          onSaved={onSaved}
          onDeleted={() => setSelection(null)}
          openAssistant={openAssistant}
        />

        {inspectorOpen && (
          <>
            {/* Resize handle between Workbench and ResolvedPanel */}
            <div
              onMouseDown={resolvedResize.handleMouseDown}
              className="resize-handle-pro"
              title="Drag to resize Inspector"
            />

            <ResolvedPanel
              entry={currentEntry}
              chapter={currentChapter}
              sagaPath={saga.sagaPath}
              usagesCount={usagesCount}
              tracesCount={relatedTraces.length}
              width={resolvedResize.width}
              onJumpRef={(type, id) =>
                handleJump({ kind: 'entry', key: `${type}/${id}` })
              }
              usagesContent={
                currentEntry && (
                  <UsagesPanel
                    entry={currentEntry}
                    data={data}
                    onJump={handleJump}
                  />
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
          </>
        )}

        {assistantOpen && (
          <>
            {/* Resize handle between Inspector/Workbench and Scribe */}
            <div
              onMouseDown={scribeResize.handleMouseDown}
              className="resize-handle-pro"
              title="Drag to resize Scribe"
            />

            <AssistantPanel
              sagaRoot={saga.sagaPath}
              initialPrompt={assistantSeed?.prompt}
              initialContext={assistantSeed?.context}
              onClose={closeAssistant}
              onApplied={onSaved}
              onOpenAiSettings={() => openDialog('settings')}
              width={scribeResize.width}
            />
          </>
        )}
      </div>

      <Dialogs app={app} data={data} />
    </div>
  );
}

// ---------- Header Popover Subcomponents -----------------------------------

function usePopoverClose(
  open: boolean,
  setOpen: (v: boolean) => void,
  ref: React.RefObject<HTMLDivElement | null>,
) {
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, setOpen, ref]);
}

function PopoverSearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-border/70 bg-background/60 pl-8 pr-7 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear filter"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

function SagaSwitcherMenu({
  data,
  currentSagaPath,
  onSelectSaga,
  onResetDefaultSaga,
  onOpenSettings,
}: {
  data: DumpPayload;
  currentSagaPath: string;
  onSelectSaga: (path: string) => void;
  onResetDefaultSaga: () => void;
  onOpenSettings: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [discovered, setDiscovered] = useState<DiscoveredSaga[]>([]);
  const [discoveryRoot, setDiscoveryRoot] = useState<string>(() =>
    loadDiscoveryRoot(),
  );
  const [query, setQuery] = useState('');
  const [pendingDelete, setPendingDelete] = useState<DiscoveredSaga | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  usePopoverClose(open, setOpen, ref);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setPendingDelete(null);
      setDeleteErr(null);
      return;
    }
    if (IS_DEMO) return;
    let cancelled = false;
    setScanning(true);
    fetchConfig()
      .then((cfg) => {
        const root = cfg.sagaRoot?.trim() || loadDiscoveryRoot();
        if (!cancelled) setDiscoveryRoot(root);
        return listSagas(root);
      })
      .catch(() => listSagas(loadDiscoveryRoot()))
      .then((list) => {
        if (!cancelled) setDiscovered(list);
      })
      .catch(() => {
        if (!cancelled) setDiscovered([]);
      })
      .finally(() => {
        if (!cancelled) setScanning(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const filteredSagas = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return discovered;
    return discovered.filter(
      (s) =>
        (s.title ?? '').toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q),
    );
  }, [discovered, query]);

  const handleConfirmDelete = async () => {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    setDeleteErr(null);
    const target = pendingDelete;
    try {
      await deleteSaga(target.path);
      removeSagaMemory(target.path);
      const remaining = discovered.filter((s) => s.path !== target.path);
      setDiscovered(remaining);
      setPendingDelete(null);
      if (target.path === currentSagaPath) {
        setOpen(false);
        const next = remaining[0];
        if (next) onSelectSaga(next.path);
        else onResetDefaultSaga();
      }
    } catch (e) {
      setDeleteErr((e as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  const errors = data.diagnostics.filter((d) => d.severity === 'error').length;
  const warnings = data.diagnostics.filter(
    (d) => d.severity === 'warning',
  ).length;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          'flex items-center gap-2 rounded-xl border border-transparent px-2.5 py-1 text-left transition-all duration-200 hover:bg-muted/40 hover:border-border/70',
          open && 'active-theme-pill',
        )}
        title={`Switch Saga — active: ${data.saga.title ?? data.saga.id}`}
      >
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="animate-pulse-ring absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary shadow-sm shadow-primary/60" />
        </span>
        <span className="font-semibold text-xs sm:text-sm tracking-tight text-foreground truncate max-w-[140px] sm:max-w-[190px]">
          {data.saga.title ?? data.saga.id}
        </span>
        {(errors > 0 || warnings > 0) && (
          <span
            className={cn(
              'hidden sm:inline-flex items-center rounded-full px-1.5 py-0.2 text-[10px] font-mono',
              errors > 0
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                : 'bg-amber-500/15 text-amber-300 border border-amber-500/30',
            )}
          >
            {errors > 0 ? `${errors}E` : `${warnings}W`}
          </span>
        )}
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 shrink-0',
            open && 'rotate-180 text-primary',
          )}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full mt-2 w-80 sm:w-96 rounded-2xl popover-glass p-3.5 shadow-2xl z-[70] animate-modal-pop space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="label-rune">Sagas ({discovered.length})</span>
            <span className="font-mono text-[10px] text-muted-foreground truncate max-w-[160px]">
              {discoveryRoot}
            </span>
          </div>

          {!IS_DEMO && discovered.length > 0 && (
            <PopoverSearchInput
              value={query}
              onChange={setQuery}
              placeholder="Filter sagas…"
            />
          )}

          {IS_DEMO ? (
            <div className="text-xs text-muted-foreground py-1">
              Demo mode — static bundle active.
            </div>
          ) : scanning ? (
            <div className="text-xs text-muted-foreground py-1.5">
              Scanning for Sagas…
            </div>
          ) : discovered.length === 0 ? (
            <div className="text-xs text-muted-foreground py-1">
              No Sagas found in{' '}
              <code className="font-mono">{discoveryRoot}</code>.
            </div>
          ) : filteredSagas.length === 0 ? (
            <div className="text-xs text-muted-foreground italic py-2 px-1">
              No Sagas match "{query}".
            </div>
          ) : (
            <ul className="space-y-1 max-h-64 overflow-auto scrollbar-ember pr-0.5">
              {filteredSagas.map((s) => {
                const active = s.path === currentSagaPath;
                const displayTitle = s.title ?? s.id;
                const showSlug = !!s.title && s.title !== s.id;
                return (
                  <li
                    key={s.path}
                    className={cn(
                      'group flex items-center gap-1.5 rounded-xl border p-1 transition-all',
                      active
                        ? 'active-theme-pill font-semibold'
                        : 'border-border/60 bg-background/40 hover:bg-muted/50 text-foreground/85 hover:text-foreground',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        if (!active) onSelectSaga(s.path);
                      }}
                      className="flex-1 min-w-0 flex items-center justify-between gap-2 px-2 py-1.5 text-left text-xs"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="truncate">{displayTitle}</span>
                        {showSlug && (
                          <span className="rounded border border-border/60 bg-background/40 px-1.5 py-0.2 font-mono text-[10px] opacity-75 shrink-0">
                            {s.id}
                          </span>
                        )}
                      </span>
                      {active && <Check className="h-3.5 w-3.5 shrink-0" />}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteErr(null);
                        setPendingDelete(s);
                      }}
                      title={`Delete "${displayTitle}"`}
                      aria-label={`Delete ${displayTitle}`}
                      className="shrink-0 rounded-lg p-1.5 text-muted-foreground/75 opacity-80 group-hover:opacity-100 hover:bg-rose-500/15 hover:text-rose-400 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {pendingDelete && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 space-y-2 text-xs">
              <p className="text-foreground leading-snug">
                Permanently delete{' '}
                <strong>{pendingDelete.title ?? pendingDelete.id}</strong> and
                all of its files from disk?
              </p>
              {deleteErr && (
                <p className="font-mono text-[11px] text-rose-300">
                  {deleteErr}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPendingDelete(null);
                    setDeleteErr(null);
                  }}
                  disabled={deleting}
                  className="rounded-lg border border-border bg-background/70 px-2.5 py-1 text-[11px] text-foreground hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleConfirmDelete()}
                  disabled={deleting}
                  className="rounded-lg bg-rose-700 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-rose-600 disabled:opacity-50"
                >
                  {deleting ? 'Deleting…' : 'Delete Saga'}
                </button>
              </div>
            </div>
          )}

          {/* Diagnostics & Discovery Path Button */}
          <div className="pt-2 border-t border-border/70 space-y-2.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">Canon Health</span>
              <div className="flex items-center gap-1.5">
                <Badge variant={errors ? 'danger' : 'success'}>
                  {errors} error{errors !== 1 ? 's' : ''}
                </Badge>
                <Badge variant={warnings ? 'warning' : 'secondary'}>
                  {warnings} warn{warnings !== 1 ? 's' : ''}
                </Badge>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onOpenSettings();
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
            >
              <FolderCog className="h-3.5 w-3.5" />
              <span>Manage Sagas &amp; Discovery Path…</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function TomeLensMenu({
  data,
  tomeLens,
  onSelectTomeLens,
}: {
  data: DumpPayload;
  tomeLens: string | null;
  onSelectTomeLens: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  usePopoverClose(open, setOpen, ref);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const activeTome = useMemo(
    () => (tomeLens ? data.tomes.find((t) => t.id === tomeLens) ?? null : null),
    [data.tomes, tomeLens],
  );

  const totalChapters = useMemo(
    () => data.tomes.reduce((sum, t) => sum + t.chapters.length, 0),
    [data.tomes],
  );

  const filteredTomes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data.tomes;
    return data.tomes.filter(
      (t) =>
        t.title.toLowerCase().includes(q) || t.id.toLowerCase().includes(q),
    );
  }, [data.tomes, query]);

  return (
    <div ref={ref} className="relative">
      <div
        className={cn(
          'inline-flex items-center rounded-xl border text-xs transition-all',
          tomeLens
            ? 'border-primary/45 bg-primary/15 text-primary'
            : 'border-border/70 bg-background/50 text-foreground/85 hover:border-primary/40',
          open && 'ring-1 ring-primary/40',
        )}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          title={
            activeTome
              ? `Tome filter: ${activeTome.title} (${activeTome.chapters.length} ch)`
              : 'Filter workspace by Tome'
          }
          className="flex items-center gap-1.5 px-2.5 py-1 font-medium max-w-[160px]"
        >
          <BookOpen className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="truncate">
            {activeTome ? activeTome.title : 'All Tomes'}
          </span>
          <ChevronDown
            className={cn(
              'h-3 w-3 opacity-75 shrink-0 transition-transform duration-200',
              open && 'rotate-180',
            )}
          />
        </button>
        {tomeLens && (
          <button
            type="button"
            onClick={() => onSelectTomeLens(null)}
            title="Clear Tome filter (show All Tomes)"
            aria-label="Clear Tome filter"
            className="pr-2 pl-0.5 py-1 opacity-75 hover:opacity-100"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full mt-2 w-72 rounded-2xl popover-glass p-3 shadow-2xl z-[70] animate-modal-pop space-y-2.5"
        >
          <div className="flex items-center justify-between">
            <span className="label-rune">Tome Filter</span>
            <span className="font-mono text-[10px] text-muted-foreground">
              {data.tomes.length} tome{data.tomes.length === 1 ? '' : 's'}
            </span>
          </div>

          {data.tomes.length > 0 && (
            <PopoverSearchInput
              value={query}
              onChange={setQuery}
              placeholder="Filter tomes…"
            />
          )}

          <div className="space-y-1 max-h-60 overflow-auto scrollbar-ember pr-0.5">
            <button
              type="button"
              onClick={() => {
                onSelectTomeLens(null);
                setOpen(false);
              }}
              className={cn(
                'w-full flex items-center justify-between gap-2 rounded-xl border px-2.5 py-1.5 text-left text-xs transition-colors',
                tomeLens === null
                  ? 'active-theme-pill font-semibold'
                  : 'border-border/60 bg-background/40 hover:bg-muted/50 text-foreground/85',
              )}
            >
              <span className="truncate">All Tomes (Full Saga)</span>
              <span className="flex items-center gap-1.5 shrink-0 font-mono text-[10px] opacity-75">
                <span>{totalChapters} ch</span>
                {tomeLens === null && <Check className="h-3.5 w-3.5" />}
              </span>
            </button>

            {filteredTomes.map((t) => {
              const active = tomeLens === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    onSelectTomeLens(t.id);
                    setOpen(false);
                  }}
                  className={cn(
                    'w-full flex items-center justify-between gap-2 rounded-xl border px-2.5 py-1.5 text-left text-xs transition-colors',
                    active
                      ? 'active-theme-pill font-semibold'
                      : 'border-border/60 bg-background/40 hover:bg-muted/50 text-foreground/85',
                  )}
                >
                  <span className="truncate">{t.title}</span>
                  <span className="flex items-center gap-1.5 shrink-0 font-mono text-[10px] opacity-75">
                    <span>{t.chapters.length} ch</span>
                    {active && <Check className="h-3.5 w-3.5" />}
                  </span>
                </button>
              );
            })}

            {data.tomes.length > 0 && filteredTomes.length === 0 && (
              <div className="px-2 py-2 text-xs text-muted-foreground italic">
                No Tomes match "{query}".
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SectionLensMenu({
  section,
  onSelectSection,
  data,
  visibleEntries,
  onComposeLens,
}: {
  section: Section;
  onSelectSection: (s: Section) => void;
  data: DumpPayload;
  visibleEntries: DumpEntry[];
  onComposeLens: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  usePopoverClose(open, setOpen, ref);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const sections = getSections();
  const activeMeta =
    sections.find((s) => s.id === section) ?? sections[0]!;
  const ActiveIcon = activeMeta.icon;
  const activeCount = getSectionCount(activeMeta.id, data, visibleEntries);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sections;
    return sections.filter(
      (s) =>
        s.label.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        s.hint.toLowerCase().includes(q),
    );
  }, [sections, query]);

  const builtinSet = useMemo(
    () => new Set<string>(BUILTIN_SECTIONS),
    [],
  );
  const coreSections = filtered.filter((s) => builtinSet.has(s.id));
  const customSections = filtered.filter((s) => !builtinSet.has(s.id));

  const renderItem = (s: (typeof sections)[number]) => {
    const Icon = s.icon;
    const active = s.id === section;
    const count = getSectionCount(s.id, data, visibleEntries);
    return (
      <button
        key={s.id}
        type="button"
        onClick={() => {
          onSelectSection(s.id);
          setOpen(false);
        }}
        className={cn(
          'w-full flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left text-xs transition-colors',
          active
            ? 'active-theme-pill font-semibold'
            : 'border-transparent hover:border-border/60 hover:bg-muted/50 text-foreground/85',
        )}
      >
        <Icon className="h-3.5 w-3.5 shrink-0 opacity-85" />
        <div className="flex-1 min-w-0">
          <div className="truncate">{s.label}</div>
          {s.hint && (
            <div className="text-[10px] opacity-70 truncate">{s.hint}</div>
          )}
        </div>
        {count !== null && (
          <span className="font-mono text-[10px] opacity-75 shrink-0">
            {count}
          </span>
        )}
        {active && <Check className="h-3.5 w-3.5 shrink-0" />}
      </button>
    );
  };

  return (
    <div ref={ref} className="relative hidden md:block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`Active view/lens: ${activeMeta.label}`}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-medium transition-all',
          open
            ? 'active-theme-pill'
            : 'border-border/70 bg-background/50 text-foreground/85 hover:border-primary/40 hover:text-foreground',
        )}
      >
        <ActiveIcon className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="truncate max-w-[120px]">{activeMeta.label}</span>
        {activeCount !== null && (
          <span className="font-mono text-[10px] text-muted-foreground">
            {activeCount}
          </span>
        )}
        <ChevronDown
          className={cn(
            'h-3 w-3 opacity-75 shrink-0 transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full mt-2 w-72 rounded-2xl popover-glass p-3 shadow-2xl z-[70] animate-modal-pop space-y-2.5"
        >
          <div className="flex items-center justify-between">
            <span className="label-rune inline-flex items-center gap-1.5">
              <Layers className="h-3 w-3 text-primary" />
              <span>Views &amp; Lenses</span>
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">
              {sections.length}
            </span>
          </div>

          <PopoverSearchInput
            value={query}
            onChange={setQuery}
            placeholder="Filter views & lenses…"
          />

          <div className="space-y-2 max-h-72 overflow-auto scrollbar-ember pr-0.5">
            {coreSections.length > 0 && (
              <div className="space-y-0.5">
                <div className="px-1.5 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                  Core Views
                </div>
                {coreSections.map(renderItem)}
              </div>
            )}

            {customSections.length > 0 && (
              <div className="space-y-0.5 pt-1 border-t border-border/50">
                <div className="px-1.5 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                  Custom Saga Lenses
                </div>
                {customSections.map(renderItem)}
              </div>
            )}

            {filtered.length === 0 && (
              <div className="px-2 py-2 text-xs text-muted-foreground italic">
                No views match "{query}".
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-border/70">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onComposeLens();
              }}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Compose New Lens…</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ThemeDropdownMenu() {
  const { skin, available, setSkinId } = useSkin();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`Active theme: ${skin.name} (${skin.archetype})`}
        className={cn(
          'flex items-center gap-2 rounded-xl border border-border/70 bg-background/50 px-2.5 py-1.5 text-xs font-medium interactive-lift text-foreground/90 hover:text-foreground',
          open && 'active-theme-pill',
        )}
      >
        <span
          className="h-2.5 w-2.5 rounded-full border border-white/25 shrink-0"
          style={{
            backgroundColor: `hsl(${skin.tokens.primary})`,
          }}
        />
        <Palette className="h-3.5 w-3.5 hidden sm:inline shrink-0" />
        <span className="hidden md:inline max-w-[125px] truncate">{skin.name}</span>
        <ChevronDown
          className={cn(
            'h-3 w-3 opacity-75 transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-80 rounded-2xl popover-glass p-2.5 shadow-2xl z-[70] animate-modal-pop space-y-2.5"
        >
          <div className="space-y-1">
            <div className="px-1.5 py-0.5 label-rune">Theme Archetype</div>
            {available.map((s) => {
              const active = s.id === skin.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setSkinId(s.id);
                    setOpen(false);
                  }}
                  className={cn(
                    'w-full flex items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-all interactive-lift',
                    active
                      ? 'active-theme-pill font-semibold'
                      : 'border-transparent hover:bg-muted/50 text-foreground/85',
                  )}
                >
                  <div className="flex h-7 w-10 shrink-0 overflow-hidden rounded-lg border border-border/80 shadow-inner">
                    <div
                      className="flex-1"
                      style={{ background: `hsl(${s.tokens.background})` }}
                    />
                    <div
                      className="flex-1"
                      style={{ background: `hsl(${s.tokens.primary})` }}
                    />
                    <div
                      className="flex-1"
                      style={{ background: `hsl(${s.tokens.ring})` }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1.5 text-xs">
                      <span className="truncate">{s.name}</span>
                      <span
                        className={cn(
                          'rounded px-1.5 py-[1px] font-mono text-[9px] shrink-0 border',
                          active
                            ? 'border-current/35 bg-background/15'
                            : 'border-border/70 bg-background/50 text-muted-foreground',
                        )}
                      >
                        {s.archetype}
                      </span>
                    </div>
                    <div className="text-[10px] opacity-75 truncate mt-0.5">
                      {s.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
