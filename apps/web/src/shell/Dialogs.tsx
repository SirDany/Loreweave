import type { DumpPayload } from '../lib/lw.js';
import type { AppState } from '../state/useApp.js';
import { BackupsDialog } from '../views/BackupsDialog.js';
import { ComposeLensDialog } from '../views/ComposeLensDialog.js';
import { ExportDialog } from '../views/ExportDialog.js';
import { ImportDialog } from '../views/ImportDialog.js';
import { RenameDialog } from '../views/RenameDialog.js';
import { SagaPicker } from '../views/SagaPicker.js';
import { SearchPanel } from '../views/SearchPanel.js';
import { SettingsDialog } from '../views/SettingsDialog.js';

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
    </>
  );
}
