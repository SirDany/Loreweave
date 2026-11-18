import { useState } from 'react';
import { createPortal } from 'react-dom';
import { lwCreate } from '../lib/lw.js';
import { slugify } from '../lib/helpers.js';

export type NewEntryKind =
  | 'character'
  | 'location'
  | 'concept'
  | 'lore'
  | 'waypoint'
  | 'term'
  | 'sigil';

interface Props {
  sagaPath: string;
  kind: NewEntryKind;
  onClose: () => void;
  onCreated: (relPath: string) => void;
}

const SUBDIR: Record<NewEntryKind, string> = {
  character: 'codex/characters',
  location: 'codex/locations',
  concept: 'codex/concepts',
  lore: 'codex/lore',
  waypoint: 'codex/waypoints',
  term: 'lexicon',
  sigil: 'sigils',
};

const TYPE_FOR: Record<NewEntryKind, string> = {
  character: 'character',
  location: 'location',
  concept: 'concept',
  lore: 'lore',
  waypoint: 'waypoint',
  term: 'term',
  sigil: 'sigil',
};

const LABEL: Record<NewEntryKind, string> = {
  character: 'Character',
  location: 'Location',
  concept: 'Concept',
  lore: 'Lore',
  waypoint: 'Waypoint',
  term: 'Lexicon term',
  sigil: 'Sigil',
};

/**
 * Lightweight dialog for scaffolding a new Codex / Lexicon / Sigil entry.
 * Builds a frontmatter stub with `status: draft` and the right `type`,
 * writes it through `/lw/create` (which 409s on a name collision), then
 * tells the parent to reload + jump to the new entry.
 */
export function NewEntryDialog({ sagaPath, kind, onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const id = slugify(name);
  const canSave =
    name.trim().length > 0 && /^[a-z0-9][a-z0-9-]*$/.test(id) && !saving;
  const relPath = `${SUBDIR[kind]}/${id}.md`;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setErr(null);
    try {
      const fm = [
        '---',
        `id: ${id}`,
        `type: ${TYPE_FOR[kind]}`,
        `name: ${JSON.stringify(name.trim())}`,
        ...(kind === 'term' ? [`term: ${JSON.stringify(name.trim())}`] : []),
        'status: draft',
        '---',
        '',
        `# ${name.trim()}`,
        '',
        '_(stub — fill in)_\n',
      ].join('\n');
      await lwCreate(sagaPath, relPath, fm);
      onCreated(relPath);
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
        className="bg-card/95 border border-border/80 rounded-2xl shadow-2xl w-[28rem] max-w-full p-5 space-y-3 backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-serif">New {LABEL[kind]}</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <label className="block space-y-1">
          <span className="label-rune">Name</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save();
            }}
            className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
            placeholder={LABEL[kind] + ' name'}
          />
        </label>
        <div className="font-mono text-[11px] text-muted-foreground">
          {id ? `→ ${relPath}` : '—'}
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
