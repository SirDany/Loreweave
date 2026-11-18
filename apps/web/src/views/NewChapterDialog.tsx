import { useState } from 'react';
import { createPortal } from 'react-dom';
import { lwCreate } from '../lib/lw.js';
import { slugify } from '../lib/helpers.js';
import type { DumpPayload } from '../lib/lw.js';

interface Props {
  sagaPath: string;
  data: DumpPayload;
  /** Optional pre-selected tome slug. */
  initialTome?: string;
  onClose: () => void;
  onCreated: (selection: { tome: string; slug: string }) => void;
}

/**
 * Scaffolds a new chapter folder under `tomes/<tome>/story/<NN-slug>/`,
 * writing both `_meta.yaml` and a stub `chapter.md`. Auto-picks the next
 * available ordinal in the chosen tome.
 */
export function NewChapterDialog({
  sagaPath,
  data,
  initialTome,
  onClose,
  onCreated,
}: Props) {
  const [tomeId, setTomeId] = useState(initialTome ?? data.tomes[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [pov, setPov] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const tome = data.tomes.find((t) => t.id === tomeId);
  const slug = slugify(title);
  const nextOrdinal = (tome?.chapters ?? []).reduce(
    (m, c) => Math.max(m, c.ordinal ?? 0),
    0,
  ) + 1;
  const padded = String(nextOrdinal).padStart(2, '0');
  const folder = `tomes/${tomeId}/story/${padded}-${slug}`;
  const canSave =
    tomeId.length > 0 &&
    title.trim().length > 0 &&
    /^[a-z0-9][a-z0-9-]*$/.test(slug) &&
    !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setErr(null);
    try {
      const povList = pov
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const meta = [
        `title: ${JSON.stringify(title.trim())}`,
        `ordinal: ${nextOrdinal}`,
        ...(povList.length > 0 ? [`pov: ${JSON.stringify(povList)}`] : []),
        'status: draft',
        '',
      ].join('\n');
      const stub = [
        `# ${title.trim()}`,
        '',
        '_(stub — write the chapter)_',
        '',
      ].join('\n');
      await lwCreate(sagaPath, `${folder}/_meta.yaml`, meta);
      await lwCreate(sagaPath, `${folder}/chapter.md`, stub);
      onCreated({ tome: tomeId, slug: `${padded}-${slug}` });
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const modal = (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-[100] p-4 animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-card/95 border border-border/80 rounded-2xl shadow-2xl w-[32rem] max-w-full p-5 space-y-3 backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-serif">New Chapter</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <label className="block space-y-1">
          <span className="label-rune">Tome</span>
          <select
            value={tomeId}
            onChange={(e) => setTomeId(e.target.value)}
            className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
          >
            {data.tomes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title ?? t.id}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="label-rune">Title</span>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canSave) void save();
            }}
            className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
            placeholder="Chapter title"
          />
        </label>
        <label className="block space-y-1">
          <span className="label-rune">POV (optional)</span>
          <input
            value={pov}
            onChange={(e) => setPov(e.target.value)}
            className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
            placeholder="@character/aaron"
          />
        </label>
        <div className="font-mono text-[11px] text-muted-foreground">
          {slug ? `→ ${folder}/` : '—'}
        </div>
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
            onClick={() => void save()}
            disabled={!canSave}
            className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
          >
            {saving ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modal, document.body)
    : modal;
}
