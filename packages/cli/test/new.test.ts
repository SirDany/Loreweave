import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newCmd } from '../src/commands/new.js';

let tmpRoot: string;

function parseFrontmatter(text: string): { data: Record<string, unknown>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text);
  if (!m) throw new Error('no frontmatter');
  return { data: YAML.parse(m[1]!) as Record<string, unknown>, body: m[2]! };
}

beforeAll(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lw-new-tests-'));
});
afterAll(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

async function makeSaga(name: string): Promise<string> {
  const root = path.join(tmpRoot, name);
  await fs.mkdir(path.join(root, 'codex'), { recursive: true });
  await fs.writeFile(
    path.join(root, 'saga.yaml'),
    'id: testsaga\ntitle: Test\n',
    'utf8',
  );
  return root;
}

describe('newCmd', () => {
  it('writes a stub markdown file with frontmatter', async () => {
    const root = await makeSaga('basic');
    await newCmd(root, 'character', 'aaron', { name: 'Aaron' });
    const file = path.join(root, 'codex', 'characters', 'aaron.md');
    const text = await fs.readFile(file, 'utf8');
    const parsed = parseFrontmatter(text);
    expect(parsed.data).toMatchObject({
      id: 'aaron',
      type: 'character',
      name: 'Aaron',
    });
    expect(parsed.body).toContain('# Aaron');
  });

  it('honours --visibility, --status, --tags', async () => {
    const root = await makeSaga('flags');
    await newCmd(root, 'character', 'mira', {
      visibility: 'private',
      status: 'draft',
      tags: 'protagonist, noble',
    });
    const text = await fs.readFile(
      path.join(root, 'codex', 'characters', 'mira.md'),
      'utf8',
    );
    const parsed = parseFrontmatter(text);
    expect(parsed.data).toMatchObject({
      visibility: 'private',
      status: 'draft',
      tags: ['protagonist', 'noble'],
    });
  });

  it('refuses duplicates without --force', async () => {
    const root = await makeSaga('dupe');
    await newCmd(root, 'character', 'aaron', {});
    const before = await fs.readFile(
      path.join(root, 'codex', 'characters', 'aaron.md'),
      'utf8',
    );
    process.exitCode = 0;
    await newCmd(root, 'character', 'aaron', { name: 'Different' });
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
    const after = await fs.readFile(
      path.join(root, 'codex', 'characters', 'aaron.md'),
      'utf8',
    );
    expect(after).toBe(before);
  });

  it('rejects non-kebab ids', async () => {
    const root = await makeSaga('badid');
    process.exitCode = 0;
    await newCmd(root, 'character', 'NotKebab', {});
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });

  it('rejects unknown kinds', async () => {
    const root = await makeSaga('badkind');
    process.exitCode = 0;
    await newCmd(root, 'made-up-kind', 'thing', {});
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });
});
