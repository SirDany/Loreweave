import { useMemo, useState } from 'react';
import { lwWrite } from '../lib/lw.js';
import type { KindInfo } from '../lib/lw.js';
import { listLenses } from '../loom/registry.js';

interface Props {
  sagaPath: string;
  kinds: KindInfo[];
  onClose: () => void;
  /** Called after a successful write so the host can reload the Saga. */
  onCreated: () => void;
}

/**
 * Compose Lens dialog. Lets the writer scaffold a saga-defined lens
 * manifest at `<saga>/.loreweave/lenses/<id>.yaml`. The manifest is
 * picked up live by the next `useSaga.reload()` and registered into
 * the Loom — saga-defined lenses then appear in the Shelf.
 *
 * The dialog deliberately exposes only the manifest fields a writer
 * is likely to need (id, name, renderer, kinds, status filter, group
 * by, sort by, editable). Power users can hand-edit the YAML for
 * anything more exotic.
 */
export function ComposeLensDialog({ sagaPath, kinds, onClose, onCreated }: Props) {
  const renderers = useMemo(() => listLenses(), []);
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [renderer, setRenderer] = useState(renderers[0]?.id ?? 'list');
  const [selectedKinds, setSelectedKinds] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<'' | 'draft' | 'canon'>('');
  const [groupBy, setGroupBy] = useState('');
  const [sortBy, setSortBy] = useState('');
  const [editable, setEditable] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const idValid = /^[a-z][a-z0-9-]*$/.test(id);
  const canSave = idValid && name.trim().length > 0 && renderer.length > 0;

  const yaml = buildYaml({
    id,
    name: name.trim(),
    description: description.trim(),
    renderer,
    kinds: selectedKinds,
    statusFilter,
    groupBy: groupBy.trim(),
    sortBy: sortBy.trim(),
    editable,
  });

  const save = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    setErr(null);
    try {
      await lwWrite(sagaPath, `.loreweave/lenses/${id}.yaml`, yaml + '\n');
      onCreated();
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const toggleKind = (kindId: string) => {
    setSelectedKinds((prev) =>
      prev.includes(kindId) ? prev.filter((k) => k !== kindId) : [...prev, kindId],
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-auto bg-card border border-border rounded-lg shadow-2xl"
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
      >
        <header className="px-5 py-3 border-b border-border flex items-center gap-3">
          <div className="flex-1">
            <div className="text-xs text-muted-foreground">
              .loreweave/lenses/{id || '<id>'}.yaml
            </div>
            <div className="text-base text-foreground">Compose Lens</div>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-sm px-2"
          >
            ✕
          </button>
        </header>

        <div className="p-5 space-y-4 text-sm">
          <Field
            label="id"
            hint="kebab-case; matches the filename stem"
          >
            <input
              autoFocus
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="character-kanban"
              className="w-full bg-background border border-border rounded px-2 py-1 font-mono"
            />
            {id && !idValid ? (
              <div className="text-xs text-destructive mt-1">
                id must be kebab-case (start with a letter, lowercase, no spaces).
              </div>
            ) : null}
          </Field>

          <Field label="name" hint="shown in the Shelf">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Character Kanban"
              className="w-full bg-background border border-border rounded px-2 py-1"
            />
          </Field>

          <Field label="description" hint="optional one-liner">
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-background border border-border rounded px-2 py-1"
            />
          </Field>

          <Field label="renderer" hint="picks a registered Loom renderer">
            <select
              value={renderer}
              onChange={(e) => setRenderer(e.target.value)}
              className="w-full bg-background border border-border rounded px-2 py-1"
            >
              {renderers.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.id} — {r.name}
                </option>
              ))}
            </select>
            {renderers.find((r) => r.id === renderer)?.description ? (
              <div className="text-xs text-muted-foreground mt-1">
                {renderers.find((r) => r.id === renderer)?.description}
              </div>
            ) : null}
          </Field>

          <Field label="kinds" hint="restrict to one or more Kind ids (empty = all)">
            <div className="flex flex-wrap gap-2">
              {kinds.length === 0 ? (
                <div className="text-xs text-muted-foreground">
                  No Kind catalog loaded.
                </div>
              ) : null}
              {kinds.map((k) => {
                const on = selectedKinds.includes(k.id);
                return (
                  <button
                    type="button"
                    key={k.id}
                    onClick={() => toggleKind(k.id)}
                    className={`rounded border px-2 py-0.5 text-xs ${
                      on
                        ? 'border-primary bg-primary/20'
                        : 'border-border hover:bg-muted'
                    }`}
                  >
                    {k.id}
                  </button>
                );
              })}
            </div>
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="filter.status">
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as '' | 'draft' | 'canon')
                }
                className="w-full bg-background border border-border rounded px-2 py-1"
              >
                <option value="">(any)</option>
                <option value="draft">draft</option>
                <option value="canon">canon</option>
              </select>
            </Field>

            <Field label="groupBy" hint="property name">
              <input
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value)}
                placeholder="status"
                className="w-full bg-background border border-border rounded px-2 py-1 font-mono"
              />
            </Field>

            <Field label="sortBy" hint="property name">
              <input
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                placeholder="name"
                className="w-full bg-background border border-border rounded px-2 py-1 font-mono"
              />
            </Field>

            <Field label="editable" hint="enables drag-and-drop on supported renderers">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={editable}
                  onChange={(e) => setEditable(e.target.checked)}
                  className="h-4 w-4"
                />
                <span className="text-xs text-muted-foreground">
                  Allow renderers to mutate entries via drop.
                </span>
              </label>
            </Field>
          </div>

          <Field label="preview" hint="written verbatim to the lens file">
            <pre className="rounded border border-border bg-background/50 p-2 text-xs font-mono whitespace-pre-wrap">
              {yaml}
            </pre>
          </Field>

          {err && (
            <div className="text-rose-400 text-xs whitespace-pre-wrap">{err}</div>
          )}
        </div>

        <footer className="px-5 py-3 border-t border-border flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1 rounded border border-border text-foreground/90 hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={() => void save()}
            disabled={!canSave || saving}
            className="px-3 py-1 rounded border border-primary bg-primary/20 text-primary-foreground hover:bg-primary/30 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Create lens'}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-xs text-muted-foreground mb-1">
        {label}
        {hint && <span className="text-muted-foreground/70"> · {hint}</span>}
      </div>
      {children}
    </label>
  );
}

export interface ComposeLensInput {
  id: string;
  name: string;
  description: string;
  renderer: string;
  kinds: string[];
  statusFilter: '' | 'draft' | 'canon';
  groupBy: string;
  sortBy: string;
  editable: boolean;
}

/**
 * Build the YAML body for a saga-defined lens manifest. Pure helper
 * exported for unit testing.
 */
export function buildYaml(input: ComposeLensInput): string {
  const out: string[] = [];
  out.push(`id: ${input.id || '<id>'}`);
  out.push(`name: ${yamlString(input.name || '<name>')}`);
  if (input.description) out.push(`description: ${yamlString(input.description)}`);
  out.push(`renderer: ${input.renderer || 'list'}`);
  if (input.kinds.length > 0) {
    out.push('kinds:');
    for (const k of input.kinds) out.push(`  - ${k}`);
  }
  if (input.statusFilter) {
    out.push('filter:');
    out.push(`  status: ${input.statusFilter}`);
  }
  if (input.groupBy) out.push(`groupBy: ${input.groupBy}`);
  if (input.sortBy) out.push(`sortBy: ${input.sortBy}`);
  if (input.editable) out.push('editable: true');
  return out.join('\n');
}

/**
 * Minimal YAML-string quoter. Only quotes when needed (whitespace,
 * leading special char, or otherwise ambiguous tokens). Sufficient
 * for the small free-text fields exposed in this dialog.
 */
function yamlString(s: string): string {
  if (!s) return '""';
  if (/^[A-Za-z0-9 _\-.]+$/.test(s) && !/^(true|false|null|yes|no)$/i.test(s)) {
    return s;
  }
  return JSON.stringify(s);
}
