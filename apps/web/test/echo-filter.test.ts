import { describe, expect, it } from 'vitest';
import {
  entriesToOptions,
  filterEchoes,
} from '../src/components/forms/echo-filter.js';
import type { DumpEntry } from '../src/lib/lw.js';

function entry(
  partial: Partial<DumpEntry> &
    Pick<DumpEntry, 'type' | 'id' | 'name'>,
): DumpEntry {
  return {
    type: partial.type,
    id: partial.id,
    name: partial.name,
    relPath: `${partial.type}s/${partial.id}.md`,
    tags: [],
    inherits: [],
    appears_in: null,
    status: null,
    aliases: partial.aliases ?? [],
    body: '',
    frontmatter: {},
    properties: {},
    provenance: {},
    inheritsChain: [],
  };
}

describe('echo-filter', () => {
  const aaron = entry({ type: 'character', id: 'aaron', name: 'Aaron' });
  const bella = entry({
    type: 'character',
    id: 'bella',
    name: 'Bella',
    aliases: ['the-thief'],
  });
  const vellmar = entry({ type: 'location', id: 'vellmar', name: 'Vellmar' });
  const sigil = entry({ type: 'sigil', id: 'northern-kingdom', name: 'Northern Kingdom' });

  it('entriesToOptions filters by kind', () => {
    const opts = entriesToOptions([aaron, bella, vellmar, sigil], ['character']);
    expect(opts).toHaveLength(2);
    expect(opts.map((o) => o.id)).toEqual(['aaron', 'bella']);
  });

  it('entriesToOptions returns all entries when no kind filter', () => {
    const opts = entriesToOptions([aaron, vellmar, sigil]);
    expect(opts).toHaveLength(3);
  });

  it('filterEchoes returns top-N when query is empty', () => {
    const opts = entriesToOptions([aaron, bella, vellmar]);
    const r = filterEchoes(opts, new Set(), '');
    expect(r).toHaveLength(3);
  });

  it('filterEchoes hides already-selected items', () => {
    const opts = entriesToOptions([aaron, bella]);
    const r = filterEchoes(opts, new Set(['character/aaron']), '');
    expect(r.map((o) => o.id)).toEqual(['bella']);
  });

  it('filterEchoes matches by id, name, and alias (case-insensitive)', () => {
    const opts = entriesToOptions([aaron, bella, vellmar]);
    expect(filterEchoes(opts, new Set(), 'AARON').map((o) => o.id)).toEqual(['aaron']);
    expect(filterEchoes(opts, new Set(), 'bella').map((o) => o.id)).toEqual(['bella']);
    expect(filterEchoes(opts, new Set(), 'thief').map((o) => o.id)).toEqual(['bella']);
    expect(filterEchoes(opts, new Set(), 'vell').map((o) => o.id)).toEqual(['vellmar']);
  });

  it('filterEchoes respects the limit', () => {
    const many = Array.from({ length: 50 }, (_, i) =>
      entry({ type: 'character', id: `c-${i}`, name: `C ${i}` }),
    );
    const opts = entriesToOptions(many);
    expect(filterEchoes(opts, new Set(), '', 10)).toHaveLength(10);
  });
});
