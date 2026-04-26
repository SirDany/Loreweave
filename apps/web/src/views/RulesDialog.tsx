import { useEffect, useState } from 'react';
import { lwCreate, lwDelete, lwWrite } from '../lib/lw.js';
import { slugify } from '../lib/helpers.js';

interface RuleFile {
  relPath: string;
  content: string;
}

interface Props {
  sagaPath: string;
  onClose: () => void;
}

async function fetchRules(sagaPath: string): Promise<RuleFile[]> {
  const url = `/lw/rules?sagaRoot=${encodeURIComponent(sagaPath)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`/lw/rules ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { files: RuleFile[] };
  return json.files;
}

/**
 * Saga-wide House Rules. Each markdown file in `<saga>/.loreweave/rules/`
 * is concatenated into the AI agents' system prompt on every chat turn,
 * so the writer can pin worldbuilding constraints, voice, content limits,
 * etc. and have them honored automatically by Muse / Scribe / Warden /
 * Polisher / Archivist.
 */
export function RulesDialog({ sagaPath, onClose }: Props) {
  const [files, setFiles] = useState<RuleFile[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  const reload = async () => {
    setLoading(true);
    try {
      const fs = await fetchRules(sagaPath);
      setFiles(fs);
      if (fs.length > 0 && !fs.find((f) => f.relPath === active)) {
        setActive(fs[0]!.relPath);
        setDraft(fs[0]!.content);
      } else if (active) {
        const f = fs.find((x) => x.relPath === active);
        if (f) setDraft(f.content);
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sagaPath]);

  const dirty =
    active !== null &&
    files.find((f) => f.relPath === active)?.content !== draft;

  const save = async () => {
    if (!active || !dirty) return;
    setBusy(true);
    setErr(null);
    try {
      await lwWrite(sagaPath, active, draft);
      await reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    const slug = slugify(newName);
    if (!slug) return;
    setBusy(true);
    setErr(null);
    try {
      const rel = `.loreweave/rules/${slug}.md`;
      await lwCreate(
        sagaPath,
        rel,
        `# ${newName.trim()}\n\n_(write your rule here)_\n`,
      );
      setNewName('');
      setActive(rel);
      await reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (rel: string) => {
    setBusy(true);
    setErr(null);
    try {
      await lwDelete(sagaPath, rel);
      if (active === rel) {
        setActive(null);
        setDraft('');
      }
      await reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded shadow-xl w-[56rem] max-w-[95vw] h-[36rem] max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="text-base font-serif">House rules</h2>
            <p className="text-[11px] text-muted-foreground">
              Saga-wide constraints prepended to every AI agent's system
              prompt. Stored in <span className="font-mono">.loreweave/rules/*.md</span>.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="flex flex-1 overflow-hidden">
          <aside className="w-60 shrink-0 border-r border-border flex flex-col">
            <div className="flex-1 overflow-auto scrollbar-ember">
              {loading && (
                <div className="p-3 text-xs text-muted-foreground">loading…</div>
              )}
              {!loading && files.length === 0 && (
                <div className="p-3 text-xs italic text-muted-foreground">
                  No rules yet. Add one below.
                </div>
              )}
              <ul>
                {files.map((f) => (
                  <li key={f.relPath} className="flex items-center">
                    <button
                      onClick={() => {
                        setActive(f.relPath);
                        setDraft(f.content);
                      }}
                      className={
                        'flex-1 truncate px-3 py-2 text-left text-xs ' +
                        (active === f.relPath
                          ? 'bg-accent text-accent-foreground'
                          : 'hover:bg-muted')
                      }
                      title={f.relPath}
                    >
                      {f.relPath.replace(/^\.loreweave\/rules\//, '')}
                    </button>
                    <button
                      onClick={() => void remove(f.relPath)}
                      className="px-2 py-2 text-rose-400 hover:text-rose-300"
                      title="Delete rule"
                      disabled={busy}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div className="border-t border-border p-2 space-y-1">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void create();
                }}
                className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
                placeholder="New rule title"
              />
              <button
                onClick={() => void create()}
                disabled={!newName.trim() || busy}
                className="w-full rounded bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-50"
              >
                Add rule
              </button>
            </div>
          </aside>
          <main className="flex-1 flex flex-col overflow-hidden">
            {active ? (
              <>
                <div className="border-b border-border px-3 py-2 font-mono text-[11px] text-muted-foreground">
                  {active}
                </div>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="flex-1 resize-none bg-background px-4 py-3 text-sm font-mono leading-relaxed outline-none"
                  spellCheck={false}
                />
                <div className="flex items-center justify-end gap-2 border-t border-border px-3 py-2">
                  {err && (
                    <span className="flex-1 text-xs text-rose-400 truncate">
                      {err}
                    </span>
                  )}
                  {dirty && (
                    <span className="text-xs text-amber-400">• unsaved</span>
                  )}
                  <button
                    onClick={() => void save()}
                    disabled={!dirty || busy}
                    className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
                  >
                    {busy ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm italic text-muted-foreground">
                Select or create a rule on the left.
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
