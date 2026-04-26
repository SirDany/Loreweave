import { describe, expect, it } from 'vitest';
import {
  applyFrontmatterPatch,
  patchForKanbanMove,
} from '../src/loom/contrib/frontmatter-patch.js';
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
    body: partial.body ?? '\nBody text here.\n',
    frontmatter: partial.frontmatter ?? {},
    properties: partial.properties ?? {},
    provenance: {},
    inheritsChain: [],
  };
}

describe('applyFrontmatterPatch', () => {
  it('writes frontmatter + body in standard format', () => {
    const e = entry({
      type: 'character',
      id: 'aaron',
      name: 'Aaron',
      frontmatter: { id: 'aaron', type: 'character', name: 'Aaron' },
      body: '\nBody.',
    });
    const out = applyFrontmatterPatch(e, { status: 'canon' });
    expect(out.startsWith('---\n')).toBe(true);
    expect(out).toContain('status: canon');
    expect(out).toContain('---\nBody.');
  });

  it('protects id and type from mutation', () => {
    const e = entry({
      type: 'character',
      id: 'aaron',
      name: 'Aaron',
      frontmatter: { id: 'aaron', type: 'character', name: 'Aaron' },
    });
    const out = applyFrontmatterPatch(e, { id: 'evil', type: 'lore' });
    expect(out).toContain('id: aaron');
    expect(out).toContain('type: character');
  });

  it('deletes keys when patched with null/empty', () => {
    const e = entry({
      type: 'character',
      id: 'aaron',
      name: 'Aaron',
      frontmatter: { id: 'aaron', type: 'character', status: 'draft' },
    });
    const out = applyFrontmatterPatch(e, { status: null });
    expect(out).not.toContain('status:');
  });
});

describe('patchForKanbanMove', () => {
  it('targets typed status field at the top level', () => {
    const e = entry({ type: 'character', id: 'a', name: 'A' });
    expect(patchForKanbanMove(e, 'status', 'doing')).toEqual({ status: 'doing' });
  });

  it('targets top-level frontmatter key when already present', () => {
    const e = entry({
      type: 'character',
      id: 'a',
      name: 'A',
      frontmatter: { phase: 'idea' },
    });
    expect(patchForKanbanMove(e, 'phase', 'in-progress')).toEqual({
      phase: 'in-progress',
    });
  });

  it('nests under properties for Kind-defined fields', () => {
    const e = entry({
      type: 'character',
      id: 'a',
      name: 'A',
      frontmatter: { properties: { mood: 'happy', stat: 5 } },
    });
    expect(patchForKanbanMove(e, 'mood', 'sad')).toEqual({
      properties: { mood: 'sad', stat: 5 },
    });
  });

  it('clears the value when moving to (unset)', () => {
    const e = entry({ type: 'character', id: 'a', name: 'A' });
    expect(patchForKanbanMove(e, 'status', '(unset)')).toEqual({ status: null });
  });
});
