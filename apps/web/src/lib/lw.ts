// TS client around the Loreweave CLI.
//
// Calls the Vite dev-server middleware defined in vite.config.ts:
//   POST /lw        — run a CLI command and return { stdout, stderr, code }.
//   POST /lw/write  — write a file inside a Saga root (204 on success).
//
// The middleware only runs on localhost, so all filesystem mutations stay
// on the writer's own machine.

export interface LwResult {
  stdout: string;
  stderr: string;
  code: number;
}

async function invokeVite(args: string[]): Promise<LwResult> {
  const res = await fetch('/lw', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ args }),
  });
  if (!res.ok) throw new Error(`/lw ${res.status}: ${await res.text()}`);
  return (await res.json()) as LwResult;
}

export async function lw(args: string[]): Promise<LwResult> {
  return invokeVite(args);
}

export async function lwWrite(
  sagaRoot: string,
  relPath: string,
  content: string,
): Promise<void> {
  const res = await fetch('/lw/write', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sagaRoot, relPath, content }),
  });
  if (!res.ok) {
    throw new Error(`/lw/write ${res.status}: ${await res.text()}`);
  }
}

async function lwJson<T>(args: string[]): Promise<T> {
  const r = await lw(args);
  if (r.code !== 0 && !r.stdout) {
    throw new Error(r.stderr || `lw ${args.join(' ')} failed (code ${r.code})`);
  }
  try {
    return JSON.parse(r.stdout) as T;
  } catch (e) {
    throw new Error(
      `lw ${args.join(' ')} returned invalid JSON: ${
        (e as Error).message
      }\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`,
    );
  }
}

// ---------- typed payloads ----------

export type EntryType =
  | 'character'
  | 'location'
  | 'concept'
  | 'lore'
  | 'waypoint'
  | 'term'
  | 'sigil';

export interface DumpEntry {
  type: EntryType;
  id: string;
  name: string;
  relPath: string;
  tags: string[];
  inherits: string[];
  appears_in: string[] | null;
  status: 'draft' | 'canon' | null;
  aliases: string[];
  body: string;
  frontmatter: Record<string, unknown>;
  properties: Record<string, unknown>;
  provenance: Record<string, string>;
  inheritsChain: string[];
}

export interface DumpChapter {
  slug: string;
  title: string;
  ordinal: number;
  relPath: string;
  body: string;
  meta: Record<string, unknown>;
  refs: Array<{
    type: EntryType;
    id: string;
    line: number;
    column: number;
    raw: string;
  }>;
}

export interface DumpTome {
  id: string;
  title: string;
  relPath: string;
  chapters: DumpChapter[];
}

export interface Waypoint {
  id: string;
  event: string;
  at?: string;
  before?: string[];
  after?: string[];
  concurrent?: string[];
  appears_in?: string[];
  label?: string;
}

export interface Thread {
  id: string;
  calendar?: string;
  branches_from?: { thread: string; at_waypoint: string };
  waypoints: Waypoint[];
  relPath: string;
}

export interface CalendarSpec {
  id: string;
  kind: 'gregorian' | 'numeric';
  epoch?: string;
  label?: string;
}

export interface Diagnostic {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  file?: string;
  line?: number;
}

export type TraceKind = 'idea' | 'todo' | 'remark' | 'question' | 'done';
export type TraceStatus = 'open' | 'resolved' | 'archived';

export interface Trace {
  id: string;
  kind: TraceKind;
  target: string | null;
  author: string | null;
  created: string | null;
  updated: string | null;
  tags: string[];
  status: TraceStatus;
  body: string;
  relPath: string;
}

export interface DumpPayload {
  saga: {
    root: string;
    id: string | null;
    title: string | null;
    default_calendar: string | null;
    tome_order: string[];
  };
  entries: DumpEntry[];
  tomes: DumpTome[];
  threads: Thread[];
  calendars: CalendarSpec[];
  traces: Trace[];
  diagnostics: Diagnostic[];
}

export interface ResolvedView {
  type: EntryType;
  id: string;
  name?: string;
  properties: Record<string, unknown>;
  provenance: Record<string, string>;
  inheritsChain: string[];
}

// ---------- command wrappers ----------

export function dump(saga: string, tome?: string): Promise<DumpPayload> {
  const args = ['dump', saga];
  if (tome) args.push('--tome', tome);
  return lwJson<DumpPayload>(args);
}export function resolveEntry(
  saga: string,
  type: EntryType,
  id: string,
): Promise<ResolvedView> {
  return lwJson<ResolvedView>(['resolve', saga, `${type}/${id}`, '--json']);
}

export function validate(
  saga: string,
  tome?: string,
): Promise<{ diagnostics: Diagnostic[] }> {
  const args = ['validate', saga, '--json'];
  if (tome) args.push('--tome', tome);
  return lwJson<{ diagnostics: Diagnostic[] }>(args);
}

// ---------- canon digest (cached phone book + weaves) ----------

export interface DigestPhoneBookEntry {
  ref: string;
  type: EntryType;
  id: string;
  name: string;
  aliases?: string[];
  tags?: string[];
  relPath: string;
  summary: string;
  status?: 'draft' | 'canon' | null;
  appearsIn?: string[];
}

export interface DigestWeaveEntry {
  ref: string;
  inheritsChain: string[];
  properties: Record<string, { value: unknown; from: string }>;
}

export interface DigestThreadWaypoint {
  id: string;
  label?: string;
  at?: string;
  event: string;
  eventName?: string;
}

export interface DigestThread {
  id: string;
  calendar?: string;
  branchesFrom?: { thread: string; at_waypoint: string };
  waypoints: DigestThreadWaypoint[];
  issues: Array<{ kind: string; message: string }>;
}

export interface CanonDigestPayload {
  schema: number;
  sagaId: string;
  revision: string;
  builtAt: string;
  counts: { entries: number; threads: number; tomes: number };
  phoneBook: DigestPhoneBookEntry[];
  weaves: DigestWeaveEntry[];
  threads: DigestThread[];
  tomes: Array<{ id: string; title: string; chapters: number }>;
}

export async function fetchDigest(
  sagaRoot: string,
  opts: { force?: boolean } = {},
): Promise<CanonDigestPayload> {
  const q = new URLSearchParams({ sagaRoot });
  if (opts.force) q.set('force', '1');
  const res = await fetch(`/lw/digest?${q.toString()}`);
  if (!res.ok) {
    throw new Error(`/lw/digest ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as CanonDigestPayload;
}

export function threadOf(
  saga: string,
  threadId: string,
  opts: { withBranches?: boolean; tome?: string } = {},
): Promise<{
  waypoints: Array<Waypoint & { order: number }>;
  issues: Array<{ kind: string; message: string }>;
}> {
  const args = ['thread', saga, threadId, '--linear', '--json'];
  if (opts.withBranches) args.push('--with-branches');
  if (opts.tome) args.push('--tome', opts.tome);
  return lwJson(args);
}

// ---------- git ----------

export interface GitStatus {
  repoRoot: string;
  branch: string | null;
  head: string;
  ahead: number;
  behind: number;
  upstream: string | null;
  files: Array<{
    path: string;
    index: string;
    worktree: string;
    conflict: boolean;
  }>;
  clean: boolean;
  hasConflicts: boolean;
  inMerge: boolean;
}

export interface GitBranch {
  name: string;
  current: boolean;
  remote: boolean;
  head: string;
}

export interface GitLogEntry {
  sha: string;
  shortSha: string;
  date: string;
  author: string;
  subject: string;
}

export interface GitRemote {
  name: string;
  fetch: string;
  push: string;
}

export interface GitDiff {
  file: string;
  staged: boolean;
  patch: string;
}

export function gitStatus(saga: string): Promise<GitStatus> {
  return lwJson<GitStatus>(['git', 'status', saga, '--json']);
}

export function gitBranches(saga: string, all = false): Promise<GitBranch[]> {
  const args = ['git', 'branches', saga, '--json'];
  if (all) args.push('--all');
  return lwJson<GitBranch[]>(args);
}

export function gitLog(saga: string, limit = 30): Promise<GitLogEntry[]> {
  return lwJson<GitLogEntry[]>([
    'git',
    'log',
    saga,
    '--limit',
    String(limit),
    '--json',
  ]);
}

export async function gitCommit(
  saga: string,
  message: string,
  all = true,
): Promise<{ sha: string; subject: string }> {
  const args = ['git', 'commit', saga, '--message', message, '--json'];
  if (all) args.push('--all');
  return lwJson<{ sha: string; subject: string }>(args);
}

export async function gitCheckout(
  saga: string,
  branch: string,
  create = false,
): Promise<void> {
  const args = ['git', 'checkout', saga, '--branch', branch];
  if (create) args.push('--all');
  const r = await lw(args);
  if (r.code !== 0) throw new Error(r.stderr || `checkout failed`);
}

export async function gitInit(saga: string): Promise<void> {
  const r = await lw(['git', 'init', saga]);
  if (r.code !== 0) throw new Error(r.stderr || 'git init failed');
}

export function gitRemotes(saga: string): Promise<GitRemote[]> {
  return lwJson<GitRemote[]>(['git', 'remotes', saga, '--json']);
}

export async function gitRemoteAdd(
  saga: string,
  name: string,
  url: string,
): Promise<void> {
  const r = await lw([
    'git',
    'remote-add',
    saga,
    '--remote',
    name,
    '--url',
    url,
  ]);
  if (r.code !== 0) throw new Error(r.stderr || 'remote add failed');
}

export async function gitRemoteRemove(
  saga: string,
  name: string,
): Promise<void> {
  const r = await lw(['git', 'remote-remove', saga, '--remote', name]);
  if (r.code !== 0) throw new Error(r.stderr || 'remote remove failed');
}

export async function gitFetch(
  saga: string,
  remote?: string,
): Promise<{ output: string }> {
  const args = ['git', 'fetch', saga, '--json'];
  if (remote) args.push('--remote', remote);
  return lwJson<{ output: string }>(args);
}

export async function gitPull(
  saga: string,
  remote?: string,
  branch?: string,
): Promise<{ output: string }> {
  const args = ['git', 'pull', saga, '--json'];
  if (remote) args.push('--remote', remote);
  if (branch) args.push('--branch', branch);
  return lwJson<{ output: string }>(args);
}

export async function gitPush(
  saga: string,
  remote?: string,
  branch?: string,
  setUpstream = false,
): Promise<{ output: string }> {
  const args = ['git', 'push', saga, '--json'];
  if (remote) args.push('--remote', remote);
  if (branch) args.push('--branch', branch);
  if (setUpstream) args.push('--all');
  return lwJson<{ output: string }>(args);
}

export async function gitDiff(
  saga: string,
  file?: string,
  staged = false,
): Promise<GitDiff> {
  const args = ['git', 'diff', saga, '--json'];
  if (file) args.push('--file', file);
  if (staged) args.push('--staged');
  return lwJson<GitDiff>(args);
}

export async function gitMergeAbort(saga: string): Promise<void> {
  const r = await lw(['git', 'merge-abort', saga]);
  if (r.code !== 0) throw new Error(r.stderr || 'merge --abort failed');
}

export async function gitMergeContinue(saga: string): Promise<void> {
  const r = await lw(['git', 'merge-continue', saga]);
  if (r.code !== 0) throw new Error(r.stderr || 'merge --continue failed');
}

// ---------- saga discovery ----------

export interface DiscoveredSaga {
  path: string;
  id: string;
  title: string | null;
}

export function listSagas(root = 'sagas'): Promise<DiscoveredSaga[]> {
  return lwJson<DiscoveredSaga[]>(['list-sagas', root, '--json']);
}

// ---------- export / import / backup ----------

export type ExportFormat =
  | 'saga'
  | 'saga-json'
  | 'tome-md'
  | 'tome-html'
  | 'tome-pdf'
  | 'tome-docx'
  | 'tome-epub'
  | 'chapter-md'
  | 'codex-md'
  | 'codex-html'
  | 'slang-md';

export interface ExportRequest {
  saga: string;
  format: ExportFormat;
  out: string;
  tome?: string;
  chapter?: string;
}

export async function runExport(req: ExportRequest): Promise<string> {
  const args = ['export', req.saga, '--format', req.format, '--out', req.out];
  if (req.tome) args.push('--tome', req.tome);
  if (req.chapter) args.push('--chapter', req.chapter);
  const r = await lw(args);
  if (r.code !== 0)
    throw new Error(r.stderr || `export failed (code ${r.code})`);
  return r.stdout.trim();
}

export interface SagaZipPlan {
  saga: string;
  totalFiles: number;
  totalBytes: number;
  files: Array<{ relPath: string; size: number }>;
}

export function exportPlan(saga: string): Promise<SagaZipPlan> {
  return lwJson<SagaZipPlan>([
    'export',
    saga,
    '--format',
    'saga',
    '--plan',
    '--json',
  ]);
}

export interface BackupResult {
  path: string;
  bytes: number;
  pruned: string[];
}

export function runBackup(
  saga: string,
  opts: { label?: string; keep?: number; out?: string } = {},
): Promise<BackupResult> {
  const args = ['backup', saga, '--json'];
  if (opts.label) args.push('--label', opts.label);
  if (typeof opts.keep === 'number') args.push('--keep', String(opts.keep));
  if (opts.out) args.push('--out', opts.out);
  return lwJson<BackupResult>(args);
}

export interface ImportFileConflict {
  relPath: string;
  existing: string | null;
  incoming: string;
}

export interface ImportPlan {
  bundleRoot: string;
  targetSaga: string;
  newFiles: string[];
  conflicts: ImportFileConflict[];
  unchanged: string[];
}

export function importPlan(
  zipPath: string,
  into = 'sagas',
): Promise<ImportPlan> {
  return lwJson<ImportPlan>([
    'import',
    zipPath,
    '--into',
    into,
    '--plan',
    '--json',
  ]);
}

export interface ImportApplyResult {
  plan: ImportPlan;
  actions: Array<{
    relPath: string;
    action: 'created' | 'overwritten' | 'kept';
  }>;
}

export function importApply(
  zipPath: string,
  into = 'sagas',
  resolve: 'overwrite' | 'keep' = 'keep',
): Promise<ImportApplyResult> {
  return lwJson<ImportApplyResult>([
    'import',
    zipPath,
    '--into',
    into,
    '--resolve',
    resolve,
    '--json',
  ]);
}

// ---------- rename ----------

export interface RenamePlanSummary {
  from: { type: EntryType; id: string };
  to: { type: EntryType; id: string };
  sourceFile: string | null;
  targetFile: string | null;
  idInFrontmatter: boolean;
  hits: Array<{ relPath: string; count: number }>;
  extraHits: Array<{ relPath: string; kind: string; count: number }>;
  conflicts: string[];
}

export function renamePlan(
  saga: string,
  fromRef: string,
  toRef: string,
): Promise<RenamePlanSummary> {
  return lwJson<RenamePlanSummary>(['rename', saga, fromRef, toRef, '--json']);
}

export async function renameApply(
  saga: string,
  fromRef: string,
  toRef: string,
): Promise<void> {
  const r = await lw(['rename', saga, fromRef, toRef, '--apply']);
  if (r.code !== 0) throw new Error(r.stderr || 'rename failed');
}

// ---------- backup-list / restore ----------

export interface BackupSnapshot {
  file: string;
  path: string;
  bytes: number;
  modified: string;
  label: string | null;
}

export interface BackupListResult {
  dir: string;
  snapshots: BackupSnapshot[];
}

export function listBackups(saga: string): Promise<BackupListResult> {
  return lwJson<BackupListResult>(['backup-list', saga, '--json']);
}

export interface RestorePlan {
  zip: string;
  targetSaga: string;
  preBackup: string | null;
  newFiles: number;
  overwritten: number;
  unchanged: number;
  removed: number;
  removedFiles?: string[];
}

export function restorePlan(zip: string, saga?: string): Promise<RestorePlan> {
  const args = ['restore', zip, '--json'];
  if (saga) args.push('--saga', saga);
  return lwJson<RestorePlan>(args);
}

export function restoreApply(
  zip: string,
  saga?: string,
  noPreBackup = false,
): Promise<RestorePlan> {
  const args = ['restore', zip, '--apply', '--json'];
  if (saga) args.push('--saga', saga);
  if (noPreBackup) args.push('--no-pre-backup');
  return lwJson<RestorePlan>(args);
}

// ---------- search ----------

export type SearchScope = 'all' | 'entries' | 'prose' | 'echoes';

export interface SearchHit {
  kind: 'entry' | 'prose' | 'echo';
  file: string;
  line: number;
  column: number;
  match: string;
  ref: string;
  preview: string;
}

export interface SearchResult {
  query: string;
  scope: SearchScope;
  hits: SearchHit[];
}

export function search(
  saga: string,
  query: string,
  opts: {
    scope?: SearchScope;
    type?: string;
    case?: boolean;
    limit?: number;
  } = {},
): Promise<SearchResult> {
  const args = ['search', saga, query, '--json'];
  if (opts.scope) args.push('--scope', opts.scope);
  if (opts.type) args.push('--type', opts.type);
  if (opts.case) args.push('--case');
  if (typeof opts.limit === 'number') args.push('--limit', String(opts.limit));
  return lwJson<SearchResult>(args);
}

// ---------- entry diff ----------

export interface EntryDiffResult {
  ref: string;
  file: string;
  staged: boolean;
  patch: string;
}

export function entryDiff(
  saga: string,
  ref: string,
  staged = false,
): Promise<EntryDiffResult> {
  const args = ['entry-diff', saga, ref, '--json'];
  if (staged) args.push('--staged');
  return lwJson<EntryDiffResult>(args);
}
