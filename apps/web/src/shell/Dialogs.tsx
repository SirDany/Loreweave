import type { DumpPayload } from '../lib/lw.js';
import type { AppState } from '../state/useApp.js';
import { BackupsDialog } from '../views/BackupsDialog.js';
import { ComposeLensDialog } from '../views/ComposeLensDialog.js';
import { ExportDialog } from '../views/ExportDialog.js';
import { ImportDialog } from '../views/ImportDialog.js';
import { NewChapterDialog } from '../views/NewChapterDialog.js';
import { NewEntryDialog, type NewEntryKind } from '../views/NewEntryDialog.js';
import { RenameDialog } from '../views/RenameDialog.js';
import { RulesDialog } from '../views/RulesDialog.js';
import { SagaPicker } from '../views/SagaPicker.js';
import { SearchPanel } from '../views/SearchPanel.js';
import { SettingsDialog } from '../views/SettingsDialog.js';
import { addRecentSaga } from '../lib/desktop.js';

interface DialogsProps {
  app: AppState;
  data: DumpPayload;
}

/**
 * Renders whichever dialogs are currently open. Centralizing them
 * here keeps `Shell.tsx` short and makes their open/close wiring
 * uniform.
 */
export function Dialogs({ app, data }: DialogsProps) {
  const {
    saga,
    dialogs,
    closeDialog,
    setSelection,
    pendingRename,
    setPendingRename,
    pendingNew,
    setPendingNew,
    handleJump,
  } = app;

  return (
    <>
      {dialogs.picking && (
        <SagaPicker
          current={saga.sagaPath}
          onPick={(p) => {
            saga.setSagaPath(p);
            setSelection(null);
            closeDialog('picking');
            void addRecentSaga(p, data?.saga?.title ?? undefined);
          }}
          onClose={() => closeDialog('picking')}
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

      {dialogs.exporting && (
        <ExportDialog
          sagaPath={saga.sagaPath}
          data={data}
          onClose={() => closeDialog('exporting')}
        />
      )}

      {dialogs.importing && (
        <ImportDialog
          onClose={() => closeDialog('importing')}
          onImported={(target) => {
            saga.setSagaPath(target);
            setSelection(null);
            closeDialog('importing');
          }}
        />
      )}

      {dialogs.searching && (
        <SearchPanel
          sagaPath={saga.sagaPath}
          onClose={() => closeDialog('searching')}
          onJump={(loc) => {
            handleJump(loc);
            closeDialog('searching');
          }}
        />
      )}

      {dialogs.backups && (
        <BackupsDialog
          sagaPath={saga.sagaPath}
          onClose={() => closeDialog('backups')}
          onRestored={() => {
            void saga.reload();
            closeDialog('backups');
          }}
        />
      )}

      {dialogs.settings && (
        <SettingsDialog onClose={() => closeDialog('settings')} />
      )}

      {dialogs.rules && (
        <RulesDialog
          sagaPath={saga.sagaPath}
          onClose={() => closeDialog('rules')}
        />
      )}

      {dialogs.composing && (
        <ComposeLensDialog
          sagaPath={saga.sagaPath}
          kinds={saga.kinds}
          onClose={() => closeDialog('composing')}
          onCreated={() => {
            void saga.reload();
            closeDialog('composing');
          }}
        />
      )}

      {pendingNew && pendingNew.kind === 'codex' && (
        <NewEntryDialog
          sagaPath={saga.sagaPath}
          kind={pendingNew.type as NewEntryKind}
          onClose={() => setPendingNew(null)}
          onCreated={(_relPath) => {
            void saga.reload();
            // Best-effort jump: we don't yet know the resolved id, but
            // saga.reload() will surface the new draft in the Grimoire.
            setPendingNew(null);
          }}
        />
      )}
      {pendingNew && pendingNew.kind === 'term' && (
        <NewEntryDialog
          sagaPath={saga.sagaPath}
          kind="term"
          onClose={() => setPendingNew(null)}
          onCreated={() => {
            void saga.reload();
            setPendingNew(null);
          }}
        />
      )}
      {pendingNew && pendingNew.kind === 'sigil' && (
        <NewEntryDialog
          sagaPath={saga.sagaPath}
          kind="sigil"
          onClose={() => setPendingNew(null)}
          onCreated={() => {
            void saga.reload();
            setPendingNew(null);
          }}
        />
      )}
      {pendingNew && pendingNew.kind === 'chapter' && (
        <NewChapterDialog
          sagaPath={saga.sagaPath}
          data={data}
          initialTome={pendingNew.tome}
          onClose={() => setPendingNew(null)}
          onCreated={({ tome, slug }) => {
            void saga.reload();
            handleJump({ kind: 'chapter', key: `${tome}::${slug}` });
            setPendingNew(null);
          }}
        />
      )}
    </>
  );
}
