import { describe, expect, it } from 'vitest';
import {
  coerceFieldValue,
  validateProperties,
} from '../src/components/forms/kind-schema.js';
import type { KindFieldDef } from '../src/lib/lw.js';

describe('validateProperties', () => {
  it('flags missing required values', () => {
    const schema: Record<string, KindFieldDef> = {
      title: { type: 'string', required: true },
      bio: { type: 'text' },
    };
    const issues = validateProperties(schema, { bio: 'x' });
    expect(issues).toEqual([{ field: 'title', message: 'title is required' }]);
  });

  it('rejects enums outside the option list', () => {
    const schema: Record<string, KindFieldDef> = {
      role: { type: 'enum', options: ['hero', 'villain'] },
    };
    const issues = validateProperties(schema, { role: 'sidekick' });
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('hero');
  });

  it('checks number fields and accepts numeric strings', () => {
    const schema: Record<string, KindFieldDef> = { age: { type: 'number' } };
    expect(validateProperties(schema, { age: 12 })).toEqual([]);
    expect(validateProperties(schema, { age: '13' })).toEqual([]);
    const bad = validateProperties(schema, { age: 'old' });
    expect(bad).toHaveLength(1);
  });

  it('validates ref shape', () => {
    const schema: Record<string, KindFieldDef> = {
      mentor: { type: 'ref', kind: 'character' },
    };
    expect(
      validateProperties(schema, { mentor: 'character/aaron' }),
    ).toEqual([]);
    expect(validateProperties(schema, { mentor: 'aaron' })).toHaveLength(1);
  });

  it('recurses into list of ref', () => {
    const schema: Record<string, KindFieldDef> = {
      allies: { type: 'list', of: { type: 'ref', kind: 'character' } },
    };
    expect(
      validateProperties(schema, {
        allies: ['character/a', 'character/b'],
      }),
    ).toEqual([]);
    const issues = validateProperties(schema, { allies: ['plain'] });
    expect(issues).toHaveLength(1);
    expect(issues[0].field).toBe('allies[0]');
  });

  it('skips empty optional values', () => {
    const schema: Record<string, KindFieldDef> = {
      bio: { type: 'string' },
    };
    expect(validateProperties(schema, { bio: '' })).toEqual([]);
  });
});

describe('coerceFieldValue', () => {
  it('drops empty strings', () => {
    expect(coerceFieldValue({ type: 'string' }, '')).toBeUndefined();
  });

  it('coerces numeric strings', () => {
    expect(coerceFieldValue({ type: 'number' }, '42')).toBe(42);
    expect(coerceFieldValue({ type: 'number' }, '3.14')).toBeCloseTo(3.14);
  });

  it('coerces boolean strings', () => {
    expect(coerceFieldValue({ type: 'boolean' }, 'true')).toBe(true);
    expect(coerceFieldValue({ type: 'boolean' }, 'false')).toBe(false);
    expect(coerceFieldValue({ type: 'boolean' }, true)).toBe(true);
  });

  it('passes other values through unchanged', () => {
    expect(coerceFieldValue({ type: 'string' }, 'hi')).toBe('hi');
    expect(coerceFieldValue({ type: 'text' }, 'long')).toBe('long');
  });
});
