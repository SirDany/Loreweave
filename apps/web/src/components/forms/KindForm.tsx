import { useId } from 'react';
import type { DumpEntry, KindFieldDef, KindInfo } from '../../lib/lw.js';
import { EchoPicker } from './EchoPicker.js';
import { coerceFieldValue, validateProperties } from './kind-schema.js';

interface Props {
  kind: KindInfo;
  values: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  /** Pool used for `ref` / `list of ref` pickers. */
  entries: DumpEntry[];
}

/**
 * Synthesizes a form from a Kind's `properties` schema. One row per
 * property; the input variant is chosen by `def.type`. The form is
 * uncontrolled at the field level — every change rebuilds and emits
 * the full property bag via `onChange`.
 */
export function KindForm({ kind, values, onChange, entries }: Props) {
  const schema = kind.properties ?? {};
  const issues = validateProperties(schema, values);
  const issueByField = new Map(issues.map((i) => [i.field, i.message]));
  const props = Object.entries(schema);
  if (props.length === 0) return null;

  const update = (name: string, raw: unknown) => {
    const def = schema[name];
    if (!def) return;
    const next = { ...values };
    const v = coerceFieldValue(def, raw);
    if (v === undefined) delete next[name];
    else next[name] = v;
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {kind.name} fields
      </div>
      <div className="grid gap-3">
        {props.map(([name, def]) => (
          <FieldRow
            key={name}
            name={name}
            def={def}
            value={values[name]}
            onChange={(v) => update(name, v)}
            entries={entries}
            error={issueByField.get(name)}
          />
        ))}
      </div>
    </div>
  );
}

interface RowProps {
  name: string;
  def: KindFieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
  entries: DumpEntry[];
  error?: string;
}

function FieldRow({ name, def, value, onChange, entries, error }: RowProps) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex flex-col gap-1 text-sm">
      <span className="font-medium">
        {name}
        {def.required ? <span className="text-destructive"> *</span> : null}
      </span>
      {def.description ? (
        <span className="text-xs text-muted-foreground">{def.description}</span>
      ) : null}
      <FieldInput
        id={id}
        def={def}
        value={value}
        onChange={onChange}
        entries={entries}
      />
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </label>
  );
}

interface InputProps {
  id: string;
  def: KindFieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
  entries: DumpEntry[];
}

function FieldInput({ id, def, value, onChange, entries }: InputProps) {
  const inputClass =
    'rounded border border-input bg-background px-2 py-1 text-sm';
  switch (def.type) {
    case 'text':
      return (
        <textarea
          id={id}
          className={`${inputClass} min-h-[5rem]`}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'number':
      return (
        <input
          id={id}
          type="number"
          className={inputClass}
          value={
            typeof value === 'number'
              ? value
              : typeof value === 'string'
                ? value
                : ''
          }
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'boolean':
      return (
        <input
          id={id}
          type="checkbox"
          className="h-4 w-4"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
        />
      );
    case 'date':
      return (
        <input
          id={id}
          type="date"
          className={inputClass}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'enum':
      return (
        <select
          id={id}
          className={inputClass}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">—</option>
          {(def.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    case 'ref': {
      const sel =
        typeof value === 'string' && value.length > 0 ? [value] : [];
      return (
        <EchoPicker
          entries={entries}
          kinds={def.kind ? [def.kind] : undefined}
          value={sel}
          onChange={(next) => onChange(next[0] ?? '')}
        />
      );
    }
    case 'list': {
      const inner = def.of;
      const arr = Array.isArray(value) ? (value as unknown[]) : [];
      if (inner?.type === 'ref') {
        const sel = arr.filter((x): x is string => typeof x === 'string');
        return (
          <EchoPicker
            entries={entries}
            kinds={inner.kind ? [inner.kind] : undefined}
            value={sel}
            onChange={(next) => onChange(next)}
          />
        );
      }
      // Fallback: comma-separated string editor for primitive lists.
      return (
        <input
          id={id}
          className={inputClass}
          value={arr.join(', ')}
          onChange={(e) => {
            const raw = e.target.value;
            const items = raw
              .split(',')
              .map((s) => s.trim())
              .filter((s) => s.length > 0);
            onChange(items);
          }}
        />
      );
    }
    case 'string':
    default:
      return (
        <input
          id={id}
          className={inputClass}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}
