import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadSaga } from '../src/loader.js';
import { extractReferences } from '../src/references.js';
import { hasErrors, validateSaga } from '../src/validator.js';

async function mktmp(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'lw-custom-kind-'));
}
async function write(p: string, body: string) {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, body, 'utf8');
}

describe('custom kind echoes', () => {
  let root: string;
  beforeEach(async () => {
    root = await mktmp();
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('plan verification: kinds/quest.md + @quest/find-the-sword validates', async () => {
    await write(
      path.join(root, 'saga.yaml'),
      'id: tiny-saga\ntitle: Tiny\n',
    );
    await write(
      path.join(root, 'kinds', 'quest.md'),
      `---
id: quest
type: kind
name: Quest
storage: quests
display:
  icon: Sword
---
`,
    );
    await write(
      path.join(root, 'quests', 'find-the-sword.md'),
      `---
id: find-the-sword
type: quest
name: Find the Sword
---

The hero must find the sword.
`,
    );
    await write(
      path.join(root, 'tomes', 'book-one', 'tome.yaml'),
      'id: book-one\ntitle: Book One\n',
    );
    await write(
      path.join(root, 'tomes', 'book-one', 'story', '01-start', 'chapter.md'),
      'The hero set out on @quest/find-the-sword.\n',
    );

    const saga = await loadSaga(root);

    // Kind catalog is populated and includes the saga-defined kind.
    expect(saga.kinds!.byId.has('quest')).toBe(true);
    expect(saga.kinds!.byEcho.get('quest')).toBe('quest');

    // The custom-kind entry was loaded from its storage folder.
    const quest = saga.entries.find((e) => e.frontmatter.id === 'find-the-sword');
    expect(quest).toBeDefined();
    expect(quest!.frontmatter.type).toBe('quest');

    // Echo extraction picks it up.
    const refs = extractReferences(saga.tomes[0]!.chapters[0]!.body);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({ type: 'quest', id: 'find-the-sword' });

    // Validator does NOT flag broken-reference for the custom kind.
    const diags = validateSaga(saga);
    const broken = diags.filter((d) => d.code === 'broken-reference');
    expect(broken).toEqual([]);
    expect(hasErrors(diags)).toBe(false);
  });

  it('alias prefix routes to canonical kind', async () => {
    await write(
      path.join(root, 'saga.yaml'),
      'id: tiny-saga\ntitle: Tiny\n',
    );
    // Override character with an alias.
    await write(
      path.join(root, 'kinds', 'character.md'),
      `---
id: character
type: kind
name: Character
aliases: [npc]
storage: codex/characters
---
`,
    );
    await write(
      path.join(root, 'codex', 'characters', 'aaron.md'),
      `---
id: aaron
type: character
name: Aaron
---
`,
    );
    await write(
      path.join(root, 'tomes', 'book-one', 'tome.yaml'),
      'id: book-one\ntitle: Book One\n',
    );
    await write(
      path.join(root, 'tomes', 'book-one', 'story', '01-start', 'chapter.md'),
      'The @npc/aaron walked in.\n',
    );

    const saga = await loadSaga(root);
    const diags = validateSaga(saga);
    const broken = diags.filter((d) => d.code === 'broken-reference');
    expect(broken).toEqual([]);
  });
});
