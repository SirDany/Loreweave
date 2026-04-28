import { describe, expect, it } from 'vitest';
import { summarizeSaga } from '../src/summarize.js';
import type { Entry, Saga } from '../src/types.js';

function entry(type: string, id: string, opts: Partial<Entry['frontmatter']> = {}): Entry {
  return {
    frontmatter: { id, type: type as Entry['frontmatter']['type'], ...opts } as Entry['frontmatter'],
    body: '',
    path: `/saga/${type}/${id}.md`,
    relPath: `${type}/${id}.md`,
  };
}

function saga(entries: Entry[]): Saga {
  return {
    manifest: { id: 'demo', title: 'Demo' },
    root: '/saga',
    entries,
    tomes: [],
    threads: [],
    calendars: [],
    traces: [],
  };
}

describe('summarizeSaga', () => {
  it('counts entries by kind and tag', () => {
    const s = saga([
      entry('character', 'aaron', { tags: ['protagonist', 'noble'] }),
      entry('character', 'mira', { tags: ['protagonist'] }),
      entry('location', 'vellmar', { tags: ['city'] }),
    ]);
    const sum = summarizeSaga(s);
    expect(sum.totals.entries).toBe(3);
    expect(sum.byKind).toEqual([
      { kind: 'character', count: 2 },
      { kind: 'location', count: 1 },
    ]);
    expect(sum.byTag).toEqual([
      { tag: 'protagonist', count: 2 },
      { tag: 'city', count: 1 },
      { tag: 'noble', count: 1 },
    ]);
  });

  it('separates public and private entries', () => {
    const s = saga([
      entry('character', 'aaron'),
      entry('character', 'mira', { visibility: 'private' }),
    ]);
    const sum = summarizeSaga(s);
    expect(sum.totals.public).toBe(1);
    expect(sum.totals.private).toBe(1);
  });

  it('honors getMtime when sorting recent[]', () => {
    const s = saga([
      entry('character', 'aaron'),
      entry('character', 'mira'),
      entry('character', 'ezra'),
    ]);
    const mtimes: Record<string, Date> = {
      'character/aaron.md': new Date('2025-01-01'),
      'character/mira.md': new Date('2025-06-01'),
      'character/ezra.md': new Date('2025-03-01'),
    };
    const sum = summarizeSaga(s, { getMtime: (p) => mtimes[p], recentLimit: 2 });
    expect(sum.recent.map((r) => r.id)).toEqual(['mira', 'ezra']);
  });

  it('rolls up diagnostics totals when provided', () => {
    const s = saga([entry('character', 'aaron')]);
    const sum = summarizeSaga(s, {
      diagnostics: [
        { severity: 'error', code: 'x', message: '' },
        { severity: 'warning', code: 'y', message: '' },
        { severity: 'warning', code: 'z', message: '' },
      ],
    });
    expect(sum.diagnostics).toEqual({ errors: 1, warnings: 2 });
  });
});
