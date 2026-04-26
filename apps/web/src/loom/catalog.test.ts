import { beforeEach, describe, expect, it } from 'vitest';
import { _resetCatalogBoot, activeLenses, bootLensCatalog } from './catalog.js';
import {
  _resetLoom,
  getLensManifest,
  listLensManifests,
  registerLensManifest,
} from './registry.js';

describe('Loom lens catalog', () => {
  beforeEach(() => {
    _resetLoom();
    _resetCatalogBoot();
  });

  it('boot registers all built-in lenses', () => {
    bootLensCatalog();
    const ids = listLensManifests().map((m) => m.id).sort();
    expect(ids).toEqual([
      'codex',
      'constellation',
      'lexicon',
      'sigils',
      'story',
      'threads',
      'traces',
      'versions',
    ]);
    for (const m of activeLenses()) {
      expect(m.builtin).toBe(true);
    }
  });

  it('boot is idempotent', () => {
    bootLensCatalog();
    bootLensCatalog();
    expect(listLensManifests()).toHaveLength(8);
  });

  it('saga manifest with same id overrides built-in (last write wins)', () => {
    bootLensCatalog();
    registerLensManifest({
      id: 'codex',
      name: 'Custom Codex',
      renderer: 'list',
      builtin: false,
      source: '.loreweave/lenses/codex.yaml',
    });
    const m = getLensManifest('codex');
    expect(m?.name).toBe('Custom Codex');
    expect(m?.builtin).toBe(false);
    expect(m?.source).toBe('.loreweave/lenses/codex.yaml');
  });

  it('user-defined manifest with new id appears alongside builtins', () => {
    bootLensCatalog();
    registerLensManifest({
      id: 'northern-characters',
      name: 'Northern Characters',
      renderer: 'list',
      kinds: ['character'],
      filter: { inherits: ['northern-kingdom'] },
      builtin: false,
    });
    expect(listLensManifests()).toHaveLength(9);
    expect(getLensManifest('northern-characters')?.kinds).toEqual([
      'character',
    ]);
  });
});
