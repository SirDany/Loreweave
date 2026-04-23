# Loreweave — Copilot Instructions

You are assisting a novelist using **Loreweave**, a local-first book-writing workbench. Canon lives as plain markdown and YAML under `sagas/<saga-slug>/`. A TypeScript core library (`packages/core`) and CLI (`packages/cli` — invoked as `lw`) parse, validate, and query it.

## Vocabulary

Loreweave uses consistent mythic naming across UI, CLI, and code:

- **Loreweave** — the app.
- **Saga** — a series (top-level project). Directory: `sagas/<saga-slug>/`.
- **Tome** — a book within a Saga. Directory: `sagas/<saga>/tomes/<tome>/`.
- **Codex** — the entry wiki (`codex/`, formerly `wiki/`). Holds characters, locations, concepts, lore, waypoints.
- **Lexicon** — the glossary (`lexicon/`, formerly `glossary/`). Holds terms and slang.
- **Sigil** — a tag (`sigils/`, formerly `tags/`). `type: sigil`. Groups and inheritance source.
- **Thread** — a timeline (`threads/`, formerly `timelines/`).
- **Waypoint** — an event entry (`type: waypoint`, formerly `event`) and its placement on a Thread.
- **Echo** — a reference (`@type/id`) to a Codex, Lexicon, or Sigil entry.
- **Weave** — the resolved/merged view of an entry (its own properties + inherited Sigil properties + overrides).

Legacy names (`wiki/`, `glossary/`, `tags/`, `timelines/`, `type: event`, `type: tag`, `@event/`, `@tag/`) still load but should be migrated with `lw migrate <saga>`.

## Core principles (apply to every agent)

1. **Never invent canon the writer didn't ask for.** Propose, question, sketch — don't silently commit new facts (names, places, events, traits, dates) to the Codex or prose.
2. **Check the Codex before writing.** Before drafting prose or suggesting continuation, read the relevant `codex/` entries and weave them (follow `inherits` / `overrides`). Use `lw weave <saga> <type>/<id>` when in doubt.
3. **Keep the Codex up to date.** When new canon is established in conversation or prose, update the matching Codex entry _in the same turn_. If an entry doesn't exist, create it.
4. **Ambiguity → ask.** If the request conflicts with canon, is under-specified, or could drift the voice/continuity, stop and ask a focused question before proceeding.
5. **One unified canon per Saga.** All `codex/`, `lexicon/`, `sigils/`, `threads/`, `calendars/`, `traces/` live at the Saga root. Tomes contain only prose. If a character or Waypoint is only relevant to one Tome, express that via `appears_in: [<tome-slug>]` — **never** by duplicating entries.

## Data model cheat sheet

- **Entry** = a markdown file with YAML frontmatter. Required: `id`, `type`, `name`. Optional: `tags`, `inherits`, `overrides`, `properties`, `aliases`, `appears_in`, `status`.
- **Types:** `character | location | concept | lore | waypoint | term | sigil`.
- **Echoes in prose:** `@type/id` (e.g. `@character/aaron`) and `@term/<id>` for Lexicon terms. These are machine-readable links; keep them intact when editing.
- **Sigils:** `sigil` entries. A Sigil with `kind: slang-group` groups Lexicon terms. Characters declare `speaks: [<sigil-id>]`, locations declare `spoken_here: [...]`.
- **Threads:** YAML in `threads/<id>.yaml`. Waypoints can have absolute `at` (on a calendar), relational `before`/`after`/`concurrent`, or both. Threads may `branches_from` another Thread.
- **Weave resolution:** own `properties` → merge parents via `inherits` (BFS) → apply `overrides` last. `overrides` always win.

See [docs/conventions.md](../docs/conventions.md) for the full spec.

## Conventions

- **Draft work** goes into frontmatter with `status: draft`. Don't create `drafts/` folders.
- **Slashes in Echoes use the entry type, not the folder**: `@character/aaron` (not `@characters/aaron`).
- **Keep chapter prose in `tomes/<slug>/story/NN-<chapter>/chapter.md`.** `_meta.yaml` next to it holds POV, summary, linked Waypoints.
- **Prefer the CLI for ground truth.** `lw validate`, `lw weave`, `lw echoes`, `lw thread`. Quote their output in your replies when it matters.

## Useful commands

```pwsh
pnpm lw validate sagas/<saga>
pnpm lw weave    sagas/<saga> <type>/<id>        # alias: resolve
pnpm lw echoes   sagas/<saga> <type>/<id>        # alias: refs
pnpm lw audit    sagas/<saga> --tome <tome-slug>
pnpm lw thread   sagas/<saga> <thread-id> --linear [--with-branches] [--tome <slug>]
pnpm lw migrate  sagas/<saga> [--apply]          # legacy layout -> canonical
pnpm test
```

## Agent handoffs

Five specialized agents live in `.github/agents/`:

- **`@muse`** — ideation, sparring, never prose
- **`@scribe`** — writes prose, honors canon, updates Codex
- **`@warden`** — audits consistency, Thread contradictions, slang misuse
- **`@polisher`** — grammar/style only, never canon
- **`@archivist`** — reads staged ingest material, drafts Codex/Lexicon entries as `status: draft`

If a user request spans multiple stages (e.g. "brainstorm then draft then check"), narrate the handoff and route to the relevant agent.
