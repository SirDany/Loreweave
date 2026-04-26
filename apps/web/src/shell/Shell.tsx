import { IS_DEMO, DEMO_SPLASH_DETAIL } from '../lib/env.js';
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
 * Shelf | Grimoire | Workbench | WeavePanel, plus the Assistant
 * overlay and the Dialogs manager.
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
    handleJump,
    handleJumpToTarget,
  } = app;

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
  const onSaved = () => void saga.reload();

  return (
    <div className="flex h-full flex-col">
      {IS_DEMO && <DemoBanner />}
      <div className="flex min-h-0 flex-1 font-serif text-foreground antialiased">
        <Shelf
          data={data}
          loading={saga.loading}
          tomeLens={saga.tomeLens}
          onSelectTomeLens={saga.setTomeLens}
          onPickSaga={() => openDialog('picking')}
          onReload={() => void saga.reload()}
          onExport={() => openDialog('exporting')}
          onImport={() => openDialog('importing')}
          onSearch={() => openDialog('searching')}
          onBackups={() => openDialog('backups')}
          onSettings={() => openDialog('settings')}
          onComposeLens={() => openDialog('composing')}
          onToggleAssistant={toggleAssistant}
          assistantOpen={assistantOpen}
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
          openAssistant={openAssistant}
        />

        <ResolvedPanel
          entry={currentEntry}
          sagaPath={saga.sagaPath}
          usagesCount={usagesCount}
          tracesCount={relatedTraces.length}
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
          <AssistantPanel
            sagaRoot={saga.sagaPath}
            initialAgent={assistantSeed?.agent}
            initialPrompt={assistantSeed?.prompt}
            initialContext={assistantSeed?.context}
            onClose={closeAssistant}
            onApplied={onSaved}
          />
        )}

        <Dialogs app={app} data={data} />
      </div>
    </div>
  );
}
