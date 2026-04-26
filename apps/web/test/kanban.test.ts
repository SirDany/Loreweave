import { describe, expect, it } from 'vitest';
import { bucketEntries } from '../src/loom/contrib/KanbanLens.js';
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
    tags: partial.tags ?? [],
    inherits: partial.inherits ?? [],
    appears_in: partial.appears_in ?? null,
    status: partial.status ?? null,
    aliases: [],
    body: '',
    frontmatter: partial.frontmatter ?? {},
    properties: partial.properties ?? {},
    provenance: {},
    inheritsChain: [],
  };
}

describe('KanbanLens.bucketEntries', () => {
  it('groups by typed status field', () => {
    const a = entry({ type: 'character', id: 'a', name: 'A', status: 'draft' });
    const b = entry({ type: 'character', id: 'b', name: 'B', status: 'canon' });
    const c = entry({ type: 'character', id: 'c', name: 'C', status: 'draft' });
    const groups = bucketEntries([a, b, c], 'status');
    expect(groups.get('draft')).toHaveLength(2);
    expect(groups.get('canon')).toHaveLength(1);
  });

  it('falls back to frontmatter when not a typed field', () => {
    const a = entry({
      type: 'character',
      id: 'a',
      name: 'A',
      frontmatter: { faction: 'north' },
    });
    const b = entry({
      type: 'character',
      id: 'b',
      name: 'B',
      frontmatter: { faction: 'south' },
    });
    const groups = bucketEntries([a, b], 'faction');
    expect(Array.from(groups.keys()).sort()).toEqual(['north', 'south']);
  });

  it('places entries without the property in (unset)', () => {
    const a = entry({ type: 'character', id: 'a', name: 'A' });
    const groups = bucketEntries([a], 'status');
    expect(groups.get('(unset)')).toHaveLength(1);
  });

  it('handles empty input', () => {
    expect(bucketEntries([], 'status').size).toBe(0);
  });

  it('reads from resolved properties last', () => {
    const a = entry({
      type: 'character',
      id: 'a',
      name: 'A',
      properties: { rank: 'captain' },
    });
    const groups = bucketEntries([a], 'rank');
    expect(groups.get('captain')).toHaveLength(1);
  });
});
