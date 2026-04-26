import { describe, expect, it, beforeEach } from 'vitest';
import { _resetLoom, getLens, listLenses, registerLens } from './registry.js';

function FakeRenderer() {
  return null;
}

describe('Loom registry', () => {
  beforeEach(() => {
    _resetLoom();
  });

  it('registers and retrieves a renderer by id', () => {
    registerLens({
      id: 'list',
      name: 'List',
      description: 'Plain list renderer.',
      component: FakeRenderer,
    });
    const got = getLens('list');
    expect(got?.name).toBe('List');
    expect(got?.component).toBe(FakeRenderer);
  });

  it('returns undefined for unknown ids', () => {
    expect(getLens('does-not-exist')).toBeUndefined();
  });

  it('listLenses returns every registered entry', () => {
    registerLens({
      id: 'a',
      name: 'A',
      description: '',
      component: FakeRenderer,
    });
    registerLens({
      id: 'b',
      name: 'B',
      description: '',
      component: FakeRenderer,
    });
    const ids = listLenses().map((e) => e.id);
    expect(ids.sort()).toEqual(['a', 'b']);
  });

  it('last write wins (overrides allowed)', () => {
    function R1() {
      return null;
    }
    function R2() {
      return null;
    }
    registerLens({ id: 'x', name: '1', description: '', component: R1 });
    registerLens({ id: 'x', name: '2', description: '', component: R2 });
    expect(getLens('x')?.name).toBe('2');
    expect(getLens('x')?.component).toBe(R2);
  });
});
