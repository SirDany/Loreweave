/**
 * Reference contributed renderer: a kanban view that buckets entries
 * of one Kind into columns based on a property value (typically
 * `status`). Demonstrates the full LensProps surface: a renderer that
 * reads a Lens manifest's `groupBy` + `kinds` filter to organize the
 * canon graph.
 *
 * Phase 4 ships this in-tree under `loom/contrib/` so contributors
 * have a working reference. Phase 5 adds opt-in drag-and-drop:
 * when the manifest sets `editable: true` and the host supplies
 * `onMove`, cards become draggable and dropping on a column emits
 * the move (the host writes it back via `lwWrite`).
 */
import { useState } from 'react';
import type { DumpEntry } from '../../lib/lw.js';
import type { LensManifest } from '../manifest.js';

export interface KanbanLensProps {
  manifest: LensManifest;
  entries: DumpEntry[];
  selectionKey?: string;
  onSelect?: (key: string) => void;
  /**
   * Optional drag-and-drop sink. Called when the user drops a card on
   * a different column than its current one. The host is responsible
   * for persisting the move (typically via `applyFrontmatterPatch` +
   * `lwWrite`). Ignored unless `manifest.editable` is true.
   */
  onMove?: (entry: DumpEntry, newColumn: string) => void;
}

export function KanbanLens({
  manifest,
  entries,
  selectionKey,
  onSelect,
  onMove,
}: KanbanLensProps) {
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dropCol, setDropCol] = useState<string | null>(null);
  const editable = !!(manifest.editable && onMove);
  const filtered = entries.filter((e) => {
    if (manifest.kinds && manifest.kinds.length > 0) {
      if (!manifest.kinds.includes(e.type)) return false;
    }
    if (manifest.filter?.status) {
      if (e.status !== manifest.filter.status) return false;
    }
    if (manifest.filter?.tags && manifest.filter.tags.length > 0) {
      if (!manifest.filter.tags.some((t) => e.tags.includes(t))) return false;
    }
    if (manifest.filter?.inherits && manifest.filter.inherits.length > 0) {
      if (
        !manifest.filter.inherits.some((s) => e.inherits.includes(s))
      )
        return false;
    }
    return true;
  });

  const groupBy = manifest.groupBy ?? 'status';
  const groups = bucketEntries(filtered, groupBy);

  return (
    <div className="flex-1 overflow-auto p-3">
      <h2 className="text-base font-medium mb-3">{manifest.name}</h2>
      <div
        className="grid gap-3"
        style={{
          gridTemplateColumns: `repeat(${Math.max(groups.size, 1)}, minmax(180px, 1fr))`,
        }}
      >
        {Array.from(groups.entries()).map(([col, items]) => (
          <div
            key={col}
            className={`rounded border bg-card/40 flex flex-col min-h-[200px] ${
              dropCol === col && editable
                ? 'border-primary ring-1 ring-primary'
                : 'border-border'
            }`}
            data-testid={`kanban-column-${col}`}
            onDragOver={(e) => {
              if (!editable) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (dropCol !== col) setDropCol(col);
            }}
            onDragLeave={() => {
              if (!editable) return;
              setDropCol((c) => (c === col ? null : c));
            }}
            onDrop={(e) => {
              if (!editable || !onMove) return;
              e.preventDefault();
              const key = e.dataTransfer.getData('text/plain') || dragKey;
              setDragKey(null);
              setDropCol(null);
              if (!key) return;
              const dropped = filtered.find(
                (x) => `${x.type}/${x.id}` === key,
              );
              if (!dropped) return;
              const current = String(readGroupValue(dropped, groupBy) ?? '(unset)');
              if (current === col) return;
              onMove(dropped, col);
            }}
          >
            <header className="px-2 py-1 border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
              {col} <span className="text-muted-foreground/70">({items.length})</span>
            </header>
            <ul className="flex-1 p-2 space-y-1">
              {items.map((e) => {
                const key = `${e.type}/${e.id}`;
                const active = key === selectionKey;
                return (
                  <li key={key}>
                    <button
                      onClick={() => onSelect?.(key)}
                      draggable={editable}
                      onDragStart={(ev) => {
                        if (!editable) return;
                        ev.dataTransfer.effectAllowed = 'move';
                        ev.dataTransfer.setData('text/plain', key);
                        setDragKey(key);
                      }}
                      onDragEnd={() => {
                        setDragKey(null);
                        setDropCol(null);
                      }}
                      data-testid={`kanban-card-${key}`}
                      className={`w-full text-left rounded px-2 py-1 text-sm hover:bg-muted ${
                        active ? 'bg-accent text-accent-foreground' : ''
                      } ${dragKey === key ? 'opacity-50' : ''}`}
                    >
                      <div className="font-medium">{e.name || e.id}</div>
                      <div className="text-xs text-muted-foreground">
                        @{e.type}/{e.id}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Pure helper exported for testing. Buckets `entries` by `groupBy`
 * (looking up first the Entry's typed field, falling back to
 * `frontmatter[groupBy]`, then `properties[groupBy]`). Entries
 * without a value land in an `(unset)` column.
 */
export function bucketEntries(
  entries: DumpEntry[],
  groupBy: string,
): Map<string, DumpEntry[]> {
  const out = new Map<string, DumpEntry[]>();
  for (const e of entries) {
    const value = readGroupValue(e, groupBy);
    const key = value == null || value === '' ? '(unset)' : String(value);
    let arr = out.get(key);
    if (!arr) {
      arr = [];
      out.set(key, arr);
    }
    arr.push(e);
  }
  return out;
}

function readGroupValue(e: DumpEntry, key: string): unknown {
  // Typed fields first.
  if (key === 'status') return e.status;
  if (key === 'name') return e.name;
  if (key === 'type') return e.type;
  // Then frontmatter.
  if (e.frontmatter && key in e.frontmatter) return e.frontmatter[key];
  // Then resolved properties.
  if (e.properties && key in e.properties) return e.properties[key];
  return undefined;
}
