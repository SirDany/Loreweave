/**
 * Pure helpers for working with a Kind's `properties` schema. These
 * are split from `KindForm.tsx` so they can be unit-tested without
 * pulling React.
 */
import type { KindFieldDef } from '../../lib/lw.js';

export interface FieldIssue {
  field: string;
  message: string;
}

/**
 * Validate a property bag against a Kind's `properties` schema. Returns
 * an array of issues; empty when valid. Phase 5 best-effort:
 *
 *  - `required` flags must have a non-empty value.
 *  - `enum` values must be in `options`.
 *  - `number` values must coerce to finite numbers.
 *  - `boolean` values must be `true` / `false`.
 *  - `list of <inner>` recurses on each item.
 *  - `ref` values are accepted as `<type>/<id>` strings only.
 *
 * Unknown fields aren't flagged — the form preserves them in advanced
 * YAML. Schema author errors (missing options for enum, etc.) are
 * silently ignored; the CLI catches those at load time.
 */
export function validateProperties(
  schema: Record<string, KindFieldDef>,
  values: Record<string, unknown>,
): FieldIssue[] {
  const out: FieldIssue[] = [];
  for (const [name, def] of Object.entries(schema)) {
    const v = values[name];
    if (def.required && (v == null || v === '')) {
      out.push({ field: name, message: `${name} is required` });
      continue;
    }
    if (v == null || v === '') continue;
    out.push(...validateValue(name, def, v));
  }
  return out;
}

function validateValue(
  name: string,
  def: KindFieldDef,
  v: unknown,
): FieldIssue[] {
  switch (def.type) {
    case 'enum':
      if (def.options && !def.options.includes(String(v))) {
        return [
          {
            field: name,
            message: `${name} must be one of ${def.options.join(', ')}`,
          },
        ];
      }
      return [];
    case 'number':
      if (typeof v === 'number' && Number.isFinite(v)) return [];
      if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)))
        return [];
      return [{ field: name, message: `${name} must be a number` }];
    case 'boolean':
      if (typeof v === 'boolean') return [];
      return [{ field: name, message: `${name} must be true or false` }];
    case 'list': {
      if (!Array.isArray(v)) {
        return [{ field: name, message: `${name} must be a list` }];
      }
      if (!def.of) return [];
      const issues: FieldIssue[] = [];
      v.forEach((item, i) => {
        issues.push(...validateValue(`${name}[${i}]`, def.of!, item));
      });
      return issues;
    }
    case 'ref':
      if (typeof v !== 'string' || !/^[a-z][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/.test(v))
        return [
          {
            field: name,
            message: `${name} must be a "<kind>/<id>" reference`,
          },
        ];
      return [];
    case 'date':
      // Lenient date check — ISO-ish.
      if (typeof v !== 'string' || v.trim() === '')
        return [{ field: name, message: `${name} must be a date string` }];
      return [];
    case 'string':
    case 'text':
      return [];
  }
  return [];
}

/**
 * Coerce a string from a form input to the typed value expected by the
 * Kind's `properties` schema. Best-effort — falls back to the raw
 * string when coercion fails.
 */
export function coerceFieldValue(def: KindFieldDef, raw: unknown): unknown {
  if (raw === '' || raw == null) return undefined;
  switch (def.type) {
    case 'number': {
      const n = typeof raw === 'number' ? raw : Number(raw);
      return Number.isFinite(n) ? n : raw;
    }
    case 'boolean':
      if (typeof raw === 'boolean') return raw;
      if (raw === 'true') return true;
      if (raw === 'false') return false;
      return raw;
    default:
      return raw;
  }
}
