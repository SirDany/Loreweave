import { describe, expect, it } from 'vitest';
import { buildYaml } from '../src/views/ComposeLensDialog.js';

describe('ComposeLensDialog.buildYaml', () => {
  it('emits the minimum required fields', () => {
    const out = buildYaml({
      id: 'character-kanban',
      name: 'Character Kanban',
      description: '',
      renderer: 'kanban',
      kinds: [],
      statusFilter: '',
      groupBy: '',
      sortBy: '',
      editable: false,
    });
    expect(out).toBe(
      ['id: character-kanban', 'name: Character Kanban', 'renderer: kanban'].join('\n'),
    );
  });

  it('quotes names with reserved tokens', () => {
    const out = buildYaml({
      id: 'x',
      name: 'true',
      description: '',
      renderer: 'list',
      kinds: [],
      statusFilter: '',
      groupBy: '',
      sortBy: '',
      editable: false,
    });
    expect(out).toContain('name: "true"');
  });

  it('serializes kinds, filter, groupBy, sortBy, editable', () => {
    const out = buildYaml({
      id: 'work',
      name: 'Work',
      description: 'Tracks WIP',
      renderer: 'kanban',
      kinds: ['character', 'concept'],
      statusFilter: 'draft',
      groupBy: 'status',
      sortBy: 'name',
      editable: true,
    });
    expect(out).toContain('description: Tracks WIP');
    expect(out).toContain('kinds:\n  - character\n  - concept');
    expect(out).toContain('filter:\n  status: draft');
    expect(out).toContain('groupBy: status');
    expect(out).toContain('sortBy: name');
    expect(out).toContain('editable: true');
  });

  it('omits filter block when no status selected', () => {
    const out = buildYaml({
      id: 'x',
      name: 'X',
      description: '',
      renderer: 'list',
      kinds: [],
      statusFilter: '',
      groupBy: '',
      sortBy: '',
      editable: false,
    });
    expect(out).not.toContain('filter:');
  });
});
