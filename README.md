# Loreweave

A local-first, agentic book-writing workbench. Your canon lives as plain markdown and YAML on disk; VS Code Copilot agents (Muse, Scribe, Warden, Polisher, Archivist) help you ideate, draft, and keep your world consistent; a Tauri + React desktop UI gives you a navigable Codex, Lexicon, Thread (timeline), traces, a constellation graph, git-based versions, and inline editing.

> **Status:** early scaffolding. Core library, CLI, agents, and desktop shell are usable end-to-end against the example Saga.

---

## Vocabulary

| Term         | What it is                                                                      |
| ------------ | ------------------------------------------------------------------------------- |
| **Saga**     | Series. Top-level project. `sagas/<saga-slug>/`                                 |
| **Tome**     | A book within a Saga. Holds **only prose** under `tomes/<slug>/story/`.         |
| **Codex**    | Characters, locations, concepts, lore, waypoints. `codex/`                      |
| **Lexicon**  | Terms, slang, pronunciations. `lexicon/`                                        |
| **Sigil**    | Tag / group / inheritance source. `sigils/`                                     |
| **Thread**   | Timeline of waypoints. `threads/`                                               |
| **Waypoint** | A waypoint entry placed on a Thread (absolute date, relational edges, or both). |
| **Echo**     | An `@type/id` reference written inline in prose or frontmatter.                 |
| **Weave**    | The resolved view of an entry: own properties + inherited Sigils + overrides.   |
| **Trace**    | Sticky trace (idea / todo / question / remark). `traces/`                       |

See [docs/conventions.md](docs/conventions.md) for the full spec.

---

## Repo layout

```
.github/                 Copilot instructions, agents, prompts
apps/desktop/            Tauri v2 + React + Vite UI
packages/core/           TS library: loader, resolver, validator, timeline, calendar, slang
packages/cli/            `lw` CLI
sagas/                   Your writing projects (one folder per Saga)
sagas/example-saga/      Reference content covering every feature
docs/                    Specs and conventions
```

A Saga directory looks like:

```
sagas/<saga>/
  saga.yaml
  codex/         characters/, locations/, concepts/, lore/, waypoints/
  lexicon/       terms / slang
  sigils/        tags & groups
  threads/       <id>.yaml
  calendars/     <id>.yaml
  traces/        <id>.md
  tomes/<tome>/
    tome.yaml
    story/NN-<chapter>/chapter.md  +  _meta.yaml
```

---

## Getting started

```pwsh
pnpm install
pnpm -r build
pnpm -r test

# Try the CLI against the example Saga
pnpm lw validate sagas/example-saga
pnpm lw weave    sagas/example-saga character/aaron      # alias of `resolve`
pnpm lw echoes   sagas/example-saga character/aaron      # alias of `refs`
pnpm lw thread   sagas/example-saga main --linear
pnpm lw audit    sagas/example-saga --tome book-one
```

Run the desktop UI:

```pwsh
pnpm --filter @loreweave/desktop dev          # plain Vite (no Tauri)
pnpm --filter @loreweave/desktop tauri:dev    # full Tauri shell
```

---

## CLI reference

```pwsh
lw validate <saga>                       # canon + slang + reference checks
lw weave    <saga> <type>/<id>           # resolved view (alias: resolve)
lw echoes   <saga> <type>/<id>           # inbound + outbound refs (alias: refs)
lw audit    <saga> [--tome <slug>]
lw thread   <saga> <thread-id> --linear [--with-branches] [--tome <slug>]
lw calendar <saga>
lw dump     <saga> [--tome <slug>]       # JSON used by the desktop app
lw search   <saga> <query> [--scope all|entries|prose|echoes] [--type <t>] [--case]
lw entry-diff <saga> <type>/<id> [--staged]     # `git diff` restricted to one entry's file
lw list-sagas [root]                     # discover Sagas under a directory

# Authoring tools
lw rename   <saga> <type>/<old> <new>            # rewrite all echoes + sigil inherits + waypoint event refs (dry-run by default; --apply to write)
lw migrate  <saga> [--apply]                     # legacy layout (wiki/glossary/tags/timelines/event/tag) -> canonical
lw ingest   <saga> <files...>                    # stage source material (md, txt, html, pdf, docx) for @archivist

# Publishing
lw export <saga> --format saga                   # zip the whole Saga
lw export <saga> --format saga     --plan        # print what would be zipped (use --json for machine output)
lw export <saga> --format saga-json              # full loaded Saga as JSON
lw export <saga> --format codex-md               # world-bible (all entries, grouped, cross-linked)
lw export <saga> --format codex-html
lw export <saga> --format slang-md               # Lexicon cheat-sheet, grouped by language / slang-group
lw export <saga> --format tome-md    --tome <slug>
lw export <saga> --format tome-html  --tome <slug>
lw export <saga> --format tome-pdf   --tome <slug>   # requires pandoc on PATH
lw export <saga> --format tome-docx  --tome <slug>   # requires pandoc on PATH
lw export <saga> --format tome-epub  --tome <slug>   # requires pandoc on PATH
lw export <saga> --format chapter-md --tome <slug> --chapter <slug>
lw import <bundle.zip> [--into sagas/] [--plan] [--resolve overwrite|keep|prompt]

# Backups
lw backup      <saga> [--label <name>] [--keep <n>]    # snapshot into <saga>/.loreweave/backups/
lw backup-list <saga>                                  # newest first
lw restore     <snapshot.zip> [--saga <dir>] [--apply] # dry-run by default; creates a pre-restore safety backup

# Local versioning (wraps git)
lw git status     <saga>
lw git branches   <saga> [--all] [--json]
lw git log        <saga> [--limit 30] [--json]
lw git commit     <saga> --message "msg" [--all]
lw git checkout   <saga> --branch <name> [--all]   # --all means create
lw git init       <saga>
lw git remotes    <saga>
lw git remote-add <saga> --remote <name> --url <url>
lw git fetch | pull | push <saga> [--remote <name>] [--branch <name>] [--all]
lw git diff       <saga> [--file <path>] [--staged]
lw git merge-abort | merge-continue <saga>
```

---

## Desktop UI

Sections in the **Grimoire** sidebar:

- **Story** — write chapter prose with inline `@type/id` autocomplete and decorations.
- **Codex** — browse and edit characters, locations, concepts, lore, waypoints. Each entry has _Rename_ and _Edit frontmatter_ buttons; renames cascade through every Echo, Sigil `inherits`, and Thread waypoint reference via `lw rename`.
- **Lexicon** — terms & slang.
- **Sigils** — tags & groups (incl. slang-groups).
- **Threads** — dated axis / relational flow / branching lane view of a Thread's waypoints.
- **Traces** — sticky traces; create with the **+ New trace** button.
- **Constellation** — read-only SVG graph of every entry (positioned on concentric rings by type) with edges for every Echo and `inherits` link. Filter by type; hover to highlight neighbors; click to jump.
- **Versions** — branch + dirty-files panel, commit message + _Commit all_, branch switcher, _Create & switch_, recent commits, remotes + fetch/pull/push, and inline snapshot controls. Falls back to a _git init_ button if the Saga isn't in a repo yet.

Across the top of the **Shelf** sidebar:

- **Open Saga…** — discover and switch between any Sagas under `sagas/`
- **Export…** — all CLI export formats (with a live plan preview for saga zips)
- **Import…** — two-step plan → apply flow with per-file conflict resolution
- **Search…** — global text or Echo search across entries + prose (or press `Ctrl+P` / `Ctrl+K`)
- **Backups…** — list snapshots, take a fresh one, dry-run a restore, apply with automatic safety backup

The right-hand **Weave** panel shows the resolved view of the selected entry, with **Echoes**, **Traces**, and **Diff** (against HEAD) tabs.

---

## Copilot agents

Open this repo in VS Code; agents in `.github/agents/` appear in the chat agent picker:

- **`@muse`** — sparring partner for ideation; never commits prose
- **`@scribe`** — writes chapters while honoring the Codex; updates the Codex when prose establishes new facts
- **`@warden`** — audits prose-vs-canon drift, broken Echoes, slang misuse
- **`@polisher`** — grammar/style only; never touches canon
- **`@archivist`** — drafts Codex/Lexicon entries from material staged via `lw ingest` (always `status: draft`)

Instructions in `.github/instructions/` auto-apply when you edit files under `codex/`, `lexicon/`, `sigils/`, `traces/`, or any tome's `story/`.

---

## Versioning

Loreweave is local-first; canon is plain text, so any git workflow works. The **Versions** view in the desktop UI and the `lw git ...` subcommands cover the common moves:

- Different drafts of the same chapter? Make a branch.
- Want to try out a name change? `lw rename` it on a feature branch, see how the Echoes shake out, merge or discard.
- Working with another writer? Push to a remote and pull as you would with code.
- Want a point-in-time safety net independent of git? `lw backup` snapshots the Saga as a self-contained zip.

The CLI is a thin wrapper around the system `git` binary, so anything git can do is still available outside Loreweave.

---

## Building installers

CI in `.github/workflows/build-desktop.yml` produces Tauri installers on every tag that matches `v*`:

- Windows `.msi`
- macOS `.dmg`
- Linux `.AppImage`

Run locally with:

```pwsh
pnpm --filter @loreweave/desktop tauri:build
```

Signed / auto-updating builds require additional Tauri signing config not included in this scaffold.

---

## License

TBD.
