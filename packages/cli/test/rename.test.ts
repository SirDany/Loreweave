import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyRenamePlan, buildRenamePlan } from '../src/commands/rename.js';

let tmpRoot: string;

beforeAll(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lw-rename-tests-'));
});
afterAll(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

async function writeFile(p: string, body: string): Promise<void> {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, body, 'utf8');
}

async function buildSaga(name: string): Promise<string> {
  const root = path.join(tmpRoot, name);
  await writeFile(path.join(root, 'saga.yaml'), 'id: demo\nname: Demo\n');
  await writeFile(
    path.join(root, 'codex/characters/aaron.md'),
    '---\nid: aaron\ntype: character\nname: Aaron\n---\nHe met @character/kay at @location/harbor.'
  );
  await writeFile(
    path.join(root, 'codex/characters/kay.md'),
    '---\nid: kay\ntype: character\nname: Kay\n---\nKay knows @character/aaron well.'
  );
  await writeFile(
    path.join(root, 'codex/locations/harbor.md'),
    '---\nid: harbor\ntype: location\nname: Harbor\n---\nA port town.'
  );
  await writeFile(
    path.join(root, 'tomes/book-one/tome.yaml'),
    'id: book-one\ntitle: Book One\n'
  );
  await writeFile(
    path.join(root, 'tomes/book-one/story/01-opening/chapter.md'),
    '# Opening\n\n@character/aaron walked onto the dock.\n'
  );
  await writeFile(
    path.join(root, 'traces/remember-aaron.md'),
    "---\nid: remember-aaron\nkind: idea\ntarget: '@character/aaron'\n---\nCheck @character/aaron's arc."
  );
  return root;
}

describe('lw rename', () => {
  it('plans echo rewrites and file rename for id change', async () => {
    const saga = await buildSaga('rename-plan');
    const plan = await buildRenamePlan(
      saga,
      'character/aaron',
      'aaron-stormrider'
    );

    expect(plan.from).toEqual({ type: 'character', id: 'aaron' });
    expect(plan.to).toEqual({ type: 'character', id: 'aaron-stormrider' });
    expect(plan.sourceFile).toBe('codex/characters/aaron.md');
    expect(plan.targetFile).toBe('codex/characters/aaron-stormrider.md');
    expect(plan.idInFrontmatter).toBe(true);
    expect(plan.conflicts).toEqual([]);

    const files = plan.hits.map((h) => h.relPath).sort();
    expect(files).toContain('codex/characters/kay.md');
    expect(files).toContain('tomes/book-one/story/01-opening/chapter.md');
    expect(files).toContain('traces/remember-aaron.md');

    // aaron.md has no @character/aaron echo in its own body — skip it.
    const kay = plan.hits.find((h) => h.relPath === 'codex/characters/kay.md');
    expect(kay?.count).toBe(1);
  });

  it('applies rename: rewrites echoes, updates frontmatter id, renames file', async () => {
    const saga = await buildSaga('rename-apply');
    const plan = await buildRenamePlan(
      saga,
      'character/aaron',
      'aaron-stormrider'
    );
    await applyRenamePlan(saga, plan);

    // New file exists, old one gone.
    await expect(
      fs.access(path.join(saga, 'codex/characters/aaron-stormrider.md'))
    ).resolves.toBeUndefined();
    await expect(
      fs.access(path.join(saga, 'codex/characters/aaron.md'))
    ).rejects.toBeTruthy();

    const newEntry = await fs.readFile(
      path.join(saga, 'codex/characters/aaron-stormrider.md'),
      'utf8'
    );
    expect(newEntry).toMatch(/^id: aaron-stormrider$/m);
    expect(newEntry).toContain('type: character');

    const kay = await fs.readFile(
      path.join(saga, 'codex/characters/kay.md'),
      'utf8'
    );
    expect(kay).toContain('@character/aaron-stormrider');
    expect(kay).not.toContain('@character/aaron ');
    expect(kay).not.toMatch(/@character\/aaron(?![a-z0-9-])/);

    const chapter = await fs.readFile(
      path.join(saga, 'tomes/book-one/story/01-opening/chapter.md'),
      'utf8'
    );
    expect(chapter).toContain('@character/aaron-stormrider');

    const trace = await fs.readFile(
      path.join(saga, 'traces/remember-aaron.md'),
      'utf8'
    );
    expect(trace).toContain('@character/aaron-stormrider');
  });

  it('does not rewrite id-prefix matches (avoid @character/aaron matching aaron-two)', async () => {
    const saga = await buildSaga('rename-boundary');
    await writeFile(
      path.join(saga, 'codex/characters/aaron-two.md'),
      '---\nid: aaron-two\ntype: character\nname: Aaron Two\n---\nRef: @character/aaron-two'
    );
    const plan = await buildRenamePlan(
      saga,
      'character/aaron',
      'aaron-stormrider'
    );
    await applyRenamePlan(saga, plan);

    const two = await fs.readFile(
      path.join(saga, 'codex/characters/aaron-two.md'),
      'utf8'
    );
    expect(two).toContain('@character/aaron-two');
    expect(two).not.toContain('@character/aaron-stormrider-two');
  });

  it('detects conflict when target already exists', async () => {
    const saga = await buildSaga('rename-conflict');
    const plan = await buildRenamePlan(saga, 'character/aaron', 'kay');
    expect(plan.conflicts.length).toBeGreaterThan(0);
    expect(plan.conflicts.join(' ')).toContain('already exists');
    await expect(applyRenamePlan(saga, plan)).rejects.toThrow(/refusing/);
  });

  it('rewrites bare sigil ids in inherits/tags/speaks (block + inline)', async () => {
    const root = path.join(tmpRoot, 'rename-sigil');
    await writeFile(path.join(root, 'saga.yaml'), 'id: demo\nname: Demo\n');
    await writeFile(
      path.join(root, 'sigils/northern.md'),
      '---\nid: northern\ntype: sigil\nname: Northern\nkind: slang-group\n---\n'
    );
    await writeFile(
      path.join(root, 'sigils/coastal.md'),
      '---\nid: coastal\ntype: sigil\nname: Coastal\n---\n'
    );
    await writeFile(
      path.join(root, 'codex/characters/cassia.md'),
      '---\nid: cassia\ntype: character\nname: Cassia\nspeaks: [northern, coastal]\ntags:\n  - northern\n  - veteran\ninherits:\n  - northern\n---\nbody'
    );
    await writeFile(
      path.join(root, 'codex/locations/north-port.md'),
      "---\nid: north-port\ntype: location\nname: North Port\nspoken_here: ['northern']\n---\nbody"
    );

    const plan = await buildRenamePlan(root, 'sigil/northern', 'north');
    expect(plan.extraHits.length).toBeGreaterThan(0);
    const totalExtra = plan.extraHits.reduce((n, h) => n + h.count, 0);
    expect(totalExtra).toBeGreaterThanOrEqual(4); // speaks(1) + tags(1) + inherits(1) + spoken_here(1)

    await applyRenamePlan(root, plan);

    const cassia = await fs.readFile(
      path.join(root, 'codex/characters/cassia.md'),
      'utf8'
    );
    expect(cassia).toContain('speaks: [north, coastal]');
    expect(cassia).toMatch(/tags:\n\s+- north\n\s+- veteran/);
    expect(cassia).toMatch(/inherits:\n\s+- north\b/);

    const port = await fs.readFile(
      path.join(root, 'codex/locations/north-port.md'),
      'utf8'
    );
    expect(port).toContain("spoken_here: ['north']");

    // Source sigil file renamed.
    await expect(
      fs.access(path.join(root, 'sigils/north.md'))
    ).resolves.toBeUndefined();
  });

  it('rewrites waypoint event-field on threads', async () => {
    const root = path.join(tmpRoot, 'rename-waypoint');
    await writeFile(path.join(root, 'saga.yaml'), 'id: demo\nname: Demo\n');
    await writeFile(
      path.join(root, 'codex/waypoints/duel.md'),
      '---\nid: duel\ntype: waypoint\nname: The Duel\n---\nA fateful clash.'
    );
    await writeFile(
      path.join(root, 'threads/main.yaml'),
      "id: main\nwaypoints:\n  - id: w1\n    event: duel\n  - id: w2\n    event: '@waypoint/duel'\n"
    );

    const plan = await buildRenamePlan(root, 'waypoint/duel', 'first-duel');
    const wpHits = plan.extraHits.filter((h) => h.kind === 'waypoint-event');
    expect(wpHits.length).toBe(1);
    expect(wpHits[0]!.count).toBe(2);

    await applyRenamePlan(root, plan);
    const main = await fs.readFile(
      path.join(root, 'threads/main.yaml'),
      'utf8'
    );
    expect(main).toContain('event: first-duel');
    expect(main).toContain("event: '@waypoint/first-duel'");
    expect(main).not.toContain(': duel');
  });
});
