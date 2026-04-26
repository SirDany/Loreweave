import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { lensesCmd } from '../src/commands/lenses.js';

let tmp: string;
let logs: string[];
let origLog: typeof console.log;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'lw-lenses-'));
  logs = [];
  origLog = console.log;
  console.log = (...args) => {
    logs.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
  };
});
afterEach(async () => {
  console.log = origLog;
  await fs.rm(tmp, { recursive: true, force: true });
});

async function writeLens(saga: string, id: string, body: string) {
  const dir = path.join(saga, '.loreweave', 'lenses');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${id}.yaml`), body, 'utf8');
}

describe('lw lenses', () => {
  it('reports nothing when no lenses dir exists', async () => {
    await lensesCmd(tmp, {});
    expect(logs.join('\n')).toMatch(/no saga-defined lenses/);
  });

  it('lists lens manifests in JSON', async () => {
    await writeLens(
      tmp,
      'character-board',
      `id: character-board\nname: Character Board\nrenderer: kanban\nkinds: [character]\ngroupBy: status\n`,
    );
    await lensesCmd(tmp, { json: true });
    const parsed = JSON.parse(logs.join('\n'));
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      id: 'character-board',
      renderer: 'kanban',
      groupBy: 'status',
    });
    expect(parsed[0].source).toMatch(/character-board\.yaml$/);
  });

  it('rejects manifest with id mismatched to filename', async () => {
    await writeLens(
      tmp,
      'wrong-name',
      `id: right-name\nname: X\nrenderer: list\n`,
    );
    await expect(lensesCmd(tmp, { json: true })).rejects.toThrow(
      /does not match filename/,
    );
  });

  it('rejects manifest missing renderer', async () => {
    await writeLens(tmp, 'broken', `id: broken\nname: X\n`);
    await expect(lensesCmd(tmp, { json: true })).rejects.toThrow(/renderer/);
  });
});
