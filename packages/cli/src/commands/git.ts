import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import pc from "picocolors";

export interface GitOpts {
  json?: boolean;
  message?: string;
  branch?: string;
  limit?: number;
  all?: boolean;
  remote?: string;
  file?: string;
  staged?: boolean;
  url?: string;
}

interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

function runGit(cwd: string, args: string[]): Promise<ExecResult> {
  return new Promise((resolve) => {
    execFile(
      "git",
      args,
      { cwd, maxBuffer: 50 * 1024 * 1024, windowsHide: true, encoding: "utf8" },
      (err, stdout, stderr) => {
        const code = err && typeof (err as { code?: number }).code === "number"
          ? (err as { code: number }).code
          : err
            ? 1
            : 0;
        resolve({
          stdout: stdout ?? "",
          stderr: stderr ?? "",
          code,
        });
      },
    );
  });
}

async function ensureRepo(sagaPath: string): Promise<string> {
  const abs = path.resolve(sagaPath);
  const r = await runGit(abs, ["rev-parse", "--show-toplevel"]);
  if (r.code !== 0) {
    throw new Error(`not a git repository (or git not on PATH): ${abs}`);
  }
  return r.stdout.trim();
}

export interface GitStatus {
  repoRoot: string;
  branch: string | null;
  head: string;
  ahead: number;
  behind: number;
  upstream: string | null;
  files: Array<{ path: string; index: string; worktree: string; conflict: boolean }>;
  clean: boolean;
  hasConflicts: boolean;
  inMerge: boolean;
}

const CONFLICT_CODES = new Set(["DD", "AU", "UD", "UA", "DU", "AA", "UU"]);

export async function gitStatus(sagaPath: string): Promise<GitStatus> {
  const repoRoot = await ensureRepo(sagaPath);
  const [branchR, headR, statusR, upstreamR, mergeHeadR] = await Promise.all([
    runGit(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"]),
    runGit(repoRoot, ["rev-parse", "--short", "HEAD"]),
    runGit(repoRoot, ["status", "--porcelain=v1", "-b"]),
    runGit(repoRoot, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]),
    runGit(repoRoot, ["rev-parse", "--verify", "MERGE_HEAD"]),
  ]);

  const branch = branchR.code === 0 ? branchR.stdout.trim() : null;
  const head = headR.code === 0 ? headR.stdout.trim() : "";
  const upstream = upstreamR.code === 0 ? upstreamR.stdout.trim() : null;
  const inMerge = mergeHeadR.code === 0;

  let ahead = 0;
  let behind = 0;
  const files: GitStatus["files"] = [];
  let hasConflicts = false;
  for (const raw of statusR.stdout.split("\n")) {
    if (!raw) continue;
    if (raw.startsWith("##")) {
      const ah = raw.match(/ahead (\d+)/);
      const bh = raw.match(/behind (\d+)/);
      if (ah) ahead = Number(ah[1]);
      if (bh) behind = Number(bh[1]);
      continue;
    }
    const index = raw[0] ?? " ";
    const worktree = raw[1] ?? " ";
    const code = `${index}${worktree}`;
    const conflict = CONFLICT_CODES.has(code);
    if (conflict) hasConflicts = true;
    const p = raw.slice(3);
    files.push({ path: p, index, worktree, conflict });
  }

  return {
    repoRoot,
    branch: branch === "HEAD" ? null : branch,
    head,
    ahead,
    behind,
    upstream,
    files,
    clean: files.length === 0,
    hasConflicts,
    inMerge,
  };
}

export interface GitBranch {
  name: string;
  current: boolean;
  remote: boolean;
  head: string;
}

export async function gitBranches(sagaPath: string, all = false): Promise<GitBranch[]> {
  const repoRoot = await ensureRepo(sagaPath);
  const args = ["branch", "--format=%(HEAD)\t%(refname:short)\t%(objectname:short)"];
  if (all) args.push("-a");
  const r = await runGit(repoRoot, args);
  if (r.code !== 0) throw new Error(r.stderr.trim() || "git branch failed");
  const out: GitBranch[] = [];
  for (const line of r.stdout.split("\n")) {
    if (!line) continue;
    const [head, name, sha] = line.split("\t");
    out.push({
      name: (name ?? "").trim(),
      current: (head ?? "").trim() === "*",
      remote: (name ?? "").startsWith("remotes/"),
      head: (sha ?? "").trim(),
    });
  }
  return out;
}

export interface GitLogEntry {
  sha: string;
  shortSha: string;
  date: string;
  author: string;
  subject: string;
}

export async function gitLog(sagaPath: string, limit = 30): Promise<GitLogEntry[]> {
  const repoRoot = await ensureRepo(sagaPath);
  // Use a delimiter unlikely to appear in commit messages.
  const SEP = "\x1f";
  const REC = "\x1e";
  const fmt = ["%H", "%h", "%aI", "%an", "%s"].join(SEP) + REC;
  const r = await runGit(repoRoot, ["log", `-n${limit}`, `--pretty=format:${fmt}`]);
  if (r.code !== 0) {
    if (/does not have any commits yet/.test(r.stderr)) return [];
    throw new Error(r.stderr.trim() || "git log failed");
  }
  const out: GitLogEntry[] = [];
  for (const raw of r.stdout.split(REC)) {
    const t = raw.trim();
    if (!t) continue;
    const [sha, shortSha, date, author, subject] = t.split(SEP);
    out.push({
      sha: sha ?? "",
      shortSha: shortSha ?? "",
      date: date ?? "",
      author: author ?? "",
      subject: subject ?? "",
    });
  }
  return out;
}

export async function gitCommit(
  sagaPath: string,
  message: string,
  opts: { all?: boolean } = {},
): Promise<{ sha: string; subject: string }> {
  if (!message.trim()) throw new Error("commit message cannot be empty");
  const repoRoot = await ensureRepo(sagaPath);
  const stage = await runGit(repoRoot, opts.all ? ["add", "-A"] : ["add", sagaPath]);
  if (stage.code !== 0) throw new Error(stage.stderr.trim() || "git add failed");
  const r = await runGit(repoRoot, ["commit", "-m", message]);
  if (r.code !== 0) {
    throw new Error(r.stderr.trim() || r.stdout.trim() || "git commit failed");
  }
  const head = await runGit(repoRoot, ["rev-parse", "HEAD"]);
  return { sha: head.stdout.trim(), subject: message.split("\n")[0] ?? "" };
}

export async function gitCheckout(
  sagaPath: string,
  branch: string,
  opts: { create?: boolean } = {},
): Promise<void> {
  if (!/^[A-Za-z0-9._\-/]+$/.test(branch)) {
    throw new Error(`invalid branch name "${branch}"`);
  }
  const repoRoot = await ensureRepo(sagaPath);
  const args = opts.create ? ["checkout", "-b", branch] : ["checkout", branch];
  const r = await runGit(repoRoot, args);
  if (r.code !== 0) {
    throw new Error(r.stderr.trim() || r.stdout.trim() || "git checkout failed");
  }
}

export async function gitInit(sagaPath: string): Promise<string> {
  const abs = path.resolve(sagaPath);
  await fs.mkdir(abs, { recursive: true });
  const r = await runGit(abs, ["init"]);
  if (r.code !== 0) throw new Error(r.stderr.trim() || "git init failed");
  return r.stdout.trim();
}

export interface GitRemote {
  name: string;
  fetch: string;
  push: string;
}

export async function gitRemotes(sagaPath: string): Promise<GitRemote[]> {
  const repoRoot = await ensureRepo(sagaPath);
  const r = await runGit(repoRoot, ["remote", "-v"]);
  if (r.code !== 0) throw new Error(r.stderr.trim() || "git remote failed");
  const map = new Map<string, GitRemote>();
  for (const line of r.stdout.split("\n")) {
    const m = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/);
    if (!m) continue;
    const name = m[1] ?? "";
    const url = m[2] ?? "";
    const kind = m[3];
    if (!name) continue;
    const cur = map.get(name) ?? { name, fetch: "", push: "" };
    if (kind === "fetch") cur.fetch = url;
    else cur.push = url;
    map.set(name, cur);
  }
  return [...map.values()];
}

export async function gitRemoteAdd(
  sagaPath: string,
  name: string,
  url: string,
): Promise<void> {
  if (!/^[A-Za-z0-9._\-]+$/.test(name)) throw new Error(`invalid remote name "${name}"`);
  if (!url.trim()) throw new Error("remote url required");
  const repoRoot = await ensureRepo(sagaPath);
  const r = await runGit(repoRoot, ["remote", "add", name, url]);
  if (r.code !== 0) throw new Error(r.stderr.trim() || "git remote add failed");
}

export async function gitRemoteRemove(sagaPath: string, name: string): Promise<void> {
  if (!/^[A-Za-z0-9._\-]+$/.test(name)) throw new Error(`invalid remote name "${name}"`);
  const repoRoot = await ensureRepo(sagaPath);
  const r = await runGit(repoRoot, ["remote", "remove", name]);
  if (r.code !== 0) throw new Error(r.stderr.trim() || "git remote remove failed");
}

export async function gitFetch(
  sagaPath: string,
  remote?: string,
): Promise<{ output: string }> {
  const repoRoot = await ensureRepo(sagaPath);
  const args = ["fetch", "--prune"];
  if (remote) args.push(remote);
  const r = await runGit(repoRoot, args);
  if (r.code !== 0) throw new Error(r.stderr.trim() || "git fetch failed");
  return { output: (r.stdout + r.stderr).trim() };
}

export async function gitPull(
  sagaPath: string,
  remote?: string,
  branch?: string,
): Promise<{ output: string }> {
  const repoRoot = await ensureRepo(sagaPath);
  const args = ["pull", "--ff-only"];
  if (remote) {
    args.push(remote);
    if (branch) args.push(branch);
  }
  const r = await runGit(repoRoot, args);
  if (r.code !== 0) throw new Error(r.stderr.trim() || r.stdout.trim() || "git pull failed");
  return { output: (r.stdout + r.stderr).trim() };
}

export async function gitPush(
  sagaPath: string,
  remote?: string,
  branch?: string,
  setUpstream = false,
): Promise<{ output: string }> {
  const repoRoot = await ensureRepo(sagaPath);
  const args = ["push"];
  if (setUpstream) args.push("-u");
  if (remote) {
    args.push(remote);
    if (branch) args.push(branch);
  }
  const r = await runGit(repoRoot, args);
  if (r.code !== 0) throw new Error(r.stderr.trim() || r.stdout.trim() || "git push failed");
  return { output: (r.stdout + r.stderr).trim() };
}

export interface GitDiff {
  file: string;
  staged: boolean;
  patch: string;
}

export async function gitDiff(
  sagaPath: string,
  file?: string,
  staged = false,
): Promise<GitDiff> {
  const repoRoot = await ensureRepo(sagaPath);
  const args = ["diff", "--no-color", "--no-ext-diff"];
  if (staged) args.push("--cached");
  if (file) args.push("--", file);
  const r = await runGit(repoRoot, args);
  if (r.code !== 0 && !r.stdout) {
    throw new Error(r.stderr.trim() || "git diff failed");
  }
  return { file: file ?? "", staged, patch: r.stdout };
}

export async function gitMergeAbort(sagaPath: string): Promise<void> {
  const repoRoot = await ensureRepo(sagaPath);
  const r = await runGit(repoRoot, ["merge", "--abort"]);
  if (r.code !== 0) throw new Error(r.stderr.trim() || "git merge --abort failed");
}

export async function gitMergeContinue(sagaPath: string): Promise<void> {
  const repoRoot = await ensureRepo(sagaPath);
  // Stage everything currently in the working tree, then commit using the
  // existing MERGE_MSG. Writers usually want this one-button experience.
  const stage = await runGit(repoRoot, ["add", "-A"]);
  if (stage.code !== 0) throw new Error(stage.stderr.trim() || "git add failed");
  const r = await runGit(repoRoot, ["commit", "--no-edit"]);
  if (r.code !== 0) throw new Error(r.stderr.trim() || "git commit (merge continue) failed");
}

// ---------- CLI front-ends ----------

type Sub =
  | "status"
  | "branches"
  | "log"
  | "commit"
  | "checkout"
  | "init"
  | "remotes"
  | "remote-add"
  | "remote-remove"
  | "fetch"
  | "pull"
  | "push"
  | "diff"
  | "merge-abort"
  | "merge-continue";

function printStatus(s: GitStatus): void {
  const head = s.branch ? pc.cyan(s.branch) : pc.yellow("(detached)");
  const upstream = s.upstream ? pc.dim(` ⇄ ${s.upstream}`) : "";
  const trail =
    s.ahead || s.behind
      ? pc.dim(` [${s.ahead ? `ahead ${s.ahead}` : ""}${s.ahead && s.behind ? ", " : ""}${s.behind ? `behind ${s.behind}` : ""}]`)
      : "";
  console.log(`${head} @ ${pc.yellow(s.head)}${upstream}${trail}`);
  console.log(pc.dim(s.repoRoot));
  if (s.inMerge) console.log(pc.red("MERGING — resolve conflicts and commit, or abort."));
  if (s.clean) {
    console.log(pc.green("clean working tree"));
    return;
  }
  for (const f of s.files) {
    if (f.conflict) {
      console.log(`${pc.red("UU")} ${pc.red(f.path)} ${pc.red("(conflict)")}`);
      continue;
    }
    const idx = f.index === " " ? " " : pc.green(f.index);
    const wt = f.worktree === " " ? " " : pc.red(f.worktree);
    console.log(`${idx}${wt} ${f.path}`);
  }
}

export async function gitCmd(sub: string, saga: string, opts: GitOpts): Promise<void> {
  try {
    switch (sub as Sub) {
      case "status": {
        const s = await gitStatus(saga);
        if (opts.json) console.log(JSON.stringify(s, null, 2));
        else printStatus(s);
        return;
      }
      case "branches": {
        const b = await gitBranches(saga, !!opts.all);
        if (opts.json) console.log(JSON.stringify(b, null, 2));
        else
          for (const x of b)
            console.log(`${x.current ? pc.green("*") : " "} ${x.name} ${pc.dim(x.head)}`);
        return;
      }
      case "log": {
        const l = await gitLog(saga, opts.limit ?? 30);
        if (opts.json) console.log(JSON.stringify(l, null, 2));
        else
          for (const e of l)
            console.log(
              `${pc.yellow(e.shortSha)} ${pc.dim(e.date)} ${pc.cyan(e.author)} ${e.subject}`,
            );
        return;
      }
      case "commit": {
        if (!opts.message) throw new Error("--message <msg> is required for commit");
        const r = await gitCommit(saga, opts.message, { all: opts.all });
        if (opts.json) console.log(JSON.stringify(r, null, 2));
        else console.log(pc.green(`committed ${r.sha.slice(0, 7)}`), r.subject);
        return;
      }
      case "checkout": {
        if (!opts.branch) throw new Error("--branch <name> is required for checkout");
        await gitCheckout(saga, opts.branch, { create: !!opts.all });
        if (!opts.json) console.log(pc.green(`switched to ${opts.branch}`));
        return;
      }
      case "init": {
        const out = await gitInit(saga);
        if (!opts.json) console.log(pc.green(out || "initialized"));
        return;
      }
      case "remotes": {
        const r = await gitRemotes(saga);
        if (opts.json) console.log(JSON.stringify(r, null, 2));
        else
          for (const x of r)
            console.log(`${pc.cyan(x.name)} ${pc.dim(x.fetch)}${x.push !== x.fetch ? " (push: " + pc.dim(x.push) + ")" : ""}`);
        return;
      }
      case "remote-add": {
        if (!opts.remote) throw new Error("--remote <name> required");
        if (!opts.url) throw new Error("--url <url> required");
        await gitRemoteAdd(saga, opts.remote, opts.url);
        if (!opts.json) console.log(pc.green(`added remote ${opts.remote}`));
        return;
      }
      case "remote-remove": {
        if (!opts.remote) throw new Error("--remote <name> required");
        await gitRemoteRemove(saga, opts.remote);
        if (!opts.json) console.log(pc.green(`removed remote ${opts.remote}`));
        return;
      }
      case "fetch": {
        const r = await gitFetch(saga, opts.remote);
        if (opts.json) console.log(JSON.stringify(r, null, 2));
        else console.log(r.output || pc.green("fetched"));
        return;
      }
      case "pull": {
        const r = await gitPull(saga, opts.remote, opts.branch);
        if (opts.json) console.log(JSON.stringify(r, null, 2));
        else console.log(r.output || pc.green("pulled"));
        return;
      }
      case "push": {
        const r = await gitPush(saga, opts.remote, opts.branch, !!opts.all);
        if (opts.json) console.log(JSON.stringify(r, null, 2));
        else console.log(r.output || pc.green("pushed"));
        return;
      }
      case "diff": {
        const r = await gitDiff(saga, opts.file, !!opts.staged);
        if (opts.json) console.log(JSON.stringify(r, null, 2));
        else process.stdout.write(r.patch);
        return;
      }
      case "merge-abort": {
        await gitMergeAbort(saga);
        if (!opts.json) console.log(pc.green("merge aborted"));
        return;
      }
      case "merge-continue": {
        await gitMergeContinue(saga);
        if (!opts.json) console.log(pc.green("merge committed"));
        return;
      }
      default:
        console.error(`unknown subcommand "${sub}"`);
        console.error(
          "usage: lw git <status|branches|log|commit|checkout|init|remotes|remote-add|remote-remove|fetch|pull|push|diff|merge-abort|merge-continue> <saga> [options]",
        );
        process.exit(1);
    }
  } catch (e) {
    console.error(pc.red((e as Error).message));
    process.exit(1);
  }
}
