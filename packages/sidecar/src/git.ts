/**
 * Tiny `git` subprocess wrapper used by the sidecar to auto-commit approved
 * agent writes. Kept minimal on purpose — the CLI already has a fuller
 * `lw git` surface for the user-facing panel; this module only needs to
 * stage + commit a single file and report the resulting SHA.
 */
import { execFile } from 'node:child_process';

export interface GitCommitResult {
  /** Full commit SHA. */
  sha: string;
  /** Short form for UI display. */
  shortSha: string;
}

function run(cwd: string, args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    execFile(
      'git',
      args,
      { cwd, maxBuffer: 4 * 1024 * 1024, windowsHide: true, encoding: 'utf8' },
      (err, stdout, stderr) => {
        const code =
          err && typeof (err as { code?: number }).code === 'number'
            ? (err as { code: number }).code
            : err
              ? 1
              : 0;
        resolve({ stdout: stdout ?? '', stderr: stderr ?? '', code });
      },
    );
  });
}

/** True iff `dir` is inside a git work-tree. */
export async function isGitRepo(dir: string): Promise<boolean> {
  const r = await run(dir, ['rev-parse', '--is-inside-work-tree']);
  return r.code === 0 && r.stdout.trim() === 'true';
}

/**
 * Stage `relPath` and create a single commit with `message`. Silently no-ops
 * if `dir` is not a git repo. Throws on hard failures (e.g. merge in
 * progress, commit hook rejection, git not on PATH). Returns `null` if
 * there was nothing to commit — e.g. the apply wrote the same content that
 * was already on disk and/or already staged.
 */
export async function commitFile(
  dir: string,
  relPath: string,
  message: string,
  author?: { name: string; email: string },
): Promise<GitCommitResult | null> {
  if (!(await isGitRepo(dir))) return null;

  const add = await run(dir, ['add', '--', relPath]);
  if (add.code !== 0) {
    throw new Error(`git add failed: ${add.stderr.trim() || add.stdout.trim()}`);
  }

  // Bail if nothing is actually staged for this path — avoids empty commits
  // when an apply replays identical content.
  const diff = await run(dir, ['diff', '--cached', '--name-only', '--', relPath]);
  if (diff.code === 0 && diff.stdout.trim().length === 0) {
    return null;
  }

  const args = ['commit', '-m', message, '--only', '--', relPath];
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (author) {
    env.GIT_AUTHOR_NAME = author.name;
    env.GIT_AUTHOR_EMAIL = author.email;
    env.GIT_COMMITTER_NAME = author.name;
    env.GIT_COMMITTER_EMAIL = author.email;
  }
  const commit = await new Promise<{ stdout: string; stderr: string; code: number }>((resolve) => {
    execFile(
      'git',
      args,
      { cwd: dir, maxBuffer: 4 * 1024 * 1024, windowsHide: true, encoding: 'utf8', env },
      (err, stdout, stderr) => {
        const code =
          err && typeof (err as { code?: number }).code === 'number'
            ? (err as { code: number }).code
            : err
              ? 1
              : 0;
        resolve({ stdout: stdout ?? '', stderr: stderr ?? '', code });
      },
    );
  });
  if (commit.code !== 0) {
    throw new Error(`git commit failed: ${commit.stderr.trim() || commit.stdout.trim()}`);
  }

  const rev = await run(dir, ['rev-parse', 'HEAD']);
  const shortRev = await run(dir, ['rev-parse', '--short', 'HEAD']);
  return {
    sha: rev.stdout.trim(),
    shortSha: shortRev.stdout.trim(),
  };
}
