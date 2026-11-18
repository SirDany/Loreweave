import { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  fileToBase64,
  runIngest,
  type IngestManifest,
  type IngestUploadFile,
} from '../lib/lw.js';

interface Props {
  sagaPath: string;
  onClose: () => void;
  onHarvested: () => void;
  onOpenAssistant?: (prompt: string) => void;
}

const ALLOWED_EXTS = [
  '.txt',
  '.md',
  '.markdown',
  '.text',
  '.rst',
  '.html',
  '.htm',
  '.json',
  '.yaml',
  '.yml',
  '.pdf',
  '.docx',
];

function isAllowedFile(name: string): boolean {
  const lower = name.toLowerCase();
  return ALLOWED_EXTS.some((ext) => lower.endsWith(ext));
}

function fileDisplayPath(file: File): string {
  const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
  return rel && rel.length > 0 ? rel : file.name;
}

/**
 * Harvest external content into the saga. Upload files or folders,
 * stage them under `.loreweave/ingest/<batch-id>/`, and hand off to Scribe
 * for extraction and conflict resolution.
 */
export function HarvestDialog({
  sagaPath,
  onClose,
  onHarvested,
  onOpenAssistant,
}: Props) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [localPath, setLocalPath] = useState('');
  const [label, setLabel] = useState('harvested-content');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [manifest, setManifest] = useState<IngestManifest | null>(null);

  const selectFiles = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = ALLOWED_EXTS.join(',');
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files && files.length > 0) {
        setSelectedFiles(Array.from(files));
        setErr(null);
        setManifest(null);
      }
    };
    input.click();
  };

  const selectFolder = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    (input as HTMLInputElement & { webkitdirectory?: boolean }).webkitdirectory = true;
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files) return;
      const supported = Array.from(files).filter((f) => isAllowedFile(f.name));
      if (supported.length === 0) {
        setErr(
          `No supported files (${ALLOWED_EXTS.join(', ')}) were found in the selected folder.`,
        );
        return;
      }
      setSelectedFiles(supported);
      setErr(null);
      setManifest(null);
    };
    input.click();
  };

  const canHarvest =
    !busy && (selectedFiles.length > 0 || localPath.trim().length > 0);

  const doHarvest = async () => {
    if (!canHarvest) return;
    setBusy(true);
    setErr(null);
    setManifest(null);
    try {
      const uploaded: IngestUploadFile[] = [];
      for (const file of selectedFiles) {
        const rel = fileDisplayPath(file);
        uploaded.push({
          name: file.name,
          relPath: rel,
          contentBase64: await fileToBase64(file),
        });
      }
      const res = await runIngest({
        sagaRoot: sagaPath,
        label: label.trim() || 'harvested-content',
        files: uploaded,
        paths: localPath.trim() ? [localPath.trim()] : [],
      });
      setManifest(res);
      onHarvested();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const modal = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div
        className="w-full max-w-2xl bg-card/95 border border-border/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-6 py-4 border-b border-border/70 bg-muted/20 flex items-center justify-between">
          <div>
            <div className="text-base font-semibold tracking-tight text-foreground">
              Harvest External Content
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Import text files, documents, or folders and stage them for lore extraction.
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-xs text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted transition-colors"
          >
            esc
          </button>
        </header>

        <div className="p-6 space-y-4 text-sm">
          <label className="block text-xs">
            <span className="text-muted-foreground font-medium">Batch Label</span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="harvested-content"
              className="mt-1 w-full bg-background border border-border rounded-lg px-3 py-2 font-mono text-xs focus:ring-1 focus:ring-primary focus:outline-none transition-colors"
            />
          </label>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-medium">Files or Folder</span>
              {selectedFiles.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedFiles([])}
                  className="text-[11px] hover:text-foreground underline"
                >
                  Clear ({selectedFiles.length})
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={selectFiles}
                disabled={busy}
                className="px-3 py-1.5 rounded-lg border border-primary/50 bg-primary/15 text-primary text-xs font-medium hover:bg-primary/25 disabled:opacity-40 transition-colors"
              >
                Select Files…
              </button>
              <button
                type="button"
                onClick={selectFolder}
                disabled={busy}
                className="px-3 py-1.5 rounded-lg border border-border text-foreground hover:bg-muted text-xs font-medium disabled:opacity-40 transition-colors"
              >
                Select Folder…
              </button>
            </div>
            {selectedFiles.length > 0 && (
              <div className="bg-background border border-border/80 rounded-lg p-2.5 max-h-36 overflow-y-auto space-y-1">
                {selectedFiles.map((file, i) => (
                  <div
                    key={`${fileDisplayPath(file)}:${i}`}
                    className="flex items-center justify-between gap-2 text-xs font-mono"
                  >
                    <span className="truncate">{fileDisplayPath(file)}</span>
                    <span className="text-muted-foreground shrink-0">
                      {(file.size / 1024).toFixed(1)} KB
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <label className="block text-xs">
            <span className="text-muted-foreground font-medium">
              Or Local File / Folder Path (optional)
            </span>
            <input
              value={localPath}
              onChange={(e) => {
                setLocalPath(e.target.value);
                setManifest(null);
              }}
              placeholder="path/to/notes.md or D:\Worldbuilding\Notes"
              className="mt-1 w-full bg-background border border-border rounded-lg px-3 py-2 font-mono text-xs focus:ring-1 focus:ring-primary focus:outline-none transition-colors"
            />
          </label>

          {err && (
            <div className="text-rose-400 text-xs whitespace-pre-wrap font-mono p-3 bg-rose-500/10 rounded-lg border border-rose-500/30">
              {err}
            </div>
          )}

          {manifest && (
            <div className="border border-emerald-500/30 bg-emerald-500/10 rounded-xl p-4 text-xs space-y-2">
              <div className="font-semibold text-emerald-400">
                Staged {manifest.files.length} file{manifest.files.length === 1 ? '' : 's'}
              </div>
              <div className="font-mono text-[11px] text-muted-foreground">
                .loreweave/ingest/{manifest.batchId}
              </div>
              <div className="text-foreground/90">
                Invoke Scribe to analyze the staged files, detect conflicts with canon, and propose draft Codex entries.
              </div>
            </div>
          )}
        </div>

        <footer className="px-6 py-3.5 border-t border-border/70 bg-muted/20 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg border border-border text-foreground hover:bg-muted text-xs font-medium transition-colors"
          >
            {manifest ? 'Done' : 'Cancel'}
          </button>
          {manifest && onOpenAssistant ? (
            <button
              type="button"
              onClick={() =>
                onOpenAssistant(
                  `Analyze the newly staged harvest batch in .loreweave/ingest/${manifest.batchId}/manifest.json. Read the staged files using read_file, extract characters, locations, concepts, terms, and chapter prose, surface any canon conflicts, and use propose_new_entry to draft each new entry starting directly with valid YAML frontmatter (id, type, name, status: draft, and properties.source pointing to the staged file path — never wrap entries in \`\`\`markdown code fences).`,
                )
              }
              className="px-4 py-1.5 rounded-lg border border-primary/50 bg-primary/20 text-primary font-medium hover:bg-primary/30 text-xs transition-colors shadow-sm"
            >
              Analyze with Scribe
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void doHarvest()}
              disabled={!canHarvest}
              className="px-4 py-1.5 rounded-lg border border-primary/50 bg-primary/20 text-primary font-medium hover:bg-primary/30 disabled:opacity-40 text-xs transition-colors shadow-sm"
            >
              {busy ? 'Staging…' : 'Harvest Content'}
            </button>
          )}
        </footer>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modal, document.body)
    : modal;
}
