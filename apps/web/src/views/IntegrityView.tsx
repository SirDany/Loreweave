import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileWarning,
  RefreshCw,
  Search,
  ShieldAlert,
  Unlink,
  Waypoints,
} from 'lucide-react';
import type { AuditPayload, DumpPayload } from '../lib/lw.js';
import { auditSaga } from '../lib/lw.js';
import type { Jumper } from '../lib/saga-helpers.js';

interface IntegrityViewProps {
  sagaPath: string;
  data: DumpPayload;
  onJump: Jumper;
}

type FilterTab = 'all' | 'broken' | 'orphans' | 'waypoints' | 'timeline';

export function IntegrityView({ sagaPath, data, onJump }: IntegrityViewProps) {
  const [audit, setAudit] = useState<AuditPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [searchFilter, setSearchFilter] = useState('');

  const runAudit = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await auditSaga(sagaPath);
      setAudit(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runAudit();
  }, [sagaPath]);

  const loose = audit?.looseEnds;
  const brokenRefs = loose?.brokenReferences ?? [];
  const orphanEntries = loose?.orphanEntries ?? [];
  const unlinkedWaypoints = loose?.unlinkedWaypoints ?? [];
  const timelineIssues = loose?.timelineIssues ?? [];
  const totalIssues = (loose?.totalIssues ?? 0) + (audit?.diagnostics.filter(d => d.severity === 'error').length ?? 0);

  const filterQuery = searchFilter.toLowerCase().trim();

  const filteredBroken = brokenRefs.filter(
    (b) =>
      b.raw.toLowerCase().includes(filterQuery) ||
      b.file.toLowerCase().includes(filterQuery)
  );

  const filteredOrphans = orphanEntries.filter(
    (o) =>
      o.name.toLowerCase().includes(filterQuery) ||
      o.id.toLowerCase().includes(filterQuery) ||
      o.type.toLowerCase().includes(filterQuery)
  );

  const filteredWaypoints = unlinkedWaypoints.filter(
    (w) =>
      w.name.toLowerCase().includes(filterQuery) ||
      w.id.toLowerCase().includes(filterQuery)
  );

  const filteredTimeline = timelineIssues.filter((t) =>
    t.message.toLowerCase().includes(filterQuery)
  );

  const resolveBrokenTarget = (
    b: (typeof brokenRefs)[number],
  ): { kind: 'entry' | 'chapter'; key: string; line?: number } | null => {
    const fileNorm = b.file.replace(/\\/g, '/');
    if (b.sourceType === 'chapter' || b.sourceType === 'meta') {
      for (const t of data.tomes) {
        for (const c of t.chapters) {
          const dir = c.relPath.replace(/\/chapter\.md$/, '');
          if (fileNorm === c.relPath || fileNorm.startsWith(dir + '/')) {
            return { kind: 'chapter', key: `${t.id}::${c.slug}`, line: b.line };
          }
        }
      }
      return null;
    }
    if (b.sourceType === 'entry') {
      const entry = data.entries.find((e) => e.relPath === fileNorm);
      if (entry) {
        return { kind: 'entry', key: `${entry.type}/${entry.id}`, line: b.line };
      }
    }
    return null;
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden animate-panel-enter">
      {/* Top Header */}
      <header className="px-4 py-2.5 border-b border-border/70 flex items-center justify-between gap-3 flex-wrap bg-card/40 backdrop-blur-md">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-semibold text-foreground">Integrity & Loose Ends</h1>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Audit referential integrity, detect unreferenced canon elements, and resolve loose ends.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={runAudit}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-border hover:bg-muted transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Re-scan
          </button>
        </div>
      </header>

      {/* Metrics Banner */}
      <div className="px-4 py-2.5 border-b border-border/60 bg-muted/20 flex gap-3 flex-wrap items-center">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card border border-border shadow-xs text-xs">
          <span className="text-muted-foreground">Total Loose Ends:</span>
          <span className={`font-semibold ${totalIssues > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
            {totalIssues}
          </span>
        </div>

        <button
          onClick={() => setActiveTab('broken')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors ${
            activeTab === 'broken'
              ? 'bg-rose-500/15 border-rose-500/30 text-rose-300 font-medium'
              : 'bg-card border-border text-muted-foreground hover:bg-muted'
          }`}
        >
          <Unlink className="w-3.5 h-3.5 text-rose-400" />
          <span>Broken References:</span>
          <span className="font-semibold text-foreground">{brokenRefs.length}</span>
        </button>

        <button
          onClick={() => setActiveTab('orphans')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors ${
            activeTab === 'orphans'
              ? 'bg-amber-500/15 border-amber-500/30 text-amber-300 font-medium'
              : 'bg-card border-border text-muted-foreground hover:bg-muted'
          }`}
        >
          <FileWarning className="w-3.5 h-3.5 text-amber-400" />
          <span>Orphan Entries:</span>
          <span className="font-semibold text-foreground">{orphanEntries.length}</span>
        </button>

        <button
          onClick={() => setActiveTab('waypoints')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors ${
            activeTab === 'waypoints'
              ? 'bg-sky-500/15 border-sky-500/30 text-sky-300 font-medium'
              : 'bg-card border-border text-muted-foreground hover:bg-muted'
          }`}
        >
          <Waypoints className="w-3.5 h-3.5 text-sky-400" />
          <span>Unlinked Waypoints:</span>
          <span className="font-semibold text-foreground">{unlinkedWaypoints.length}</span>
        </button>

        {timelineIssues.length > 0 && (
          <button
            onClick={() => setActiveTab('timeline')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors ${
              activeTab === 'timeline'
                ? 'bg-violet-500/15 border-violet-500/30 text-violet-300 font-medium'
                : 'bg-card border-border text-muted-foreground hover:bg-muted'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-violet-400" />
            <span>Timeline Issues:</span>
            <span className="font-semibold text-foreground">{timelineIssues.length}</span>
          </button>
        )}

        <div className="ml-auto relative min-w-[200px]">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Filter issues..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full bg-background border border-border rounded-md pl-8 pr-3 py-1 text-xs focus:outline-hidden focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {error && (
          <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">
            {error}
          </div>
        )}

        {totalIssues === 0 && !loading && (
          <div className="text-center py-16 space-y-3">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
            <h3 className="text-lg font-medium text-foreground">Zero Loose Ends Detected</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              All references resolve to valid canon entries, all codex entries are linked in prose or threads, and timeline constraints are consistent.
            </p>
          </div>
        )}

        {/* Broken References Section */}
        {(activeTab === 'all' || activeTab === 'broken') && filteredBroken.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-rose-400 flex items-center gap-2">
                <Unlink className="w-4 h-4" />
                Broken References ({filteredBroken.length})
              </h2>
              <span className="text-xs text-muted-foreground">
                References pointing to entities that do not exist
              </span>
            </div>

            <div className="grid gap-2">
              {filteredBroken.map((b, idx) => {
                const target = resolveBrokenTarget(b);
                return (
                  <div
                    key={idx}
                    className="p-3 rounded-lg border border-rose-500/20 bg-rose-500/5 flex items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <code className="text-xs px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-mono">
                          {b.raw}
                        </code>
                        <span className="text-xs text-muted-foreground">
                          → target <span className="font-mono text-foreground">{b.type}/{b.id}</span> not found
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        In file: <span className="text-foreground">{b.file}</span> (line {b.line})
                      </div>
                    </div>

                    {target && (
                      <button
                        onClick={() => onJump(target)}
                        className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-card border border-border hover:bg-muted transition-colors text-foreground"
                      >
                        <span>Jump</span>
                        <ExternalLink className="w-3 h-3 text-muted-foreground" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Orphan Entries Section */}
        {(activeTab === 'all' || activeTab === 'orphans') && filteredOrphans.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-400 flex items-center gap-2">
                <FileWarning className="w-4 h-4" />
                Orphan Entries ({filteredOrphans.length})
              </h2>
              <span className="text-xs text-muted-foreground">
                Canon entries never mentioned or referenced in any chapter, note, or entry
              </span>
            </div>

            <div className="grid gap-2">
              {filteredOrphans.map((o, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-lg border border-amber-500/20 bg-amber-500/5 flex items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs uppercase font-semibold text-amber-400 px-1.5 py-0.5 rounded bg-amber-500/20">
                        {o.type}
                      </span>
                      <span className="text-sm font-medium text-foreground">{o.name}</span>
                      <code className="text-xs text-muted-foreground">({o.id})</code>
                      {o.status && (
                        <span className="text-xs px-1.5 py-0.5 rounded border border-border text-muted-foreground">
                          {o.status}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      File: <span className="text-foreground">{o.file}</span> — 0 incoming references
                    </div>
                  </div>

                  <button
                    onClick={() => onJump({ kind: 'entry', key: `${o.type}/${o.id}` })}
                    className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-card border border-border hover:bg-muted transition-colors text-foreground"
                  >
                    <span>Inspect</span>
                    <ExternalLink className="w-3 h-3 text-muted-foreground" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Unlinked Waypoints Section */}
        {(activeTab === 'all' || activeTab === 'waypoints') && filteredWaypoints.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-sky-400 flex items-center gap-2">
                <Waypoints className="w-4 h-4" />
                Unlinked Waypoints ({filteredWaypoints.length})
              </h2>
              <span className="text-xs text-muted-foreground">
                Waypoint event entries that have not been placed on any narrative thread
              </span>
            </div>

            <div className="grid gap-2">
              {filteredWaypoints.map((w, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-lg border border-sky-500/20 bg-sky-500/5 flex items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{w.name}</span>
                      <code className="text-xs text-muted-foreground">({w.id})</code>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      File: <span className="text-foreground">{w.file}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => onJump({ kind: 'entry', key: `waypoint/${w.id}` })}
                    className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-card border border-border hover:bg-muted transition-colors text-foreground"
                  >
                    <span>View Waypoint</span>
                    <ExternalLink className="w-3 h-3 text-muted-foreground" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Timeline Issues Section */}
        {(activeTab === 'all' || activeTab === 'timeline') && filteredTimeline.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-violet-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Timeline Contradictions ({filteredTimeline.length})
            </h2>

            <div className="grid gap-2">
              {filteredTimeline.map((t, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-lg border border-violet-500/20 bg-violet-500/5 space-y-1"
                >
                  <div className="text-sm font-medium text-foreground">{t.message}</div>
                  <div className="text-xs text-muted-foreground">Thread: {t.thread}</div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
