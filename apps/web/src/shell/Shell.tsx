import {
  AlertTriangle,
  Bot,
  Check,
  ChevronDown,
  FolderCog,
  Globe,
  Palette,
  PanelRight,
  Search,
  Settings,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AmbientBackground } from '../components/AmbientBackground.js';
import { Badge } from '../components/ui/badge.js';
import { addRecentSaga } from '../lib/desktop.js';
import { DEMO_SPLASH_DETAIL, IS_DEMO } from '../lib/env.js';
import {
  fetchConfig,
  gitCommit,
  listSagas,
  type DiscoveredSaga,
  type DumpPayload,
} from '../lib/lw.js';
import { useSoundEnabled } from '../lib/sound.js';
import { cn } from '../lib/utils.js';
import { usePanelResize } from '../hooks/usePanelResize.js';
import { useSkin } from '../theme/SkinProvider.js';
import { DEFAULT_SAGA } from '../state/useSaga.js';
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
        {/* Left: Top-Left Saga Switcher Dropdown + Section Breadcrumb + Live Telemetry */}
        <div className="flex items-center gap-2 min-w-0 shrink-0">
          <SagaSwitcherMenu
            data={data}
            currentSagaPath={saga.sagaPath}
            tomeLens={saga.tomeLens}
            onSelectTomeLens={saga.setTomeLens}
            onSelectSaga={(path) => {
              saga.setSagaPath(path);
              setSelection(null);
              void addRecentSaga(path);
            }}
            onOpenSettings={() => openDialog('settings')}
          />
          <span className="hidden md:inline text-muted-foreground/40 font-mono text-xs">
            /
          </span>
          <span className="hidden md:inline-flex items-center rounded-md border border-border/70 bg-background/50 px-2 py-0.5 text-[11px] font-mono text-muted-foreground capitalize">
            {section}
          </span>
          <span className="hidden xl:inline-flex items-center rounded-md border border-border/60 bg-background/40 px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
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

function SagaSwitcherMenu({
  data,
  currentSagaPath,
  tomeLens,
  onSelectTomeLens,
  onSelectSaga,
  onOpenSettings,
}: {
  data: DumpPayload;
  currentSagaPath: string;
  tomeLens: string | null;
  onSelectTomeLens: (id: string | null) => void;
  onSelectSaga: (path: string) => void;
  onOpenSettings: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [discovered, setDiscovered] = useState<DiscoveredSaga[]>([]);
  const [discoveryRoot, setDiscoveryRoot] = useState<string>(() =>
    loadDiscoveryRoot(),
  );
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

  useEffect(() => {
    if (!open || IS_DEMO) return;
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
        title={`Current Saga: ${currentSagaPath}`}
      >
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="animate-pulse-ring absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary shadow-sm shadow-primary/60" />
        </span>
        <span className="font-semibold text-xs sm:text-sm tracking-tight text-foreground truncate max-w-[160px] sm:max-w-[210px]">
          {data.saga.title ?? data.saga.id}
        </span>
        {tomeLens && (
          <span className="hidden lg:inline-flex items-center rounded-full border border-primary/35 bg-primary/15 px-2 py-0.2 text-[10px] font-mono text-primary">
            {tomeLens}
          </span>
        )}
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
          className="absolute left-0 top-full mt-2 w-80 rounded-2xl popover-glass p-3.5 shadow-2xl z-[70] animate-modal-pop space-y-3.5"
        >
          {/* Detected Sagas */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="label-rune">Detected Sagas</span>
              <span className="font-mono text-[10px] text-muted-foreground truncate max-w-[150px]">
                {discoveryRoot}
              </span>
            </div>
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
                No Sagas found in <code className="font-mono">{discoveryRoot}</code>.
              </div>
            ) : (
              <ul className="space-y-1 max-h-44 overflow-auto scrollbar-ember">
                {discovered.map((s) => {
                  const active = s.path === currentSagaPath;
                  return (
                    <li key={s.path}>
                      <button
                        type="button"
                        onClick={() => {
                          setOpen(false);
                          if (!active) onSelectSaga(s.path);
                        }}
                        className={cn(
                          'w-full flex items-center justify-between gap-2 rounded-xl border px-2.5 py-2 text-left text-xs transition-all',
                          active
                            ? 'active-theme-pill font-semibold'
                            : 'border-border/60 bg-background/40 hover:bg-muted/50 text-foreground/85 hover:text-foreground',
                        )}
                      >
                        <div className="min-w-0">
                          <div className="truncate">{s.title ?? s.id}</div>
                          <div className="font-mono text-[10px] opacity-75 truncate">
                            {s.path}
                          </div>
                        </div>
                        {active && <Check className="h-3.5 w-3.5 shrink-0" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Tome Lens Filter */}
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Globe className="h-3 w-3 text-primary" />
              <span className="label-rune">Tome Lens</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => onSelectTomeLens(null)}
                className={cn(
                  'rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors',
                  tomeLens === null
                    ? 'active-theme-pill font-semibold'
                    : 'border-border/70 bg-background/40 text-muted-foreground hover:text-foreground',
                )}
              >
                All Tomes
              </button>
              {data.tomes.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onSelectTomeLens(t.id)}
                  className={cn(
                    'rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors',
                    tomeLens === t.id
                      ? 'active-theme-pill font-semibold'
                      : 'border-border/70 bg-background/40 text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t.title}
                </button>
              ))}
            </div>
          </div>

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
              <span>Configure Saga Discovery Path…</span>
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
