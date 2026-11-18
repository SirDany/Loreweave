import { describe, expect, it } from 'vitest';
import { stripRefs } from '../src/commands/export.js';

describe('stripRefs', () => {
  const idx = new Map<string, string>([
    ['character/aaron', 'Aaron'],
    ['location/vellmar', 'Vellmar'],
  ]);

  it('replaces resolvable echoes with the indexed display name', () => {
    expect(stripRefs('Hi @character/aaron, welcome.', idx)).toBe(
      'Hi Aaron, welcome.',
    );
  });

  it('leaves unresolved echoes as the bare @type/id', () => {
    expect(stripRefs('Hi @character/unknown.', idx)).toBe(
      'Hi @character/unknown.',
    );
  });

  it('honors a {display} override over the indexed name', () => {
    expect(stripRefs('@character/aaron{the king} stood watch.', idx)).toBe(
      'the king stood watch.',
    );
  });

  it('honors a {display} override even when the entity is unknown', () => {
    expect(stripRefs('@character/ghost{a shadow} passed.', idx)).toBe(
      'a shadow passed.',
    );
  });

  it('ignores empty {} (falls back to indexed name)', () => {
    expect(stripRefs('@character/aaron{} stood.', idx)).toBe('Aaron stood.');
  });

  it('strips markdown-link echoes [Display](@type/id) to their display label', () => {
    expect(stripRefs('Hi [Aaron of Vellmar](@character/aaron), welcome.', idx)).toBe(
      'Hi Aaron of Vellmar, welcome.',
    );
  });

  it('handles shorthand [Display](@char/id) aliases in markdown links', () => {
    expect(stripRefs('[The King](@char/aaron) stood watch.', idx)).toBe(
      'The King stood watch.',
    );
  });

  it('strips unknown markdown-link echoes [Unknown](@character/ghost) to display text', () => {
    expect(stripRefs('[Unknown](@character/ghost) vanished.', idx)).toBe(
      'Unknown vanished.',
    );
  });
});
