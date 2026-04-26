# Loreweave Conventions

This is the canonical spec for the data model and authoring rules. Agents (`.github/agents/*.agent.md`) and the core library (`packages/core`) both operate under these rules.

## 1. Top-level layout

```
sagas/<saga-slug>/
├─ saga.yaml                        # Saga manifest (required)
├─ codex/                           # Codex: characters, locations, concepts, lore, waypoints
├─ lexicon/                         # Lexicon: terms
├─ sigils/                          # Sigils (tags), including slang-groups
├─ calendars/                       # optional in-world calendars
├─ threads/                         # Threads (timelines)
├─ traces/                          # Traces (ideas, todos, remarks)
└─ tomes/<tome-slug>/               # one book
   ├─ tome.yaml                     # Tome manifest
   └─ story/NN-<chapter-slug>/      # chapter folder
      ├─ chapter.md
      ├─ _meta.yaml
      └─ scenes/                    # optional
```

Legacy folder names still load via aliases — `wiki/` → `codex/`, `glossary/` → `lexicon/`, `tags/` → `sigils/`, `timelines/` → `threads/`. Run `lw migrate <saga> --apply` to update.

A **Saga** is one unified canon. Tomes hold **only prose**. There is no Tome-local Codex/Lexicon/Thread and no shadowing.

## 2. Manifests

### `saga.yaml`

```yaml
id: <kebab-case>
title: '<string>'
default_calendar: gregorian # optional
tome_order: [book-one, book-two]
```

### `tome.yaml`

```yaml
id: <kebab-case>
title: '<string>'
default_thread: main # optional
strict_slang: false # optional; if true, slang misuse = error
```

## 3. Entries (Codex / Lexicon / Sigils)

Every entry is a markdown file with YAML frontmatter. The filename stem **must equal `id`** (e.g. `aaron.md` → `id: aaron`).

### Common fields

| Field         | Required    | Notes                                                           |
| ------------- | ----------- | --------------------------------------------------------------- | -------- | ------- | ---- | -------- | ---- | ------ |
| `id`          | yes         | kebab-case, unique per type                                     |
| `type`        | yes         | `character                                                      | location | concept | lore | waypoint | term | sigil` |
| `name`        | recommended | Human-readable label                                            |
| `aliases`     | no          | Additional names                                                |
| `tags`        | no          | Sigil ids this entry is labelled with                           |
| `inherits`    | no          | Sigil ids whose `properties` merge into this entry              |
| `overrides`   | no          | Map of properties that **always** beat inherited and own values |
| `properties`  | no          | Free-form entry properties (own)                                |
| `appears_in`  | no          | Tome slugs; omit = present across the whole Saga                |
| `status`      | no          | `draft                                                          | canon`   |
| `speaks`      | character   | Sigil ids (kind: slang-group) the character speaks              |
| `spoken_here` | location    | Sigil ids (kind: slang-group) spoken there                      |

Legacy `type: event` and `type: tag` are auto-normalized to `waypoint` / `sigil` at load time.

### `type: term` (Lexicon)

```yaml
id: grukh
type: term
term: 'grukh'
language: 'Northern' # optional
slang_of: northern-slang # optional; Sigil id with kind: slang-group
pronunciation: '/ɡruːx/'
aliases: ['gruk']
examples: ['...', '...']
definition: 'bitter cold'
```

### `type: sigil` (Sigil)

```yaml
id: northern-slang
type: sigil
name: 'Northern Slang'
kind: slang-group # or `group`, `faction`, etc.
description: '...'
properties: { ... } # merged into any entry that `inherits` this Sigil
```

## 4. Weave (resolution: inherits / overrides)

When the resolver computes an entry's **Weave** (merged properties):

1. **Own properties** (from `properties`) are applied first.
2. **`inherits` parents** are walked **BFS**; for each parent Sigil's `properties`, fill only keys not already set.
3. **`overrides`** are applied last and **always win**.

Provenance for every resolved property is recorded: `own` / `sigil:<id>` / `override`.

Cycles in `inherits` are validation errors.

## 5. Echoes (the `@type/id` syntax)

In prose, frontmatter strings, and chapter bodies, Echo other entries as:

```
@character/aaron
@location/vellmar
@waypoint/battle-of-vellmar
@term/grukh
@sigil/northern-slang
```

Legacy `@event/` and `@tag/` prefixes are accepted and normalized.

Rules:

- Always use the **entry `type`**, not the folder name (`@character/aaron`, not `@characters/aaron`).
- Echoes are machine-checked; the validator errors on broken refs.
- Echoes are preserved verbatim during edits — don't flatten them to plain text.

### Display-text overrides

Append `{display text}` to an Echo to override the rendered label
without changing the link target. Useful when the prose calls a
character by an alias, a title, or a pronoun:

```
The @character/aaron{king} stood watch.
@character/aaron{he} drew his sword.
A messenger reached @location/vellmar{the gates}.
```

The reference still resolves to `character/aaron`, so audits, renames,
usage counts, and broken-ref checks keep working. The override is
honored by the chapter preview, the assistant pane, and Pandoc/HTML
exports. An empty `{}` is treated as "use the default name".

## 6. `appears_in` — Tome scope metadata

An optional `appears_in: [<tome-slug>, ...]` on any entry (or Waypoint) expresses that the entry is only narrated in those Tomes. Omit = present across the whole Saga.

The Tome lens filters by this field for views and some checks — it never moves files and never scopes canon.

## 7. Threads

Files live in `threads/<id>.yaml`:

```yaml
id: main
calendar: gregorian # optional; references calendars/<id>.yaml or builtin "gregorian"
branches_from: # optional; makes this a branch of another Thread
  thread: main
  at_waypoint: wp-battle
waypoints:
  - id: wp-battle
    event: '@waypoint/battle-of-vellmar'
    at: '1212-04-05' # absolute date in the Thread's calendar (optional)
    before: [other-wp-id] # relational constraints (optional)
    after: [other-wp-id]
    concurrent: [other-wp-id]
    appears_in: [book-one] # Tome lens (optional)
    label: 'Day of the fall'
```

Rules:

- A Waypoint placement may have **any combination** of `at`, `before`, `after`, `concurrent`.
- A contradiction between absolute dates and relational edges is an error.
- Cycles in before/after are errors.
- `branches_from` makes the Thread a branch; `linearize(..., { includeBranches: true })` walks parent Threads up to and including `at_waypoint`.

## 8. Calendars

Files live in `calendars/<id>.yaml`:

```yaml
id: gregorian # note: "gregorian" is also a built-in — a file is optional
kind: gregorian # gregorian | numeric
label: '...' # optional
```

- `gregorian` accepts ISO-8601 date strings (`YYYY-MM-DD`).
- `numeric` accepts integers (for day-numbers or abstract ticks).
- Custom calendar kinds with named months and eras are a future extension.

## 9. Chapters

`tomes/<slug>/story/NN-<chapter>/chapter.md` is the prose. Alongside it sits `_meta.yaml`:

```yaml
title: '...'
ordinal: 1
status: draft
pov: ['@character/bella']
voice: '<tone note>'
tense: past
summary: '<one-paragraph>'
linked_events: ['@waypoint/battle-of-vellmar']
```

## 10. Slang groups

- A **slang-group** is a Sigil (`type: sigil`) with `kind: slang-group`.
- Terms declare `slang_of: <sigil-id>` to belong to a group.
- Characters declare `speaks: [<sigil-id>, ...]`; locations declare `spoken_here: [...]`.
- **Slang misuse**: a POV character using a `@term/<id>` from a slang-group not in their `speaks` list is a **warning** by default. Set `strict_slang: true` in the Tome manifest to escalate to error.

## 11. Drafts

Work-in-progress entries and chapters carry `status: draft` in frontmatter/`_meta.yaml`. No separate `drafts/` folders.

## 12. CLI as ground truth

When canon is ambiguous, reach for the CLI:

```
lw validate sagas/<saga>
lw weave    sagas/<saga> character/aaron          # alias: resolve
lw echoes   sagas/<saga> character/aaron [--in-tome book-two]   # alias: refs
lw audit    sagas/<saga> [--tome book-two]
lw thread   sagas/<saga> main --linear [--with-branches] [--tome book-two]
lw calendar sagas/<saga> gregorian parse "1212-04-05"
lw migrate  sagas/<saga> [--apply]
```
