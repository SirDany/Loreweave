import { useState } from 'react';
import { lwDelete } from '../lib/lw.js';

interface Props {
  sagaPath: string;
  relPath: string;
  label: string;
  recursive?: boolean;
  onClose: () => void;
  onDeleted: () => void;
}

/**
 * Confirmation modal used by the CRUD UI. Routes to `/lw/delete`,
 * which honors the storage adapter's safeJoin so a hostile relPath
 * cannot reach `..`. The caller decides whether the target is a file
 * or a non-empty directory and passes `recursive` accordingly.
 */
export function ConfirmDeleteDialog({
  sagaPath,
  relPath,
  label,
  recursive,
  onClose,
  onDeleted,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      await lwDelete(sagaPath, relPath, { recursive });
      onDeleted();
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-card border border-border rounded shadow-xl w-[28rem] max-w-full p-4 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-serif">Delete {label}?</h2>
        <p className="text-sm text-muted-foreground">
          This removes <span className="font-mono text-foreground/90">{relPath}</span>{' '}
          from disk. Any remaining references across chapters or entries will automatically
          be surfaced as loose ends in the <strong className="text-foreground">Integrity</strong> tab for review.
        </p>
        {err && (
          <div className="text-xs text-rose-400 whitespace-pre-wrap">{err}</div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="rounded border border-border px-3 py-1.5 text-sm hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={() => void run()}
            disabled={busy}
            className="rounded bg-rose-700 px-3 py-1.5 text-sm text-white hover:bg-rose-600 disabled:opacity-50"
          >
            {busy ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
