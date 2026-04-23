import { useCallback, useEffect, useState } from "react";
import {
  gitBranches,
  gitCheckout,
  gitCommit,
  gitDiff,
  gitFetch,
  gitInit,
  gitLog,
  gitMergeAbort,
  gitMergeContinue,
  gitPull,
  gitPush,
  gitRemoteAdd,
  gitRemoteRemove,
  gitRemotes,
  gitStatus,
  runBackup,
  type BackupResult,
  type GitBranch,
  type GitLogEntry,
  type GitRemote,
  type GitStatus,
} from "../lib/lw.js";
import { DiffViewer } from "./DiffViewer.js";

interface Props {
  sagaPath: string;
  onChanged: () => void;
}

interface DiffState {
  file: string;
  patch: string;
}

/**
 * Local-first git surface for writers: branch + dirty file list with a built-in
 * diff viewer, conflict banner with abort/continue, commit, branch switch /
 * create, remote management, fetch / pull / push, and a recent commit log.
 *
 * All operations shell out via `lw git <sub>` through the existing CLI bridge.
 */
export function VersionsPanel({ sagaPath, onChanged }: Props) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [remotes, setRemotes] = useState<GitRemote[]>([]);
  const [log, setLog] = useState<GitLogEntry[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [needsInit, setNeedsInit] = useState(false);
  const [message, setMessage] = useState("");
  const [newBranch, setNewBranch] = useState("");
  const [remoteName, setRemoteName] = useState("");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [pushRemote, setPushRemote] = useState("origin");
  const [diff, setDiff] = useState<DiffState | null>(null);
  const [backupLabel, setBackupLabel] = useState("");
  const [backupKeep, setBackupKeep] = useState("");
  const [lastBackup, setLastBackup] = useState<BackupResult | null>(null);

  const refresh = useCallback(async () => {
    setErr(null);
    try {
      const s = await gitStatus(sagaPath);
      setStatus(s);
      setNeedsInit(false);
      const [b, l, r] = await Promise.all([
        gitBranches(sagaPath).catch(() => [] as GitBranch[]),
        gitLog(sagaPath, 20).catch(() => [] as GitLogEntry[]),
        gitRemotes(sagaPath).catch(() => [] as GitRemote[]),
      ]);
      setBranches(b);
      setLog(l);
      setRemotes(r);
      if (r.length > 0 && !r.some((x) => x.name === pushRemote)) {
        setPushRemote(r[0]!.name);
      }
    } catch (e) {
      const msg = (e as Error).message;
      setStatus(null);
      setBranches([]);
      setLog([]);
      setRemotes([]);
      if (/not a git repository/i.test(msg)) {
        setNeedsInit(true);
      } else {
        setErr(msg);
      }
    }
  }, [sagaPath, pushRemote]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const wrap = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr(null);
    setInfo(null);
    try {
      const out = await fn();
      if (typeof out === "object" && out && "output" in out) {
        const text = String((out as { output: unknown }).output ?? "").trim();
        if (text) setInfo(`${label}:\n${text}`);
        else setInfo(`${label}: ok`);
      } else {
        setInfo(`${label}: ok`);
      }
      await refresh();
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const showDiff = async (file: string) => {
    setBusy(true);
    setErr(null);
    try {
      const d = await gitDiff(sagaPath, file, false);
      const staged = await gitDiff(sagaPath, file, true);
      const patch = [staged.patch, d.patch].filter((s) => s.trim()).join("\n");
      setDiff({ file, patch });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (needsInit) {
    return (
      <div className="p-6 text-sm text-stone-300">
        <div className="mb-3">
          This Saga is not in a git repository yet. Initialize one to track
          versions, switch between branches (e.g. drafts vs canon), and roll
          back changes.
        </div>
        <button
          onClick={() => void wrap("git init", () => gitInit(sagaPath))}
          disabled={busy}
          className="px-3 py-1 rounded border border-amber-500 bg-amber-900/40 text-amber-100 hover:bg-amber-800/50 disabled:opacity-50"
        >
          {busy ? "Initializing…" : "git init"}
        </button>
        {err && <div className="mt-3 text-rose-400 text-xs">{err}</div>}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden text-sm">
      <header className="px-6 py-3 border-b border-stone-800 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-stone-100">
            {status?.branch ? (
              <>
                <span className="text-amber-300">⎇ {status.branch}</span>
                <span className="text-stone-500 ml-2">@ {status.head}</span>
              </>
            ) : (
              <span className="text-yellow-400">(detached HEAD)</span>
            )}
            {status?.upstream && (
              <span className="text-stone-500 ml-2">⇄ {status.upstream}</span>
            )}
            {status && (status.ahead || status.behind) ? (
              <span className="text-stone-500 ml-2">
                {status.ahead ? `↑${status.ahead}` : ""}
                {status.behind ? ` ↓${status.behind}` : ""}
              </span>
            ) : null}
          </div>
          <div className="text-xs text-stone-500 truncate">{status?.repoRoot}</div>
        </div>
        <button
          onClick={() => void refresh()}
          disabled={busy}
          className="px-2 py-1 rounded border border-stone-700 text-stone-300 hover:bg-stone-800 text-xs"
        >
          Refresh
        </button>
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {err && (
          <div className="text-rose-400 text-xs whitespace-pre-wrap border border-rose-900 bg-rose-950/40 rounded p-2">
            {err}
          </div>
        )}
        {info && (
          <div className="text-emerald-300 text-xs whitespace-pre-wrap border border-emerald-900 bg-emerald-950/40 rounded p-2">
            {info}
          </div>
        )}

        {/* Conflict banner */}
        {(status?.inMerge || status?.hasConflicts) && (
          <section className="border border-rose-700 bg-rose-950/40 rounded p-3 space-y-2">
            <div className="text-rose-200 text-sm font-semibold">
              Merge in progress — conflicts to resolve.
            </div>
            <div className="text-xs text-rose-200/80">
              Edit the conflicting files (look for <code>{"<<<<<<<"}</code> markers),
              then continue. Or abort to drop the merge entirely.
            </div>
            <div className="flex gap-2">
              <button
                onClick={() =>
                  void wrap("merge --continue", () => gitMergeContinue(sagaPath))
                }
                disabled={busy || (status?.hasConflicts ?? false)}
                title={
                  status?.hasConflicts
                    ? "Resolve all conflict markers first"
                    : "Stage all and commit the merge"
                }
                className="px-3 py-1 rounded border border-emerald-500 bg-emerald-900/40 text-emerald-100 hover:bg-emerald-800/50 disabled:opacity-40 text-xs"
              >
                Continue merge
              </button>
              <button
                onClick={() =>
                  void wrap("merge --abort", () => gitMergeAbort(sagaPath))
                }
                disabled={busy}
                className="px-3 py-1 rounded border border-rose-500 bg-rose-900/40 text-rose-100 hover:bg-rose-800/50 disabled:opacity-40 text-xs"
              >
                Abort merge
              </button>
            </div>
          </section>
        )}

        {/* Working tree */}
        <section>
          <h3 className="text-xs uppercase tracking-wide text-stone-500 mb-2">
            Working tree
          </h3>
          {status?.clean ? (
            <div className="text-emerald-400 text-xs">Clean — nothing to commit.</div>
          ) : (
            <ul className="text-xs font-mono space-y-0.5">
              {status?.files.map((f) => (
                <li key={f.path} className="flex gap-2 items-center">
                  {f.conflict ? (
                    <span className="text-rose-400 w-6">UU</span>
                  ) : (
                    <>
                      <span className="text-emerald-400 w-3">
                        {f.index === " " ? "·" : f.index}
                      </span>
                      <span className="text-rose-400 w-3">
                        {f.worktree === " " ? "·" : f.worktree}
                      </span>
                    </>
                  )}
                  <button
                    onClick={() => void showDiff(f.path)}
                    className={
                      "text-left truncate flex-1 hover:underline " +
                      (f.conflict ? "text-rose-300" : "text-stone-200")
                    }
                    title="Show diff"
                  >
                    {f.path}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex gap-2">
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="commit message"
              className="flex-1 bg-stone-950 border border-stone-700 rounded px-2 py-1 text-xs"
            />
            <button
              onClick={() =>
                void wrap("commit", async () => {
                  await gitCommit(sagaPath, message.trim(), true);
                  setMessage("");
                })
              }
              disabled={
                busy ||
                !message.trim() ||
                (status?.clean ?? true) ||
                (status?.hasConflicts ?? false)
              }
              className="px-3 py-1 rounded border border-amber-500 bg-amber-900/40 text-amber-100 hover:bg-amber-800/50 disabled:opacity-40 text-xs"
            >
              Commit all
            </button>
          </div>
        </section>

        {/* Branches */}
        <section>
          <h3 className="text-xs uppercase tracking-wide text-stone-500 mb-2">
            Branches
          </h3>
          <ul className="space-y-0.5">
            {branches
              .filter((b) => !b.remote)
              .map((b) => (
                <li key={b.name} className="flex items-center gap-2 text-xs">
                  <span className={"w-3 " + (b.current ? "text-amber-300" : "text-stone-600")}>
                    {b.current ? "●" : "○"}
                  </span>
                  <span className={b.current ? "text-amber-300" : "text-stone-200"}>
                    {b.name}
                  </span>
                  <span className="text-stone-600">{b.head}</span>
                  {!b.current && (
                    <button
                      onClick={() =>
                        void wrap("checkout " + b.name, () =>
                          gitCheckout(sagaPath, b.name, false),
                        )
                      }
                      disabled={busy}
                      className="ml-auto text-stone-400 hover:text-stone-100"
                    >
                      switch
                    </button>
                  )}
                </li>
              ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <input
              value={newBranch}
              onChange={(e) => setNewBranch(e.target.value)}
              placeholder="new branch name"
              className="flex-1 bg-stone-950 border border-stone-700 rounded px-2 py-1 text-xs"
            />
            <button
              onClick={() =>
                void wrap("checkout -b " + newBranch.trim(), async () => {
                  await gitCheckout(sagaPath, newBranch.trim(), true);
                  setNewBranch("");
                })
              }
              disabled={busy || !/^[A-Za-z0-9._\-/]+$/.test(newBranch.trim())}
              className="px-3 py-1 rounded border border-stone-700 text-stone-200 hover:bg-stone-800 text-xs"
            >
              Create & switch
            </button>
          </div>
        </section>

        {/* Remotes & sync */}
        <section>
          <h3 className="text-xs uppercase tracking-wide text-stone-500 mb-2">
            Remotes & sync
          </h3>
          {remotes.length === 0 ? (
            <div className="text-stone-500 text-xs">No remotes configured.</div>
          ) : (
            <ul className="space-y-0.5 mb-3">
              {remotes.map((r) => (
                <li key={r.name} className="flex items-center gap-2 text-xs font-mono">
                  <span className="text-cyan-400 w-16 truncate">{r.name}</span>
                  <span className="text-stone-500 truncate flex-1">{r.fetch}</span>
                  <button
                    onClick={() =>
                      void wrap("remote remove " + r.name, () =>
                        gitRemoteRemove(sagaPath, r.name),
                      )
                    }
                    disabled={busy}
                    className="text-stone-500 hover:text-rose-400"
                    title="Remove remote"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="grid grid-cols-[6rem_1fr_auto] gap-2 mb-3">
            <input
              value={remoteName}
              onChange={(e) => setRemoteName(e.target.value)}
              placeholder="origin"
              className="bg-stone-950 border border-stone-700 rounded px-2 py-1 text-xs font-mono"
            />
            <input
              value={remoteUrl}
              onChange={(e) => setRemoteUrl(e.target.value)}
              placeholder="git@host:user/repo.git"
              className="bg-stone-950 border border-stone-700 rounded px-2 py-1 text-xs font-mono"
            />
            <button
              onClick={() =>
                void wrap("remote add " + remoteName.trim(), async () => {
                  await gitRemoteAdd(sagaPath, remoteName.trim(), remoteUrl.trim());
                  setRemoteName("");
                  setRemoteUrl("");
                })
              }
              disabled={busy || !remoteName.trim() || !remoteUrl.trim()}
              className="px-3 py-1 rounded border border-stone-700 text-stone-200 hover:bg-stone-800 text-xs"
            >
              Add remote
            </button>
          </div>

          {remotes.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={pushRemote}
                onChange={(e) => setPushRemote(e.target.value)}
                className="bg-stone-950 border border-stone-700 rounded px-2 py-1 text-xs"
              >
                {remotes.map((r) => (
                  <option key={r.name} value={r.name}>
                    {r.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => void wrap("fetch", () => gitFetch(sagaPath, pushRemote))}
                disabled={busy}
                className="px-3 py-1 rounded border border-stone-700 text-stone-200 hover:bg-stone-800 text-xs"
              >
                Fetch
              </button>
              <button
                onClick={() =>
                  void wrap("pull --ff-only", () =>
                    gitPull(sagaPath, pushRemote, status?.branch ?? undefined),
                  )
                }
                disabled={busy || !status?.branch}
                className="px-3 py-1 rounded border border-stone-700 text-stone-200 hover:bg-stone-800 text-xs"
              >
                Pull
              </button>
              <button
                onClick={() =>
                  void wrap("push", () =>
                    gitPush(
                      sagaPath,
                      pushRemote,
                      status?.branch ?? undefined,
                      !status?.upstream,
                    ),
                  )
                }
                disabled={busy || !status?.branch || (status?.hasConflicts ?? false)}
                className="px-3 py-1 rounded border border-amber-500 bg-amber-900/40 text-amber-100 hover:bg-amber-800/50 disabled:opacity-40 text-xs"
              >
                Push{!status?.upstream ? " (set upstream)" : ""}
              </button>
            </div>
          )}
        </section>

        {/* Log */}
        <section>
          <h3 className="text-xs uppercase tracking-wide text-stone-500 mb-2">
            Recent commits
          </h3>
          {log.length === 0 ? (
            <div className="text-stone-500 text-xs">No commits yet.</div>
          ) : (
            <ul className="space-y-1">
              {log.map((e) => (
                <li key={e.sha} className="text-xs">
                  <span className="text-yellow-400 font-mono">{e.shortSha}</span>{" "}
                  <span className="text-stone-500">
                    {new Date(e.date).toLocaleString()}
                  </span>{" "}
                  <span className="text-cyan-400">{e.author}</span>
                  <div className="text-stone-200 ml-12 truncate">{e.subject}</div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Backup */}
        <section>
          <h3 className="text-xs uppercase tracking-wide text-stone-500 mb-2">
            Backup snapshot
          </h3>
          <p className="text-xs text-stone-500 mb-2">
            Zips the saga (excluding <code>.git</code>, <code>node_modules</code>,
            and prior backups) into <code>.loreweave/backups/</code>.
          </p>
          <div className="flex flex-wrap gap-2 items-center">
            <input
              type="text"
              placeholder="label (optional)"
              value={backupLabel}
              onChange={(e) => setBackupLabel(e.target.value)}
              className="flex-1 min-w-[160px] px-2 py-1 rounded bg-stone-900 border border-stone-700 text-stone-100 text-xs"
            />
            <input
              type="number"
              min={1}
              placeholder="keep N"
              value={backupKeep}
              onChange={(e) => setBackupKeep(e.target.value)}
              className="w-24 px-2 py-1 rounded bg-stone-900 border border-stone-700 text-stone-100 text-xs"
            />
            <button
              type="button"
              onClick={() =>
                void wrap("backup", async () => {
                  const keepNum = backupKeep.trim()
                    ? Number.parseInt(backupKeep, 10)
                    : undefined;
                  const res = await runBackup(sagaPath, {
                    label: backupLabel.trim() || undefined,
                    keep: Number.isFinite(keepNum) ? keepNum : undefined,
                  });
                  setLastBackup(res);
                  setBackupLabel("");
                  return { output: `wrote ${res.path} (${res.bytes} B)` };
                })
              }
              disabled={busy}
              className="px-3 py-1 rounded border border-emerald-500 bg-emerald-900/40 text-emerald-100 hover:bg-emerald-800/50 disabled:opacity-40 text-xs"
            >
              Back up now
            </button>
          </div>
          {lastBackup && (
            <div className="mt-2 text-xs text-stone-400 break-all">
              Last: <span className="font-mono">{lastBackup.path}</span>
              {lastBackup.pruned.length > 0
                ? ` · pruned ${lastBackup.pruned.length}`
                : ""}
            </div>
          )}
        </section>
      </div>

      {diff && (
        <DiffViewer file={diff.file} patch={diff.patch} onClose={() => setDiff(null)} />
      )}
    </div>
  );
}
