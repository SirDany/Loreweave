import { describe, expect, it } from 'vitest';
import {
  extractTransclusions,
  normalizeRef,
  resolveTransclusion,
  slugifyHeading,
} from '../src/references.js';

describe('transclusions.extract', () => {
  it('matches @type/id#anchor with optional display text', () => {
    const text =
      'See @lore/the-fall#aftermath for context, or @lore/the-fall#prelude{the calm}.';
    const tx = extractTransclusions(text);
    expect(tx).toHaveLength(2);
    expect(tx[0]).toMatchObject({
      type: 'lore',
      id: 'the-fall',
      anchor: 'aftermath',
      display: undefined,
    });
    expect(tx[1]).toMatchObject({
      anchor: 'prelude',
      display: 'the calm',
    });
  });

  it('allows an empty anchor (whole-body transclusion)', () => {
    const tx = extractTransclusions('Read @character/aaron# for the bio.');
    expect(tx).toHaveLength(1);
    expect(tx[0]?.anchor).toBe('');
  });

  it('normalizeRef strips both #anchor and {display}', () => {
    expect(normalizeRef('@lore/the-fall#aftermath{end}')).toBe('lore/the-fall');
    expect(normalizeRef('lore/the-fall#aftermath')).toBe('lore/the-fall');
  });
});

describe('transclusions.resolve', () => {
  const body = [
    '# Top',
    '',
    'Intro line.',
    '',
    '## Prelude',
    '',
    'It began quietly.',
    '',
    '## Aftermath',
    '',
    'It ended loudly.',
    '',
    '### Detail',
    '',
    'Specifics here.',
    '',
    '## Coda',
    '',
    'And then silence.',
  ].join('\n');

  it('returns the slice for a leaf heading', () => {
    expect(resolveTransclusion(body, 'prelude')).toBe(
      ['## Prelude', '', 'It began quietly.'].join('\n'),
    );
  });

  it('includes nested deeper headings under the same parent', () => {
    const slice = resolveTransclusion(body, 'aftermath');
    expect(slice).toContain('## Aftermath');
    expect(slice).toContain('### Detail');
    expect(slice).not.toContain('## Coda');
  });

  it('returns the whole body for empty anchor', () => {
    expect(resolveTransclusion(body, '')).toBe(body);
  });

  it('returns null when the anchor is missing', () => {
    expect(resolveTransclusion(body, 'nope')).toBeNull();
  });
});

describe('slugifyHeading', () => {
  it.each([
    ['The Fall of Vellmar', 'the-fall-of-vellmar'],
    ['  Multiple   Spaces  ', 'multiple-spaces'],
    ['Prelude / Coda', 'prelude-coda'],
    ['héllo', 'h-llo'], // non-ASCII collapses to dash
    ['', ''],
  ])('slugifies %j → %j', (input, expected) => {
    expect(slugifyHeading(input)).toBe(expected);
  });
});
