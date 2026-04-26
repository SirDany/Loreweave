# Loom — Lenses & renderers

The **Loom** is the renderer registry that powers Loreweave's
section views. A **Lens** is a saved view configuration over the canon
graph. Each Lens picks a registered renderer and feeds it a
configuration block.

Built-in Lenses (Codex, Lexicon, Sigils, Threads, Traces, Constellation,
Story, Versions) ship as virtual manifests so saga authors and
contributors override them the same way users add their own.

## Lens manifest

```yaml
id: northern-characters
name: Northern Characters
icon: Crown                    # lucide-react icon name
renderer: list                 # registered renderer id
description: Characters of the northern kingdom.
kinds: [character]             # restrict to one or more Kind ids
filter:
  inherits: [northern-kingdom] # only entries inheriting this sigil
  tags: [pov]
  status: canon
groupBy: status                # group rows by this property
sortBy: name                   # default sort key
fields: [name, role, home]     # columns/fields to show
editable: true                 # opt in to drag-and-drop edits
```

User-defined Lenses live at `<saga>/.loreweave/lenses/<id>.yaml`. The
filename stem must match the manifest's `id`. Saga manifests with the
same `id` as a built-in win — the original is shadowed.

Loreweave loads saga lenses via `lw lenses <saga> --json` and registers
them on every `useSaga.reload()`. From the UI, **Actions → Compose
lens…** scaffolds a manifest interactively (id, name, renderer, kinds,
filter, groupBy, sortBy, editable) with a live YAML preview, then
writes it through the standard `lwWrite` pathway.

### `editable`

Opt-in flag honored by renderers that support mutation (e.g. the
`kanban` renderer: drag a card across columns and the new column value
is persisted to the entry's frontmatter). Read-only by default.

## Built-in renderers

| Renderer id    | What it shows                                  |
| -------------- | ---------------------------------------------- |
| `list`         | Plain list of entries (default for Lexicon, Sigils). |
| `codex`        | Grouped Codex pane (characters/locations/lore). |
| `grid`         | Card grid (forthcoming).                       |
| `graph`        | Constellation — graph of echoes between entries. |
| `thread`       | Thread view (timelines, waypoints).            |
| `prose`        | Story chapter editor.                          |
| `traces`       | TracesList (ideas, todos, sticky notes).       |
| `versions`     | Git versions panel (branches, commits).        |
| `kanban`       | **Contributed** — buckets entries by a property (Phase 4 reference contribution). |

## Contributing a renderer

Renderers are React components living under
`apps/web/src/loom/contrib/`. Each contribution registers itself with
the Loom in `loom/contrib/index.ts`.

1. **Add the file:** `apps/web/src/loom/contrib/MyLens.tsx`
   ```tsx
   import type { LensManifest } from '../manifest.js';
   import type { DumpEntry } from '../../lib/lw.js';

   export interface MyLensProps {
     manifest: LensManifest;
     entries: DumpEntry[];
     selectionKey?: string;
     onSelect?: (key: string) => void;
     /** Optional: opt in via manifest.editable to receive moves. */
     onMove?: (entry: DumpEntry, newColumn: string) => void;
   }

   export function MyLens(props: MyLensProps) {
     // ...your renderer
   }
   ```

2. **Register it:** edit `apps/web/src/loom/contrib/index.ts` and add a
   `registerLens` call inside `bootContribLenses()`:
   ```ts
   import { MyLens } from './MyLens.js';
   registerLens({
     id: 'my-lens',
     name: 'My Lens',
     description: 'Short blurb shown in the picker.',
     component: MyLens,
   });
   ```

3. **Test the pure pieces.** Renderers stay easy to unit-test if they
   factor their data work into pure helpers (see
   `KanbanLens.bucketEntries` for the reference pattern).

4. **Document it** in this table.

## Reference contribution: `kanban`

[`apps/web/src/loom/contrib/KanbanLens.tsx`](../apps/web/src/loom/contrib/KanbanLens.tsx)
buckets entries by a property value (default `status`) into columns.
It demonstrates the full surface:

- Reads the Lens manifest's `kinds`, `filter`, and `groupBy`.
- Filters and groups the `entries` prop the Workbench passes in.
- Calls back to `onSelect(key)` with `<type>/<id>` keys when a card is
  clicked.
- When the manifest sets `editable: true`, cards become draggable and
  dropping a card on a different column emits `onMove(entry, newColumn)`;
  the host writes the patched frontmatter via `lwWrite` (see
  `apps/web/src/loom/contrib/frontmatter-patch.ts` for the pure
  patch helpers).

A user Lens that wires this renderer up:

```yaml
# .loreweave/lenses/character-board.yaml
id: character-board
name: Characters by Status
icon: KanbanSquare
renderer: kanban
kinds: [character]
groupBy: status
editable: true   # enable drag-and-drop column moves
```

## Programmatic API (`apps/web/src/loom`)

```ts
import {
  registerLens,
  registerLensManifest,
  listLensManifests,
} from './loom/registry.js';
import { bootLensCatalog } from './loom/catalog.js';
import { bootContribLenses } from './loom/contrib/index.js';

bootLensCatalog();      // built-in manifests
bootContribLenses();    // contributed renderers
registerLensManifest({  // a saga-loaded manifest
  id: 'my-board',
  name: 'My Board',
  renderer: 'kanban',
  kinds: ['character'],
  groupBy: 'status',
  builtin: false,
});
```
