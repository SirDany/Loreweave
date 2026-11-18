import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadSaga } from '../src/loader.js';
import {
  normalizeEntryMarkdown,
  normalizeSagaFileContent,
} from '../src/normalizer.js';
import { ChapterMetaSchema } from '../src/schemas.js';

describe('normalizer & resilient saga loading', () => {
  it('repairs code-fenced markdown bullet entries such as Absalom', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'lw-norm-'));
    try {
      await mkdir(path.join(dir, 'codex', 'characters'), { recursive: true });
      await writeFile(
        path.join(dir, 'saga.yaml'),
        'id: test-saga\ntitle: "Test Saga"\n',
        'utf8',
      );
      const broken = [
        '```markdown',
        '---',
        '# Absalom',
        '',
        '## Properties',
        '- **Type:** character',
        '- **Status:** draft',
        '- **Name:** Absalom',
        '- **Description:** An ancient adjudicator AI.',
        '',
        '## Inheritance',
        '- **inherits:** sigil/ai',
        '',
        '## Appears in',
        '- tome/book-one',
        '',
        '## Source',
        '- .loreweave\\/ingest\\/batch-1\\/bible.md',
        '',
        '```',
      ].join('\n');

      await writeFile(
        path.join(dir, 'codex', 'characters', 'absalom.md'),
        broken,
        'utf8',
      );

      const saga = await loadSaga(dir);
      const absalom = saga.entries.find((e) => e.frontmatter.id === 'absalom');
      expect(absalom).toBeDefined();
      expect(absalom!.frontmatter.type).toBe('character');
      expect(absalom!.frontmatter.name).toBe('Absalom');
      expect(absalom!.frontmatter.status).toBe('draft');
      expect(absalom!.frontmatter.inherits).toEqual(['ai']);
      expect(absalom!.frontmatter.appears_in).toEqual(['book-one']);
      expect(
        (absalom!.frontmatter.properties as Record<string, unknown>)?.source,
      ).toBe('.loreweave/ingest/batch-1/bible.md');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('infers type from directory path and populates term field on lexicon entries', () => {
    const res = normalizeEntryMarkdown(
      '# Skol\n\nA northern toast.',
      'lexicon/skol.md',
    );
    expect(res.frontmatter.id).toBe('skol');
    expect(res.frontmatter.type).toBe('term');
    expect(res.frontmatter.term).toBe('Skol');
    expect(res.frontmatter.status).toBe('draft');
  });

  it('preserves already-valid entries byte-for-byte via normalizeSagaFileContent', () => {
    const valid = '---\nid: aaron\ntype: character\nname: Aaron\nstatus: canon\n---\n\n# Aaron\n\nQuiet soldier.\n';
    expect(normalizeSagaFileContent('codex/characters/aaron.md', valid)).toBe(valid);
  });

  it('coerces LLM-friendly ChapterMeta values', () => {
    const parsed = ChapterMetaSchema.parse({
      title: 'Chapter One',
      ordinal: '1',
      status: 'DRAFT',
      pov: '@character/absalom',
      linked_events: '@waypoint/awakening',
    });
    expect(parsed.ordinal).toBe(1);
    expect(parsed.status).toBe('draft');
    expect(parsed.pov).toEqual(['@character/absalom']);
    expect(parsed.linked_events).toEqual(['@waypoint/awakening']);
  });
});
