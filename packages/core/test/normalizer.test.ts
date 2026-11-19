import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadSaga } from '../src/loader.js';
import {
  autoRouteTaxonomy,
  cleanFrontmatterTabs,
  normalizeEntryMarkdown,
  normalizeSagaFileContent,
  weaveEchoesInMarkdown,
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

  it('cleans frontmatter tabs and auto-routes taxonomy for misclassified AI/comrade locations', () => {
    const raw = [
      '---',
      '\tid: location/caul',
      '\ttype: location',
      '\tname: "Caul"',
      '\tstatus: draft',
      '\tinherits:',
      '\t  - sigil/ai',
      '\tproperties:',
      '\t  role: "Captured AI"',
      '---',
      '',
      '# Caul',
      '',
      'Caul was preserved by Kell after the blackout.',
    ].join('\n');

    const routed = autoRouteTaxonomy('codex/locations/caul.md', raw);
    expect(routed.relPath).toBe('codex/characters/caul.md');
    expect(routed.rerouted).toContain('Auto-routed');

    const normalized = normalizeSagaFileContent(routed.relPath, routed.content, {
      knownEntities: [
        { id: 'kell', name: 'Kell', type: 'character' },
      ],
    });

    expect(normalized).toContain('id: caul');
    expect(normalized).toContain('type: character');
    expect(normalized).toContain('@character/kell');
  });

  it('weaves canonical echoes into body markdown while skipping code and existing links', () => {
    const body = [
      '# Absalom',
      '',
      'Absalom is an ancient AI. He was friends with Kell and visited Caldera.',
      'He also spoke with [Jonah](@character/jonah).',
      '```',
      'Kell in code block should not be touched',
      '```',
    ].join('\n');

    const woven = weaveEchoesInMarkdown(body, [
      { id: 'kell', name: 'Kell', type: 'character' },
      { id: 'caldera', name: 'Caldera', type: 'location' },
      { id: 'jonah', name: 'Jonah', type: 'character' },
    ], 'absalom');

    expect(woven).toContain('@character/kell');
    expect(woven).toContain('@location/caldera');
    expect(woven).toContain('[Jonah](@character/jonah)');
    expect(woven).toContain('Kell in code block should not be touched');
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
