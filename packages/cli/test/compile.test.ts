import { promises as fs } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compileCmd } from '../src/commands/compile.js';

describe('lw compile', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'lw-compile-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function writeScene(tome: string, chapter: string, name: string, body: string) {
    const dir = path.join(root, 'tomes', tome, 'story', chapter, 'scenes');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, name), body, 'utf8');
  }

  it('concatenates scene files in sorted order into chapter.md', async () => {
    await writeScene('book-one', '01-arrival', '01-dawn.md', '# Dawn\nFirst line.');
    await writeScene('book-one', '01-arrival', '02-noon.md', '# Noon\nSecond line.');
    await compileCmd(root, {});
    const out = await fs.readFile(
      path.join(root, 'tomes/book-one/story/01-arrival/chapter.md'),
      'utf8',
    );
    expect(out).toMatch(/loreweave:compiled/);
    expect(out.indexOf('Dawn')).toBeLessThan(out.indexOf('Noon'));
    expect(out).toContain('First line.');
    expect(out).toContain('Second line.');
  });

  it('skips files starting with underscore or dot', async () => {
    await writeScene('book-one', '01-arrival', '01-real.md', 'real scene');
    await writeScene('book-one', '01-arrival', '_draft.md', 'draft');
    await writeScene('book-one', '01-arrival', '.scratch.md', 'scratch');
    await compileCmd(root, {});
    const out = await fs.readFile(
      path.join(root, 'tomes/book-one/story/01-arrival/chapter.md'),
      'utf8',
    );
    expect(out).toContain('real scene');
    expect(out).not.toContain('draft');
    expect(out).not.toContain('scratch');
  });

  it('does nothing when no scenes/ folder exists', async () => {
    const dir = path.join(root, 'tomes/book-one/story/01-arrival');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'chapter.md'), 'hand-written', 'utf8');
    await compileCmd(root, {});
    const out = await fs.readFile(path.join(dir, 'chapter.md'), 'utf8');
    expect(out).toBe('hand-written');
  });

  it('honors --tome filter', async () => {
    await writeScene('book-one', '01-a', '01.md', 'one');
    await writeScene('book-two', '01-b', '01.md', 'two');
    await compileCmd(root, { tome: 'book-one' });
    expect(
      await fs
        .readFile(
          path.join(root, 'tomes/book-one/story/01-a/chapter.md'),
          'utf8',
        )
        .catch(() => ''),
    ).toContain('one');
    expect(
      await fs
        .access(path.join(root, 'tomes/book-two/story/01-b/chapter.md'))
        .then(() => true)
        .catch(() => false),
    ).toBe(false);
  });
});
