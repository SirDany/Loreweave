import { useState } from 'react';
import { isDesktop } from '../lib/desktop.js';

interface Props {
  sagaPath: string;
  onClose: () => void;
  onHarvested: () => void;
}

/**
 * Harvest external content into the saga. Upload files, stage them,
 * and run AI analysis to extract characters, locations, events, etc.
 */
export function HarvestDialog({ sagaPath, onClose, onHarvested }: Props) {
  const [files, setFiles] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const selectFiles = async () => {
    if (!isDesktop()) {
      // Use HTML5 file input for web version
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.accept =
        '.txt,.md,.markdown,.rst,.html,.htm,.json,.yaml,.yml,.pdf,.docx';
      input.onchange = (e) => {
        const files = (e.target as HTMLInputElement).files;
        if (files) {
          const paths = Array.from(files).map((f) => f.name);
          setFiles(paths);
          setErr(null);
        }
      };
      input.click();
      return;
    }
    try {
      // Use Tauri dialog through the bridge
      const selected = await (window as any).__TAURI_INTERNALS__.invoke(
        'select_files',
      );
      setFiles(selected);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const selectFolder = async () => {
    if (!isDesktop()) {
      setErr(
        'Folder selection is only available in the desktop app. Use file selection instead.',
      );
      return;
    }
    try {
      const selected = await (window as any).__TAURI_INTERNALS__.invoke(
        'select_folder',
      );
      if (selected) {
        setFiles([selected]);
        setErr(null);
      }
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const doHarvest = async () => {
    if (files.length === 0) return;
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      // Stage files using the ingest command
      const ingestResult = await fetch('/lw', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          args: ['ingest', sagaPath, ...files, '--label', 'harvested-content'],
        }),
      });
      if (!ingestResult.ok) {
        throw new Error(`Ingest failed: ${ingestResult.status}`);
      }

      // Trigger Harvester agent analysis
      setResult(
        'Files staged successfully. Invoke @harvester to begin interactive analysis and conflict resolution.',
      );
      onHarvested();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className="w-full max-w-2xl bg-card border border-border rounded-lg shadow-2xl">
        <header className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div>
            <div className="text-base text-foreground">
              Harvest External Content
            </div>
            <div className="text-xs text-muted-foreground">
              Import text files, documents, or archives and extract lore into
              your saga.
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            esc
          </button>
        </header>

        <div className="p-5 space-y-4 text-sm">
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">
              Selected files/folders:
            </div>
            <div className="flex gap-2">
              <button
                onClick={selectFiles}
                className="px-3 py-1 bg-primary text-primary-foreground rounded text-xs hover:bg-primary/90"
              >
                Select Files
              </button>
              <button
                onClick={selectFolder}
                className="px-3 py-1 bg-secondary text-secondary-foreground rounded text-xs hover:bg-secondary/90"
              >
                Select Folder
              </button>
            </div>
            {files.length > 0 && (
              <div className="bg-background border border-border rounded p-2 max-h-32 overflow-y-auto">
                {files.map((file, i) => (
                  <div key={i} className="text-xs font-mono">
                    {file}
                  </div>
                ))}
              </div>
            )}
          </div>

          {err && (
            <div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded p-2">
              {err}
            </div>
          )}

          {result && (
            <div className="text-xs text-green-600 bg-green-50 border border-green-200 rounded p-2">
              {result}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <button
              onClick={onClose}
              className="px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={doHarvest}
              disabled={files.length === 0 || busy}
              className="px-3 py-1 bg-primary text-primary-foreground rounded text-xs hover:bg-primary/90 disabled:opacity-50"
            >
              {busy ? 'Harvesting…' : 'Harvest Content'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
