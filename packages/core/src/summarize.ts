// Saga summary: small, JSON-friendly view used by dashboards and the
// `lw summarize` CLI. Pure read over a loaded Saga + diagnostics.
import type { Diagnostic } from './validator.js';
import type { Saga } from './types.js';

export interface KindCount {
  kind: string;
  count: number;
}

export interface TagCount {
  tag: string;
  count: number;
}

export interface RecentEntry {
  /** "type/id" form. */
  key: string;
  type: string;
  id: string;
  name?: string;
  relPath: string;
  /** ISO mtime if available, otherwise undefined. */
  mtime?: string;
}

export interface DiagnosticTotals {
  errors: number;
  warnings: number;
}

export interface SagaSummary {
  manifestId: string;
  title?: string;
  totals: {
    entries: number;
    tomes: number;
    threads: number;
    calendars: number;
    traces: number;
    public: number;
    private: number;
  };
  byKind: KindCount[];
  byTag: TagCount[];
  recent: RecentEntry[];
  diagnostics?: DiagnosticTotals;
}

export interface SummarizeOptions {
  /** Optional pre-computed diagnostic list (from `validateSaga`). */
  diagnostics?: Diagnostic[];
  /** Optional mtime resolver — when omitted, recent[] order falls back to load order. */
  getMtime?: (relPath: string) => Date | undefined;
  /** Cap recent[] length (default 10). */
  recentLimit?: number;
  /** Cap byTag[] length (default 20). */
  tagLimit?: number;
}

/**
 * Build a small JSON-friendly snapshot of a loaded Saga: entry counts by
 * kind/tag, the N most-recently-touched entries, and (optionally)
 * diagnostic totals. Used by the desktop/web dashboard view and exposed
 * via `lw summarize` for scripting.
 */
export function summarizeSaga(saga: Saga, opts: SummarizeOptions = {}): SagaSummary {
  const { diagnostics, getMtime, recentLimit = 10, tagLimit = 20 } = opts;
  const byKindMap = new Map<string, number>();
  const byTagMap = new Map<string, number>();
  let publicCount = 0;
  let privateCount = 0;
  for (const e of saga.entries) {
    byKindMap.set(e.frontmatter.type, (byKindMap.get(e.frontmatter.type) ?? 0) + 1);
    for (const tag of e.frontmatter.tags ?? []) {
      byTagMap.set(tag, (byTagMap.get(tag) ?? 0) + 1);
    }
    if (e.frontmatter.visibility === 'private') privateCount += 1;
    else publicCount += 1;
  }
  const byKind = [...byKindMap.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([kind, count]) => ({ kind, count }));
  const byTag = [...byTagMap.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, tagLimit)
    .map(([tag, count]) => ({ tag, count }));

  const annotated = saga.entries.map((e) => {
    const mtime = getMtime?.(e.relPath);
    return { e, mtime };
  });
  if (getMtime) {
    annotated.sort((a, b) => (b.mtime?.getTime() ?? 0) - (a.mtime?.getTime() ?? 0));
  }
  const recent: RecentEntry[] = annotated.slice(0, recentLimit).map(({ e, mtime }) => ({
    key: `${e.frontmatter.type}/${e.frontmatter.id}`,
    type: e.frontmatter.type,
    id: e.frontmatter.id,
    name: e.frontmatter.name,
    relPath: e.relPath,
    mtime: mtime?.toISOString(),
  }));

  const summary: SagaSummary = {
    manifestId: saga.manifest.id,
    title: saga.manifest.title,
    totals: {
      entries: saga.entries.length,
      tomes: saga.tomes.length,
      threads: saga.threads.length,
      calendars: saga.calendars.length,
      traces: saga.traces.length,
      public: publicCount,
      private: privateCount,
    },
    byKind,
    byTag,
    recent,
  };
  if (diagnostics) {
    summary.diagnostics = {
      errors: diagnostics.filter((d) => d.severity === 'error').length,
      warnings: diagnostics.filter((d) => d.severity === 'warning').length,
    };
  }
  return summary;
}
