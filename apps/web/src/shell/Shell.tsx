import { Bot, GitBranch, Search, Settings, Sparkles } from 'lucide-react';
import { DEMO_SPLASH_DETAIL, IS_DEMO } from '../lib/env.js';
import { gitCommit } from '../lib/lw.js';
import { cn } from '../lib/utils.js';
import { usePanelResize } from '../hooks/usePanelResize.js';
import type { AppState } from '../state/useApp.js';
import { useShortcuts } from '../state/useShortcuts.js';
import { AssistantPanel } from '../views/AssistantPanel.js';
import { DemoBanner } from '../views/DemoBanner.js';
import { ResolvedPanel } from '../views/ResolvedPanel.js';
import { Splash } from '../views/Splash.js';
import { TracesList } from '../views/TracesList.js';
import { UsagesPanel } from '../views/UsagesPanel.js';
import { Dialogs } from './Dialogs.js';
import { Grimoire } from './Grimoire.js';
import { Shelf } from './Shelf.js';
import { Workbench } from './Workbench.js';

interface ShellProps {
  app: AppState;
}

/**
 * Top-level layout: DemoBanner (in demo mode) above a flex row of
 * Shelf | Grimoire | Workbench | ResolvedPanel | ScribePanel,
 * with drag-to-resize handles, auto-persisted widths, and the Dialogs manager.
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
    openDialog,
    setPendingRename,
    setPendingNew,
    handleJump,
    handleJumpToTarget,
  } = app;

  const shelfResize = usePanelResize({
    storageKey: 'lw.panel.shelf',
    defaultWidth: 240,
    minWidth: 180,
    maxWidth: 380,
    growOnRight: true,
  });

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
      />
    );
  }
  if (!saga.data || !catalog) return <Splash message="No Saga data." />;

  const data = saga.data;
  const onSaved = () => {
    void saga.reload();
    if (!IS_DEMO && saga.sagaPath) {
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      gitCommit(saga.sagaPath, `Checkpoint: Saved updates (${timeStr})`).catch(() => {
        // Silent fallback if saga is not git-tracked or working tree clean
      });
    }
  };

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      {IS_DEMO && <DemoBanner />}

      {/* Modern High-Precision Top Workstation Bar */}
      <header className="h-11 border-b border-border/80 bg-card/85 backdrop-blur-md px-4 flex items-center justify-between shrink-0 select-none z-20 transition-colors">
        {/* Left: Saga title & status */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" title="Connected to Loreweave Engine" />
            <span className="font-semibold text-xs sm:text-sm tracking-tight text-foreground truncate max-w-[200px] sm:max-w-xs">
              {data.saga.title ?? data.saga.id}
            </span>
          </div>
          <span className="text-muted-foreground/40 font-mono text-xs">/</span>
          <span className="text-xs font-mono text-muted-foreground capitalize">
            {section}
          </span>
          {saga.tomeLens && (
            <span className="hidden md:inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.2 text-[10px] font-mono text-primary">
              lens: {saga.tomeLens}
            </span>
          )}
        </div>

        {/* Center: Search trigger (Ctrl+K) */}
        <button
          type="button"
          onClick={() => openDialog('searching')}
          className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-lg border border-border/70 bg-background/60 hover:bg-muted/40 hover:border-border text-xs text-muted-foreground transition-all shadow-sm"
        >
          <Search className="h-3.5 w-3.5 text-primary" />
          <span>Search Codex & Stories…</span>
          <kbd className="ml-2 font-mono text-[10px] bg-muted/60 border border-border/70 rounded px-1.5 py-0.2 text-muted-foreground">
            Ctrl K
          </kbd>
        </button>

        {/* Right: Actions, Scribe assistant toggle, Settings */}
        <div className="flex items-center gap-2">
          {/* Quick Versioning / Storylines shortcut */}
          <button
            type="button"
            onClick={() => setSection('versions')}
            className={cn(
              'hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all',
              section === 'versions'
                ? 'border-primary/50 bg-primary/15 text-primary font-semibold'
                : 'border-border/70 bg-background/50 hover:bg-muted/40 text-muted-foreground hover:text-foreground',
            )}
            title="Open Storylines & Checkpoints"
          >
            <GitBranch className="h-3 w-3" />
            <span>Storylines</span>
          </button>

          {/* Scribe Assistant Toggle */}
          <button
            type="button"
            onClick={toggleAssistant}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all shadow-sm',
              assistantOpen
                ? 'bg-primary text-primary-foreground shadow-primary/25 ring-1 ring-primary/40'
                : 'bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20',
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
            className="p-1.5 rounded-lg border border-border/70 bg-background/50 hover:bg-muted/50 hover:border-border text-muted-foreground hover:text-foreground transition-colors"
            title="Settings & Appearance"
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 font-sans text-foreground antialiased bg-background">
        <Shelf
          data={data}
          loading={saga.loading}
          tomeLens={saga.tomeLens}
          onSelectTomeLens={saga.setTomeLens}
          onPickSaga={() => openDialog('picking')}
          onReload={() => void saga.reload()}
          onExport={() => openDialog('exporting')}
          onImport={() => openDialog('importing')}
          onHarvest={() => openDialog('harvesting')}
          onSearch={() => openDialog('searching')}
          onBackups={() => openDialog('backups')}
          onSettings={() => openDialog('settings')}
          onComposeLens={() => openDialog('composing')}
          onRules={() => openDialog('rules')}
          onToggleAssistant={toggleAssistant}
          assistantOpen={assistantOpen}
          width={shelfResize.width}
        />

        {/* Resize handle between Shelf and Grimoire */}
        <div
          onMouseDown={shelfResize.handleMouseDown}
          className="w-1 cursor-col-resize hover:bg-primary/50 active:bg-primary/80 shrink-0 transition-colors z-10 select-none"
          title="Drag to resize Shelf"
        />

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
          className="w-1 cursor-col-resize hover:bg-primary/50 active:bg-primary/80 shrink-0 transition-colors z-10 select-none"
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

        {/* Resize handle between Workbench and ResolvedPanel */}
        <div
          onMouseDown={resolvedResize.handleMouseDown}
          className="w-1 cursor-col-resize hover:bg-primary/50 active:bg-primary/80 shrink-0 transition-colors z-10 select-none"
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

        {assistantOpen && (
          <>
            {/* Resize handle between Inspector and Scribe */}
            <div
              onMouseDown={scribeResize.handleMouseDown}
              className="w-1 cursor-col-resize hover:bg-primary/50 active:bg-primary/80 shrink-0 transition-colors z-10 select-none"
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

        <Dialogs app={app} data={data} />
      </div>
    </div>
  );
}
