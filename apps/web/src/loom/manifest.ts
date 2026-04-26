/**
 * Lens manifest — a saved view configuration over the canon.
 *
 * Built-in Lenses ship as virtual manifests (see `builtin-lenses.ts`)
 * so the Shelf treats user-defined and built-in views uniformly.
 * Saga-defined Lenses live at `<saga>/.loreweave/lenses/<id>.yaml`.
 *
 * In Phase 3 only the manifest shape and the dispatch seam are added;
 * full per-renderer config validation arrives with Phase 4 contributed
 * renderers.
 */
export interface LensManifest {
  id: string;
  name: string;
  /** Lucide icon name. Falls back to a generic glyph if unknown. */
  icon?: string;
  /**
   * Renderer id registered with the Loom. Phase 0 built-in: 'list',
   * 'grid', 'graph', 'thread', 'prose', 'traces', 'versions',
   * 'codex', 'lexicon', 'sigils' (the last three are list variants
   * scoped to a specific Kind).
   */
  renderer: string;
  /** One-liner shown in the Shelf hover tooltip. */
  description?: string;
  /** Optional Kind id filter. Empty/undefined means all kinds. */
  kinds?: string[];
  /** Optional frontmatter filters (shallow). */
  filter?: {
    inherits?: string[];
    tags?: string[];
    status?: 'draft' | 'canon';
  };
  /** Group rows by this property name. */
  groupBy?: string;
  /** Sort key. Defaults to `name`. */
  sortBy?: string;
  /** Properties to show as columns/fields. */
  fields?: string[];
  /** True when the Lens is part of the built-in pack. */
  builtin?: boolean;
  /** Source path for saga-defined Lenses; undefined for built-ins. */
  source?: string;
  /**
   * Opt-in: allow renderers (e.g. kanban) to mutate entries via
   * drag-and-drop. The Workbench wires this to a `lwWrite`-backed
   * `onMove` callback on the renderer. Defaults to false (read-only).
   */
  editable?: boolean;
}
