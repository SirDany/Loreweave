import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { exportCmd } from '../src/commands/export.js';

let tmpRoot: string;

beforeAll(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lw-export-html-'));
});
afterAll(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

async function buildSaga(): Promise<string> {
  const root = path.join(tmpRoot, 'demo');
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(
    path.join(root, 'saga.yaml'),
    'id: demo\nname: Demo\n',
    'utf8',
  );
  // Tome with a chapter that exercises bold, italic, list, blockquote.
  await fs.mkdir(path.join(root, 'tomes/book-one/story/01-opening'), {
    recursive: true,
  });
  await fs.writeFile(
    path.join(root, 'tomes/book-one/tome.yaml'),
    'id: book-one\ntitle: Book One\n',
    'utf8',
  );
  await fs.writeFile(
    path.join(root, 'tomes/book-one/story/01-opening/_meta.yaml'),
    'title: Opening\nordinal: 1\n',
    'utf8',
  );
  await fs.writeFile(
    path.join(root, 'tomes/book-one/story/01-opening/chapter.md'),
    [
      'A **bold** and *italic* line.',
      '',
      '> a quote',
      '',
      '- one',
      '- two',
      '',
      'A reference to @character/aaron{the king}.',
      '',
    ].join('\n'),
    'utf8',
  );
  // Codex entry with a `# heading` and lists.
  await fs.mkdir(path.join(root, 'codex/characters'), { recursive: true });
  await fs.writeFile(
    path.join(root, 'codex/characters/aaron.md'),
    [
      '---',
      'id: aaron',
      'type: character',
      'name: Aaron',
      '---',
      '',
      '## Background',
      '',
      'Aaron is **brave**.',
      '',
      '- swords',
      '- horses',
      '',
    ].join('\n'),
    'utf8',
  );
  return root;
}

describe('lw export html → markdown rendering', () => {
  it('tome-html renders bold / italic / lists / blockquotes', async () => {
    const saga = await buildSaga();
    const out = path.join(tmpRoot, 'tome.html');
    await exportCmd(saga, { format: 'tome-html', tome: 'book-one', out });
    const html = await fs.readFile(out, 'utf8');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
    expect(html).toContain('<blockquote>');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>one</li>');
    // display-text override survives.
    expect(html).toContain('the king');
  });

  it('codex-html renders entry markdown and links @echoes', async () => {
    const saga = await buildSaga();
    const out = path.join(tmpRoot, 'codex.html');
    await exportCmd(saga, { format: 'codex-html', out });
    const html = await fs.readFile(out, 'utf8');
    expect(html.toLowerCase()).toMatch(/<h2[^>]*>background<\/h2>/);
    expect(html).toContain('<strong>brave</strong>');
    expect(html).toContain('<ul>');
    // anchor link emitted
    expect(html).toContain('id="character-aaron"');
  });
});
