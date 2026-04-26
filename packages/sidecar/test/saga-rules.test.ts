import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadSagaRules } from '../src/saga-rules.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'lw-rules-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('loadSagaRules', () => {
  it('returns empty when the rules dir is missing', async () => {
    const r = await loadSagaRules(dir);
    expect(r.text).toBe('');
    expect(r.files).toEqual([]);
  });

  it('concatenates every md file under .loreweave/rules in name order', async () => {
    await mkdir(path.join(dir, '.loreweave/rules'), { recursive: true });
    await writeFile(
      path.join(dir, '.loreweave/rules/02-voice.md'),
      '## Voice\n\nNo profanity.',
      'utf8',
    );
    await writeFile(
      path.join(dir, '.loreweave/rules/01-canon.md'),
      '## Canon\n\nCharacters always have a vice.',
      'utf8',
    );
    // Non-md file ignored.
    await writeFile(
      path.join(dir, '.loreweave/rules/notes.txt'),
      'ignored',
      'utf8',
    );
    const r = await loadSagaRules(dir);
    expect(r.files).toEqual([
      '.loreweave/rules/01-canon.md',
      '.loreweave/rules/02-voice.md',
    ]);
    expect(r.text).toContain('## House rules');
    // Both bodies survive, in sorted order.
    expect(r.text.indexOf('Canon')).toBeLessThan(r.text.indexOf('Voice'));
    expect(r.text).toContain('No profanity.');
  });

  it('skips empty markdown files', async () => {
    await mkdir(path.join(dir, '.loreweave/rules'), { recursive: true });
    await writeFile(path.join(dir, '.loreweave/rules/empty.md'), '   \n', 'utf8');
    const r = await loadSagaRules(dir);
    expect(r.text).toBe('');
  });
});
