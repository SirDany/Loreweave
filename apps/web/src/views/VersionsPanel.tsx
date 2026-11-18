import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  Bot,
  Check,
  Clock,
  Eye,
  FileEdit,
  GitBranch as GitBranchIcon,
  Globe,
  Lock,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  Unlock,
} from 'lucide-react';
import {
  gitBranches,
  gitBranchDelete,
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
  gitRemotes,
  gitStatus,
  runBackup,
  type BackupResult,
  type GitBranch,
  type GitLogEntry,
  type GitRemote,
  type GitStatus,
} from '../lib/lw.js';
import { cn } from '../lib/utils.js';
import { DiffViewer } from './DiffViewer.js';

interface Props {
  sagaPath: string;
  onChanged: () => void;
  openAssistant?: (seed: { prompt?: string }) => void;
}

interface DiffState {
  file: string;
  patch: string;
}

const PRIVATE_BRANCHES_KEY = (sagaPath: string) => `lw.private-branches.${sagaPath}`;

function loadPrivateBranches(sagaPath: string): Set<string> {
  try {
    const raw = localStorage.getItem(PRIVATE_BRANCHES_KEY(sagaPath));
    if (raw) return new Set(JSON.parse(raw));
  } catch {
    /* ignore */
  }
  return new Set();
}

function savePrivateBranches(sagaPath: string, set: Set<string>) {
  try {
    localStorage.setItem(
      PRIVATE_BRANCHES_KEY(sagaPath),
      JSON.stringify(Array.from(set)),
    );
  } catch {
    /* ignore */
  }
}

/**
 * Writer-centric Story Timeline & Revisions panel.
 * Replaces technical Git GUI with a streamlined storyline & draft management experience:
 * - Switching, creating, and deleting alternate drafts
 * - Designating private drafts (local-only, avoiding cloud push)
 * - Automatic background checkpoints & 1-click cloud sync
 * - Visual diff and conflict resolution via Scribe
 */
export function VersionsPanel({ sagaPath, onChanged, openAssistant }: Props) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [remotes, setRemotes] = useState<GitRemote[]>([]);
  const [log, setLog] = useState<GitLogEntry[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [needsInit, setNeedsInit] = useState(false);

  // Storylines & Draft state
  const [newDraftName, setNewDraftName] = useState('');
  const [newDraftPrivate, setNewDraftPrivate] = useState(false);
  const [checkpointNote, setCheckpointNote] = useState('');
  const [privateBranches, setPrivateBranches] = useState<Set<string>>(() =>
    loadPrivateBranches(sagaPath),
  );

  // Backup & Diff
  const [diff, setDiff] = useState<DiffState | null>(null);
  const [lastBackup, setLastBackup] = useState<BackupResult | null>(null);

  // Update private branches on saga change
  useEffect(() => {
    setPrivateBranches(loadPrivateBranches(sagaPath));
  }, [sagaPath]);

  const toggleBranchPrivate = useCallback(
    (branchName: string) => {
      setPrivateBranches((prev) => {
        const next = new Set(prev);
        if (next.has(branchName)) {
          next.delete(branchName);
        } else {
          next.add(branchName);
        }
        savePrivateBranches(sagaPath, next);
        return next;
      });
    },
    [sagaPath],
  );

  const refresh = useCallback(async () => {
    setErr(null);
    try {
      const s = await gitStatus(sagaPath);
      setStatus(s);
      setNeedsInit(false);
      const [b, l, r] = await Promise.all([
        gitBranches(sagaPath).catch(() => [] as GitBranch[]),
        gitLog(sagaPath, 25).catch(() => [] as GitLogEntry[]),
        gitRemotes(sagaPath).catch(() => [] as GitRemote[]),
      ]);
      setBranches(b);
      setLog(l);
      setRemotes(r);
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
  }, [sagaPath]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const wrapAction = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr(null);
    setInfo(null);
    try {
      const out = await fn();
      if (typeof out === 'object' && out && 'output' in out) {
        const text = String((out as { output: unknown }).output ?? '').trim();
        setInfo(text || `${label} complete.`);
      } else {
        setInfo(`${label} complete.`);
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
      const patch = [staged.patch, d.patch].filter((s) => s.trim()).join('\n');
      setDiff({ file, patch });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const activeLocalBranch =
    status?.branch ??
    branches.find((b) => b.current && !b.remote)?.name ??
    null;
  const currentBranchName =
    activeLocalBranch ?? (status?.head ? `detached@${status.head}` : 'main');
  const isCurrentPrivate = privateBranches.has(currentBranchName);
  const isDefaultBranch =
    currentBranchName === 'main' ||
    currentBranchName === 'master' ||
    currentBranchName === 'trunk';

  const localBranches = (() => {
    const list = branches.filter((b) => !b.remote);
    if (list.length === 0 && activeLocalBranch) {
      return [
        {
          name: activeLocalBranch,
          current: true,
          remote: false,
          head: status?.head ?? '',
        },
      ];
    }
    return list;
  })();

  // 1-Click Cloud Sync
  const handleSync = async () => {
    if (isCurrentPrivate) {
      setInfo('🔒 Current draft is Private (Local Only). Skipping cloud upload.');
      return;
    }
    await wrapAction('Sync', async () => {
      const remote = remotes[0]?.name || 'origin';
      if (remotes.length > 0) {
        await gitFetch(sagaPath, remote).catch(() => {});
        await gitPull(sagaPath, remote, currentBranchName).catch(() => {});
        await gitPush(sagaPath, remote, currentBranchName, !status?.upstream);
      }
    });
  };

  // 1-Click Checkpoint
  const handleSaveCheckpoint = async () => {
    const note =
      checkpointNote.trim() ||
      `Draft revisions on ${new Date().toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })}`;

    await wrapAction('Checkpoint', async () => {
      await gitCommit(sagaPath, note, true);
      setCheckpointNote('');
    });
  };

  // Create alternate storyline
  const handleCreateStoryline = async () => {
    if (!newDraftName.trim()) return;
    const cleanName = newDraftName
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9._\-/]/g, '');

    await wrapAction(`Create draft "${cleanName}"`, async () => {
      await gitCheckout(sagaPath, cleanName, true);
      if (newDraftPrivate) {
        setPrivateBranches((prev) => {
          const next = new Set(prev);
          next.add(cleanName);
          savePrivateBranches(sagaPath, next);
          return next;
        });
      }
      setNewDraftName('');
      setNewDraftPrivate(false);
    });
  };

  // Delete alternate storyline
  const handleDeleteStoryline = async (bName: string) => {
    if (bName === 'main' || bName === 'master') return;
    if (!confirm(`Are you sure you want to delete the alternate storyline "${bName}"?`)) {
      return;
    }
    await wrapAction(`Delete storyline "${bName}"`, async () => {
      await gitBranchDelete(sagaPath, bName, { force: true });
      setPrivateBranches((prev) => {
        const next = new Set(prev);
        next.delete(bName);
        savePrivateBranches(sagaPath, next);
        return next;
      });
    });
  };

  if (needsInit) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-card/40">
        <div className="max-w-md space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 border border-primary/20 text-primary">
            <Clock className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">
            Enable Timeline & Revision History
          </h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Turn your Saga into an auto-versioned manuscript. Track draft iterations,
            switch between alternate storylines, and safely rollback changes whenever needed.
          </p>
          <button
            type="button"
            onClick={() => void wrapAction('Timeline Initialization', () => gitInit(sagaPath))}
            disabled={busy}
            className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-all shadow-md"
          >
            {busy ? 'Setting up…' : 'Initialize Story Timeline'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden text-xs animate-panel-enter">
      {/* Top Bar: Storyline & Sync Status */}
      <header className="px-6 py-4 border-b border-border/70 flex items-center justify-between gap-4 bg-card/40 backdrop-blur-md">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 border border-primary/30 text-primary">
            <GitBranchIcon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm text-foreground truncate">
                {isDefaultBranch ? 'Main Storyline' : currentBranchName}
              </span>
              <code className="rounded border border-border/70 bg-background/60 px-1.5 py-0.5 font-mono text-[11px] text-primary">
                {currentBranchName}
              </code>
              {isDefaultBranch && (
                <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary uppercase tracking-wider">
                  Canon
                </span>
              )}
              {isCurrentPrivate ? (
                <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 text-[10px] text-amber-300 font-medium">
                  <Lock className="h-2.5 w-2.5" />
                  Private Draft
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 text-[10px] text-emerald-300 font-medium">
                  <Globe className="h-2.5 w-2.5" />
                  Cloud Synced
                </span>
              )}
            </div>
            <div className="text-[11px] text-muted-foreground flex items-center gap-2 mt-0.5 flex-wrap">
              <span>{log.length} recorded revision checkpoints</span>
              {status?.head && (
                <code className="font-mono text-muted-foreground/80">
                  @{status.head}
                </code>
              )}
              {remotes[0]?.name && (
                <span>
                  remote: <code className="font-mono">{remotes[0].name}</code>
                </span>
              )}
              {status && (status.ahead > 0 || status.behind > 0) && (
                <span className="text-primary font-medium">
                  ({status.ahead > 0 ? `${status.ahead} local to sync` : ''}
                  {status.ahead > 0 && status.behind > 0 ? ', ' : ''}
                  {status.behind > 0 ? `${status.behind} cloud updates` : ''})
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Privacy toggle button */}
          <button
            type="button"
            onClick={() => toggleBranchPrivate(currentBranchName)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/80 bg-card hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors text-xs font-medium"
            title={
              isCurrentPrivate
                ? 'Make Public (Syncs to Cloud)'
                : 'Mark as Private (Keep on this computer only)'
            }
          >
            {isCurrentPrivate ? (
              <>
                <Unlock className="h-3 w-3 text-amber-400" />
                <span>Make Cloud-Synced</span>
              </>
            ) : (
              <>
                <Lock className="h-3 w-3 text-muted-foreground" />
                <span>Make Private (Local Only)</span>
              </>
            )}
          </button>

          {/* Sync Button */}
          {remotes.length > 0 && !isCurrentPrivate && (
            <button
              type="button"
              onClick={() => void handleSync()}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg bg-primary/10 border border-primary/30 px-3.5 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={cn('h-3 w-3', busy && 'animate-spin')} />
              <span>Sync with Cloud</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => void refresh()}
            disabled={busy}
            className="p-1.5 rounded-lg border border-border/70 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Refresh status"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', busy && 'animate-spin')} />
          </button>
        </div>
      </header>

      {/* Main Content Areas */}
      <div className="flex-1 overflow-auto p-6 space-y-6 scrollbar-ember">
        {err && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="whitespace-pre-wrap">{err}</div>
          </div>
        )}

        {info && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300 flex items-start gap-2">
            <Check className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="whitespace-pre-wrap">{info}</div>
          </div>
        )}

        {/* Conflict Resolution Banner */}
        {(status?.inMerge || status?.hasConflicts) && (
          <section className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 space-y-3">
            <div className="flex items-center gap-2 text-rose-300 font-semibold text-sm">
              <AlertTriangle className="h-4 w-4" />
              <span>Storyline Discrepancy Detected</span>
            </div>
            <p className="text-xs text-rose-200/90 leading-relaxed">
              Your local storyline and the cloud version contain conflicting edits. You can
              ask <strong>Scribe</strong> to intelligently harmonize both versions, or choose
              which story changes to keep.
            </p>
            <div className="flex items-center gap-2.5 flex-wrap pt-1">
              {openAssistant && (
                <button
                  type="button"
                  onClick={() => {
                    openAssistant({
                      prompt:
                        'I have storyline discrepancies and merge conflicts in my Saga. Please examine the conflicting files, summarize the differences, and reconcile them so canon integrity is preserved.',
                    });
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium text-xs hover:opacity-90 shadow-sm"
                >
                  <Bot className="h-3.5 w-3.5" />
                  <span>Ask Scribe to Reconcile</span>
                </button>
              )}
              <button
                type="button"
                onClick={() =>
                  void wrapAction('Accept Story Merge', () => gitMergeContinue(sagaPath))
                }
                disabled={busy}
                className="px-3 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 text-xs font-medium"
              >
                Accept Reconciled Changes
              </button>
              <button
                type="button"
                onClick={() =>
                  void wrapAction('Cancel Reconcile', () => gitMergeAbort(sagaPath))
                }
                disabled={busy}
                className="px-3 py-1.5 rounded-lg border border-rose-500/40 bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 text-xs font-medium"
              >
                Cancel & Keep Local
              </button>
            </div>
          </section>
        )}

        {/* Section 1: Storylines / Alternate Drafts */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs uppercase tracking-wider font-semibold text-primary">
                Storylines & Alternate Drafts
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Explore different story arcs, character fates, and revisions without altering the canon story.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {localBranches.map((b) => {
                const isDefault = b.name === 'main' || b.name === 'master';
                const isPriv = privateBranches.has(b.name);
                const isActive = b.current;

                return (
                  <div
                    key={b.name}
                    className={cn(
                      'rounded-xl border p-3.5 flex flex-col justify-between gap-3 transition-all',
                      isActive
                        ? 'border-primary/80 bg-primary/5 ring-1 ring-primary/40 shadow-md'
                        : 'border-border/70 bg-card/60 hover:border-border hover:bg-muted/30',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-foreground truncate">
                            {isDefault ? 'Main Storyline (Canon)' : b.name}
                          </span>
                          <code className="rounded border border-border/60 bg-background/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                            {b.name}
                          </code>
                          {b.head && (
                            <code className="font-mono text-[10px] text-muted-foreground/70">
                              {b.head}
                            </code>
                          )}
                          {isActive && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-primary/20 border border-primary/40 px-2 py-0.2 text-[9px] font-bold text-primary uppercase">
                              Active
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground flex items-center gap-2 mt-1">
                          {isPriv ? (
                            <span className="inline-flex items-center gap-1 text-amber-300">
                              <Lock className="h-3 w-3" />
                              Private (Local Only)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-emerald-400">
                              <Globe className="h-3 w-3" />
                              Cloud Synced
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Delete button (protected for main branch) */}
                      {!isDefault && !isActive && (
                        <button
                          type="button"
                          onClick={() => void handleDeleteStoryline(b.name)}
                          className="text-muted-foreground/60 hover:text-rose-400 p-1 rounded transition-colors"
                          title="Delete this alternate draft"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-border/40 text-[11px]">
                      <button
                        type="button"
                        onClick={() => toggleBranchPrivate(b.name)}
                        className="text-muted-foreground hover:text-foreground text-[10px] underline underline-offset-2"
                      >
                        {isPriv ? 'Switch to Cloud Sync' : 'Make Private'}
                      </button>

                      {!isActive && (
                        <button
                          type="button"
                          onClick={() =>
                            void wrapAction(`Switch to ${b.name}`, () =>
                              gitCheckout(sagaPath, b.name, false),
                            )
                          }
                          disabled={busy}
                          className="px-2.5 py-1 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 font-medium transition-colors"
                        >
                          Switch to this Draft
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>

          {/* New alternate draft form */}
          <div className="rounded-xl border border-border/60 bg-card/40 p-3.5 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[200px]">
              <input
                type="text"
                value={newDraftName}
                onChange={(e) => setNewDraftName(e.target.value)}
                placeholder="Name a new alternate draft (e.g. 'alternate-ending', 'second-pass')"
                className="w-full rounded-lg border border-border bg-background/80 px-3 py-1.5 text-xs focus:ring-1 focus:ring-primary focus:outline-none"
              />
            </div>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={newDraftPrivate}
                onChange={(e) => setNewDraftPrivate(e.target.checked)}
                className="accent-primary rounded"
              />
              <span>Keep private (local only)</span>
            </label>
            <button
              type="button"
              onClick={() => void handleCreateStoryline()}
              disabled={busy || !newDraftName.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium text-xs hover:opacity-90 disabled:opacity-40 transition-all shadow-sm"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Create Draft</span>
            </button>
          </div>
        </section>

        {/* Section 2: Pending Story Changes & Checkpoint */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs uppercase tracking-wider font-semibold text-primary">
                Pending Story Changes
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Modifications in chapters or lore entries awaiting your checkpoint.
              </p>
            </div>
            {status && !status.clean && (
              <span className="rounded-full bg-primary/10 border border-primary/30 px-2.5 py-0.5 text-[10px] font-medium text-primary">
                {status.files.length} item(s) modified
              </span>
            )}
          </div>

          {status?.clean ? (
            <div className="rounded-xl border border-border/50 bg-card/30 p-4 text-xs text-muted-foreground flex items-center gap-2">
              <Check className="h-4 w-4 text-emerald-400" />
              <span>All chapters and entries are saved cleanly. No pending changes.</span>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl border border-border/70 bg-card/60 divide-y divide-border/50 overflow-hidden">
                {status?.files.map((f) => (
                  <div
                    key={f.path}
                    className="p-3 flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <FileEdit className="h-3.5 w-3.5 text-primary/80 shrink-0" />
                      <span className="text-xs font-mono text-foreground truncate">
                        {f.path}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => void showDiff(f.path)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-border hover:bg-muted text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors shrink-0"
                    >
                      <Eye className="h-3 w-3" />
                      <span>Review Changes</span>
                    </button>
                  </div>
                ))}
              </div>

              {/* Checkpoint button & note */}
              <div className="flex items-center gap-2.5">
                <input
                  type="text"
                  value={checkpointNote}
                  onChange={(e) => setCheckpointNote(e.target.value)}
                  placeholder="Summary note for this revision (e.g. 'Polished Chapter 2 dialogue')"
                  className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs focus:ring-1 focus:ring-primary focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => void handleSaveCheckpoint()}
                  disabled={busy}
                  className="px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold text-xs hover:opacity-90 disabled:opacity-40 transition-all shadow-sm"
                >
                  Save Checkpoint
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Section 3: Revision Timeline */}
        <section className="space-y-3">
          <h3 className="text-xs uppercase tracking-wider font-semibold text-primary">
            Story Timeline & Checkpoints
          </h3>

          {log.length === 0 ? (
            <div className="text-muted-foreground text-xs p-3">No recorded checkpoints yet.</div>
          ) : (
            <div className="space-y-2 border-l-2 border-border/60 ml-3 pl-4">
              {log.map((e) => (
                <div key={e.sha} className="relative group py-1.5">
                  <div className="absolute -left-[21px] top-3 h-2.5 w-2.5 rounded-full bg-border group-hover:bg-primary transition-colors" />
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="font-semibold text-foreground text-xs">{e.subject}</span>
                    <span className="text-muted-foreground shrink-0">
                      {new Date(e.date).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground flex items-center gap-2 mt-0.5">
                    <span>by {e.author}</span>
                    <span className="font-mono text-muted-foreground/60">{e.shortSha}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Section 4: Full Manuscript Snapshot (Backup) */}
        <section className="rounded-xl border border-border/60 bg-card/40 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-semibold text-foreground">Archive Manuscript Snapshot</h4>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Compresses your entire Saga into a standalone archive in <code>.loreweave/backups/</code>.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                void wrapAction('Archive Snapshot', async () => {
                  const res = await runBackup(sagaPath, {
                    label: `manual-${new Date().toISOString().slice(0, 10)}`,
                  });
                  setLastBackup(res);
                  return { output: `Saved snapshot to ${res.path} (${Math.round(res.bytes / 1024)} KB)` };
                })
              }
              disabled={busy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/80 bg-card hover:bg-muted text-xs font-medium transition-colors"
            >
              <Archive className="h-3.5 w-3.5 text-primary" />
              <span>Create Archive Snapshot</span>
            </button>
          </div>
          {lastBackup && (
            <div className="text-[11px] text-emerald-400 font-mono">
              Last snapshot: {lastBackup.path}
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
