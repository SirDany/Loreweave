import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildKindCatalog,
  loadKindCatalog,
  KindCycleError,
} from '../src/kind-loader.js';
import { BUILTIN_KIND_IDS } from '../src/builtin-kinds.js';

async function mktmp(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'lw-kinds-'));
}

async function writeKind(root: string, id: string, body: string): Promise<void> {
  const dir = path.join(root, 'kinds');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${id}.md`), body, 'utf8');
}

describe('Kind catalog', () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await mktmp();
  });
  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('seeds with built-ins when no kinds/ dir exists', async () => {
    const cat = await loadKindCatalog(tmp);
    for (const id of BUILTIN_KIND_IDS) {
      expect(cat.byId.has(id)).toBe(true);
      expect(cat.byEcho.get(id)).toBe(id);
    }
    expect(cat.byId.get('character')!.builtin).toBe(true);
    expect(cat.byId.get('character')!.source).toBeNull();
  });

  it('loads a saga-defined kind', async () => {
    await writeKind(
      tmp,
      'quest',
      `---
id: quest
type: kind
name: Quest
display:
  icon: Sword
  color: orange
description: A questline or objective.
---
`,
    );
    const cat = await loadKindCatalog(tmp);
    const q = cat.byId.get('quest');
    expect(q).toBeDefined();
    expect(q!.builtin).toBe(false);
    expect(q!.echoPrefix).toBe('quest');
    expect(q!.storage).toBe('quest');
    expect(q!.display.icon).toBe('Sword');
    expect(cat.byEcho.get('quest')).toBe('quest');
  });

  it('saga override of a built-in wins', async () => {
    await writeKind(
      tmp,
      'character',
      `---
id: character
type: kind
name: Person
echoPrefix: person
aliases: [npc]
display:
  icon: UserCircle
---
`,
    );
    const cat = await loadKindCatalog(tmp);
    const c = cat.byId.get('character')!;
    expect(c.name).toBe('Person');
    expect(c.echoPrefix).toBe('person');
    // The saga file replaces the built-in entry, so this is no longer a builtin.
    expect(c.builtin).toBe(false);
    expect(c.source).not.toBeNull();
    expect(cat.byEcho.get('person')).toBe('character');
    expect(cat.byEcho.get('npc')).toBe('character');
    // The original built-in echoPrefix should no longer route to character
    // because it was replaced.
    expect(cat.byEcho.get('character')).toBeUndefined();
  });

  it('resolves extends chains with property merge (child wins)', () => {
    const cat = buildKindCatalog([
      {
        id: 'base-thing',
        type: 'kind',
        name: 'Base',
        properties: { color: { type: 'string' }, weight: { type: 'number' } },
      },
      {
        id: 'gizmo',
        type: 'kind',
        name: 'Gizmo',
        extends: 'base-thing',
        properties: { color: { type: 'string', required: true } }, // override
      },
    ]);
    const g = cat.byId.get('gizmo')!;
    expect(Object.keys(g.properties).sort()).toEqual(['color', 'weight']);
    expect(g.properties.color.required).toBe(true);
  });

  it('detects extends cycles', () => {
    expect(() =>
      buildKindCatalog([
        { id: 'a', type: 'kind', name: 'A', extends: 'b' },
        { id: 'b', type: 'kind', name: 'B', extends: 'a' },
      ]),
    ).toThrow(KindCycleError);
  });

  it('throws on extends to unknown kind', () => {
    expect(() =>
      buildKindCatalog([
        { id: 'orphan', type: 'kind', name: 'Orphan', extends: 'ghost' },
      ]),
    ).toThrow(/not found/);
  });

  it('rejects kind file whose id does not match filename', async () => {
    await writeKind(
      tmp,
      'wrong-name',
      `---
id: quest
type: kind
name: Quest
---
`,
    );
    await expect(loadKindCatalog(tmp)).rejects.toThrow(/does not match filename/);
  });
});
