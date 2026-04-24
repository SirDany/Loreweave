import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { commitFile, isGitRepo } from '../src/git.js';

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

describe('sidecar git helper', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'lw-sidecar-git-'));
    git(dir, ['init', '-q', '-b', 'main']);
    // Local identity so commits work in CI regardless of global config.
    git(dir, ['config', 'user.name', 'Loreweave Test']);
    git(dir, ['config', 'user.email', 'test@loreweave.local']);
    // Seed an empty root commit so HEAD exists for the author tests.
    await fs.writeFile(path.join(dir, '.gitkeep'), '');
    git(dir, ['add', '.gitkeep']);
    git(dir, ['commit', '-q', '-m', 'root']);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('reports a repo as a repo', async () => {
    expect(await isGitRepo(dir)).toBe(true);
  });

  it('reports a plain dir as not a repo', async () => {
    const plain = await mkdtemp(path.join(tmpdir(), 'lw-sidecar-plain-'));
    try {
      expect(await isGitRepo(plain)).toBe(false);
    } finally {
      await rm(plain, { recursive: true, force: true });
    }
  });

  it('commits a newly written file and returns the short SHA', async () => {
    await fs.writeFile(path.join(dir, 'note.md'), '# Hello\n');
    const r = await commitFile(dir, 'note.md', 'Assistant (scribe): create note.md');
    expect(r).not.toBeNull();
    expect(r!.sha).toMatch(/^[0-9a-f]{40}$/);
    expect(r!.shortSha.length).toBeGreaterThanOrEqual(7);
    const log = git(dir, ['log', '-1', '--pretty=%s']);
    expect(log).toBe('Assistant (scribe): create note.md');
  });

  it('returns null when there is nothing to commit', async () => {
    await fs.writeFile(path.join(dir, 'same.md'), 'x');
    await commitFile(dir, 'same.md', 'first');
    // Re-commit the identical content.
    const second = await commitFile(dir, 'same.md', 'second');
    expect(second).toBeNull();
  });

  it('honors a caller-supplied author', async () => {
    await fs.writeFile(path.join(dir, 'auth.md'), 'a');
    await commitFile(dir, 'auth.md', 'by override', {
      name: 'Muse',
      email: 'muse@loreweave.test',
    });
    const author = git(dir, ['log', '-1', '--pretty=%an <%ae>']);
    expect(author).toBe('Muse <muse@loreweave.test>');
  });

  it('no-ops silently outside a git repo', async () => {
    const plain = await mkdtemp(path.join(tmpdir(), 'lw-sidecar-plain2-'));
    try {
      await fs.writeFile(path.join(plain, 'x.md'), 'x');
      const r = await commitFile(plain, 'x.md', 'ignored');
      expect(r).toBeNull();
    } finally {
      await rm(plain, { recursive: true, force: true });
    }
  });
});
