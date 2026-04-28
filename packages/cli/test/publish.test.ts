import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { publishCmd } from '../src/commands/publish.js';

let tmpRoot: string;

beforeAll(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lw-publish-tests-'));
});
afterAll(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

async function makeSaga(name: string): Promise<string> {
  const root = path.join(tmpRoot, name);
  const codex = path.join(root, 'codex', 'characters');
  await fs.mkdir(codex, { recursive: true });
  await fs.writeFile(
    path.join(root, 'saga.yaml'),
    'id: testpub\ntitle: Test Publish\n',
    'utf8',
  );
  await fs.writeFile(
    path.join(codex, 'aaron.md'),
    '---\nid: aaron\ntype: character\nname: Aaron\nvisibility: public\n---\n\n# Aaron\n',
    'utf8',
  );
  await fs.writeFile(
    path.join(codex, 'mira.md'),
    '---\nid: mira\ntype: character\nname: Mira\nvisibility: private\n---\n\n# Mira\n',
    'utf8',
  );
  return root;
}

describe('publishCmd', () => {
  it('writes dump/kinds/lenses/summary/diagnostics under <out>/demo/', async () => {
    const root = await makeSaga('basic');
    const out = path.join(tmpRoot, 'basic-out');
    await publishCmd(root, { out });
    for (const f of [
      'demo/dump.json',
      'demo/kinds.json',
      'demo/lenses.json',
      'demo/summary.json',
      'demo/diagnostics.json',
    ]) {
      await fs.access(path.join(out, f));
    }
  });

  it('excludes private entries by default', async () => {
    const root = await makeSaga('hide');
    const out = path.join(tmpRoot, 'hide-out');
    await publishCmd(root, { out });
    const dump = JSON.parse(
      await fs.readFile(path.join(out, 'demo', 'dump.json'), 'utf8'),
    ) as { entries: Array<{ id: string; visibility: string }> };
    const ids = dump.entries.map((e) => e.id);
    expect(ids).toContain('aaron');
    expect(ids).not.toContain('mira');
  });

  it('--include-private keeps everything', async () => {
    const root = await makeSaga('all');
    const out = path.join(tmpRoot, 'all-out');
    await publishCmd(root, { out, includePrivate: true });
    const dump = JSON.parse(
      await fs.readFile(path.join(out, 'demo', 'dump.json'), 'utf8'),
    ) as { entries: Array<{ id: string }> };
    const ids = dump.entries.map((e) => e.id);
    expect(ids).toContain('aaron');
    expect(ids).toContain('mira');
  });

  it('--plan writes nothing', async () => {
    const root = await makeSaga('plan');
    const out = path.join(tmpRoot, 'plan-out');
    await publishCmd(root, { out, plan: true });
    let exists = false;
    try {
      await fs.access(path.join(out, 'demo', 'dump.json'));
      exists = true;
    } catch {
      exists = false;
    }
    expect(exists).toBe(false);
  });
});
