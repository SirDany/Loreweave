# Kinds

A **Kind** defines an entry type — its name, echo prefix, storage
folder, and (forthcoming) property schema. Loreweave ships with a
built-in pack of seven Kinds matching the historical hardcoded types;
Sagas can override them or add their own.

## The built-in pack

| Kind id     | Echo prefix    | Storage folder        | Description                                    |
| ----------- | -------------- | --------------------- | ---------------------------------------------- |
| `character` | `@character/…` | `codex/characters/`   | A person, creature, or sapient being.          |
| `location`  | `@location/…`  | `codex/locations/`    | A place — city, region, building, world.       |
| `concept`   | `@concept/…`   | `codex/concepts/`     | An idea, force, faction, abstract canon.       |
| `lore`      | `@lore/…`      | `codex/lore/`         | Background lore, history, reference material.  |
| `waypoint`  | `@waypoint/…`  | `codex/waypoints/`    | An event entry, placed on Threads.             |
| `term`      | `@term/…`      | `lexicon/`            | A glossary or fantasy-language term.           |
| `sigil`     | `@sigil/…`     | `sigils/`             | A tag/grouping bundle inherited by entries.    |

These are seeded automatically by `loadSaga()`. You don't need to author
them. Echoes like `@character/aaron` continue to work without any
configuration.

## Adding a saga-defined Kind

Drop a markdown file at `<saga>/kinds/<id>.md`:

```markdown
---
id: quest
type: kind
name: Quest
echoPrefix: quest          # optional; defaults to `id`
storage: quests            # optional; defaults to `id`
aliases: [mission]         # optional; alt prefixes accepted in echoes
extends: <other-kind-id>   # optional; merges parent properties + display
display:
  icon: Sword
  color: orange
  listFields: [name, status]
  sortBy: name
properties:                # rendered as a synthesized form by KindForm
  status: { type: enum, options: [open, in-progress, done], default: open }
  reward: { type: string }
description: A questline or objective.
---

(Optional markdown body — not used today; reserved for Kind-level help.)
```

Then write entries under the configured `storage:` folder:

```markdown
---
id: find-the-sword
type: quest
name: Find the Sword
status: open
---

The hero must find the sword.
```

In your prose, reference it like any built-in:

```markdown
The hero set out on @quest/find-the-sword.
```

`lw validate` accepts the echo. `lw kinds <saga>` lists the catalog
including saga overrides.

## Overriding a built-in

Author `<saga>/kinds/character.md` with the same `id`. The saga file
wins. You can:

- Replace the display name (`name: Person`).
- Add aliases (`aliases: [npc, person]`) so `@npc/aaron` resolves.
- Change the storage folder.
- Extend a different parent Kind via `extends:`.

The original `@character/…` prefix continues to work only if you keep
`echoPrefix: character`. Setting `echoPrefix: person` rewires the
prefix, breaking older echoes — `lw migrate` will eventually support
prefix rewrites.

## Extends

`extends: <id>` walks the parent chain (BFS-style) and merges the parent's
`properties` and `display` shallowly, child wins. Cycles are rejected at
load time with a `KindCycleError`.

## CLI

```pwsh
pnpm lw kinds <saga>          # human-readable
pnpm lw kinds <saga> --json   # machine-readable (includes properties + display)
```

## Form synthesis

The web Entry Editor synthesizes a form per Kind from its `properties`
schema (`apps/web/src/components/forms/KindForm.tsx`). Field types map to
inputs as follows:

| `type`      | UI                                                                   |
| ----------- | -------------------------------------------------------------------- |
| `string`    | single-line text input                                               |
| `text`      | multi-line textarea                                                  |
| `number`    | numeric input                                                        |
| `boolean`   | checkbox                                                             |
| `date`      | date input                                                           |
| `enum`      | `<select>` populated from `options`                                  |
| `ref`       | `EchoPicker` filtered to `kind`                                      |
| `list`      | comma-separated input, or repeated EchoPicker if `of.type === 'ref'` |

Validation is best-effort and lenient (required, enum-options,
ref-shape, list-recurse) via the pure helpers in `kind-schema.ts`.
Field values round-trip through `frontmatter.properties` so they
never collide with the advanced-YAML escape hatch.

## Programmatic API (`@loreweave/core`)

```ts
import { loadKindCatalog, BUILTIN_KIND_DEFS } from '@loreweave/core';

const cat = await loadKindCatalog('/path/to/saga');
cat.byId.get('quest');     // ResolvedKind
cat.byEcho.get('npc');     // 'character' (alias resolved)
```
