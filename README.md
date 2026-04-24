# Loreweave

**A local-first, agentic book-writing workbench.**
Your canon lives as plain Markdown and YAML on your disk. A small TypeScript
core parses and validates it, a CLI (`lw`) gives you ground-truth queries, a
React web UI gives you a navigable world, and VS Code Copilot agents
(**Muse**, **Scribe**, **Warden**, **Polisher**, **Archivist**) help you
ideate, draft, and keep continuity — without ever silently rewriting your
story.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Node](https://img.shields.io/badge/node-%E2%89%A520.10-brightgreen)
![pnpm](https://img.shields.io/badge/pnpm-9.12-f69220)
![Tests](https://img.shields.io/badge/tests-117%20passing-success)

> **Status:** early but usable end-to-end against the bundled example Saga.
> APIs, file layout, and agent prompts may still shift before 1.0.

---

## Why Loreweave?

Most writing tools either hide your text behind a proprietary database or
treat the wiki, the timeline, and the prose as three unrelated apps.
Loreweave takes a different stance:

- **Your files stay yours.** Everything is plain text on disk, versionable
  with git, editable with any editor. No lock-in, no cloud account.
- **Canon is queryable.** A typed loader, resolver, and validator turn your
  Markdown/YAML into a graph you can audit, weave (resolve inheritance),
  search, and traverse from the CLI.
- **Agents are co-writers, not ghostwriters.** Each agent is scoped
  (`@scribe` drafts prose, `@warden` audits, `@polisher` only smooths
  language, `@muse` never commits). Every write is approval-gated.
- **Grounded in your world.** A cached canon digest (phone book + resolved
  weaves + thread summaries) is injected into every chat turn, and
  optional embeddings power a `semantic_search` tool — so agents cite
  your canon instead of hallucinating.

---

## Features

- **Codex / Lexicon / Sigils** — characters, locations, concepts, lore,
  waypoints, terms, slang, tags, and inheritance, all as frontmatter
  Markdown.
- **Weave resolution** — compose properties across Sigil `inherits` chains
  with explicit `overrides`; inherited values are surfaced in the UI
  (italicized, with provenance tooltips).
- **Threads with branches** — timeline YAML with absolute calendar dates,
  relational `before`/`after`/`concurrent` edges, and `branches_from`
  diffs against a parent thread.
- **Story mode & scene mode** — write a whole `chapter.md`, or split a
  chapter into `scenes/*.md` files and `lw compile` them back into a
  single chapter with a provenance banner.
- **Split-view editor** — prose on the left, Codex entry under the cursor's
  Echo on the right; jump between references in one click.
- **Constellation graph** — concentric-ring graph of the whole Saga, with
  a dedicated inheritance mode that highlights the Sigil ladder.
- **Local git versioning** — every approved agent write is one commit,
  with an in-app Versions panel, diff viewer, branch switcher, and
  snapshot-based backups.
- **Optional embeddings** — Ollama or any OpenAI-compatible endpoint;
  plain JSON index under `.loreweave/embeddings/`. Off by default.
- **Exports** — Saga zip, Codex/Slang Markdown+HTML, and per-tome
  Markdown/HTML/PDF/DOCX/EPUB (PDF/DOCX/EPUB require `pandoc`).

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
| **Weave**    | The resolved view of an entry: own properties + inherited Sigils + overrides.  |
| **Trace**    | Sticky trace (idea / todo / question / remark). `traces/`                       |

See [docs/conventions.md](docs/conventions.md) for the full spec.

---

## Quickstart

### Requirements

- **Node.js** `>=20.10`
- **pnpm** `9.12+` (`corepack enable` or `npm i -g pnpm`)
- **Git** (recommended — versioning, `lw git …`)
- **pandoc** (optional — PDF/DOCX/EPUB export)

### Install, build, run

```pwsh
git clone https://github.com/<you>/loreweave.git
cd loreweave
pnpm install
pnpm build:all       # builds core, cli, sidecar, and the web bundle
pnpm start           # launches Loreweave at http://127.0.0.1:4729
```

`pnpm start` runs [scripts/launch.mjs](scripts/launch.mjs): a tiny Node
server that serves the built web bundle and mounts the `/lw` sidecar on the
same port. It binds to `127.0.0.1` only — your filesystem is never exposed
over the network — and opens your default browser. Pass `--port 1234` to
change the port or `--no-open` to skip the browser launch.

### Dev mode (hot-reload)

For UI development you want Vite instead of the built bundle:

```pwsh
pnpm dev                          # alias of dev:web
pnpm --filter @loreweave/web dev  # explicit
```

Vite binds to `127.0.0.1:5173` and mounts the same sidecar middleware.

### Try the CLI

```pwsh
pnpm lw validate sagas/example-saga
pnpm lw weave    sagas/example-saga character/aaron       # resolved view
pnpm lw echoes   sagas/example-saga character/aaron       # inbound + outbound refs
pnpm lw thread   sagas/example-saga main --linear
pnpm lw audit    sagas/example-saga --tome book-one
pnpm lw compile  sagas/example-saga --tome book-one       # scenes/ → chapter.md
```

### Run the tests

```pwsh
pnpm test                         # all packages (core + cli + sidecar)
pnpm --filter @loreweave/web test # web tests
```

---

## Repo layout

```
.github/                 Copilot instructions, agents, prompts
apps/web/                React + Vite UI + sidecar Vite plugin
packages/core/           Loader, resolver, validator, timeline, calendar, digest
packages/cli/            `lw` — command-line ground truth
packages/sidecar/        HTTP middleware, agents, tools, embeddings
scripts/launch.mjs       Standalone launcher used by `pnpm start`
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
    story/NN-<chapter>/
      chapter.md
      _meta.yaml
      scenes/    (optional; `lw compile` concatenates → chapter.md)
```

---

## Copilot agents

Open this repo in VS Code; agents in [.github/agents/](.github/agents/) appear
in the chat agent picker:

| Agent         | Scope                                                                |
| ------------- | -------------------------------------------------------------------- |
| `@muse`       | Sparring partner for ideation. Never commits prose.                  |
| `@scribe`     | Writes chapters, honors the Codex, updates it when facts land.       |
| `@warden`     | Audits prose-vs-canon drift, broken Echoes, slang misuse.            |
| `@polisher`   | Grammar / punctuation / flow only. Never touches canon.              |
| `@archivist`  | Drafts Codex/Lexicon entries from material staged via `lw ingest`.   |

File-scoped rules in [.github/instructions/](.github/instructions/) auto-apply
when editing files under `codex/`, `lexicon/`, `sigils/`, `traces/`, or any
tome's `story/`.

---

## Web UI

The **Grimoire** sidebar surfaces every lens on your Saga:

- **Story** — chapter prose with inline `@type/id` autocomplete, Echo
  decorations, hover cards (status, aliases, inherited properties, tags),
  and a toggleable split-view Codex pane (`BookOpen` icon).
- **Codex** — browse/edit characters, locations, concepts, lore, waypoints;
  rename cascades through every Echo, Sigil `inherits`, and Waypoint
  reference via `lw rename`.
- **Lexicon** — terms & slang with pronunciations and slang-group membership.
- **Sigils** — tags, groups, slang-groups.
- **Threads** — dated axis / relational flow / branching lane view, with
  reorder and branch-diff modes.
- **Traces** — sticky traces (ideas / todos / questions / remarks).
- **Constellation** — SVG graph with type-filter, neighborhood highlight,
  and an inheritance-only mode.
- **Versions** — branch + dirty-files panel, commit, switch, fetch/pull/push,
  plus inline snapshot (backup/restore) controls.

The **Shelf** top bar carries **Open Saga…**, **Export…**, **Import…**,
**Search…** (`Ctrl+P` / `Ctrl+K`), and **Backups…**. The right-hand
**Weave** panel shows the resolved view with **Echoes**, **Traces**, and
**Diff** (vs HEAD) tabs.

---

## Embeddings (optional)

Embeddings are opt-in and never enabled silently. Set an env var, build an
index, and the `semantic_search` agent tool plus `/lw/embed/search` endpoint
light up:

```pwsh
# Ollama (local)
$env:LOREWEAVE_EMBEDDINGS          = "ollama"
$env:LOREWEAVE_EMBEDDINGS_ENDPOINT = "http://127.0.0.1:11434"
$env:LOREWEAVE_EMBEDDINGS_MODEL    = "nomic-embed-text"

# Or any OpenAI-compatible endpoint
$env:LOREWEAVE_EMBEDDINGS          = "openai-compatible"
$env:LOREWEAVE_EMBEDDINGS_ENDPOINT = "https://api.openai.com/v1"
$env:LOREWEAVE_EMBEDDINGS_MODEL    = "text-embedding-3-small"
$env:LOREWEAVE_EMBEDDINGS_API_KEY  = "sk-..."
```

The index is a plain JSON file at `<saga>/.loreweave/embeddings/index.json`
— no native deps, easy to delete, trivial to diff.

---

## CLI reference

```pwsh
# Canon
lw validate <saga>
lw weave    <saga> <type>/<id>           # alias: resolve
lw echoes   <saga> <type>/<id>           # alias: refs
lw audit    <saga> [--tome <slug>]
lw thread   <saga> <thread-id> --linear [--with-branches] [--tome <slug>]
lw calendar <saga>
lw dump     <saga> [--tome <slug>]
lw search   <saga> <query> [--scope all|entries|prose|echoes] [--type <t>] [--case]
lw entry-diff <saga> <type>/<id> [--staged]
lw list-sagas [root]

# Authoring
lw rename   <saga> <type>/<old> <new> [--apply]
lw migrate  <saga> [--apply]
lw ingest   <saga> <files...>                    # md / txt / html / pdf / docx
lw compile  <saga> [--tome <slug>] [--chapter <slug>] [--check]

# Publishing
lw export <saga> --format saga                         # zip
lw export <saga> --format saga-json
lw export <saga> --format codex-md | codex-html
lw export <saga> --format slang-md
lw export <saga> --format tome-md    --tome <slug>
lw export <saga> --format tome-html  --tome <slug>
lw export <saga> --format tome-pdf   --tome <slug>     # pandoc
lw export <saga> --format tome-docx  --tome <slug>     # pandoc
lw export <saga> --format tome-epub  --tome <slug>     # pandoc
lw export <saga> --format chapter-md --tome <slug> --chapter <slug>
lw import <bundle.zip> [--into sagas/] [--plan] [--resolve overwrite|keep|prompt]

# Backups
lw backup      <saga> [--label <name>] [--keep <n>]
lw backup-list <saga>
lw restore     <snapshot.zip> [--saga <dir>] [--apply]

# Local versioning (wraps git)
lw git status | branches | log | commit | checkout | init
lw git remotes | remote-add | fetch | pull | push | diff
lw git merge-abort | merge-continue
```

---

## Architecture

```
apps/web (React + Vite)
   │
   │  HTTP
   ▼
@loreweave/sidecar  ──►  @loreweave/cli  ──►  @loreweave/core
   │                       (spawned)            (pure TS)
   │
   ├─ /lw/dump, /lw/weave, /lw/echoes, …   (CLI passthrough)
   ├─ /lw/write, /lw/apply                 (approval-gated writes + git)
   ├─ /lw/digest                           (cached canon digest)
   ├─ /lw/embed/{status,build,search}      (optional)
   └─ /lw/chat, /lw/agents, /lw/events     (agent turns + SSE)
```

- **`packages/core`** is pure TypeScript with no I/O beyond a pluggable
  `StorageAdapter` (fs + in-memory).
- **`packages/cli`** is the ground-truth binary. The UI and sidecar never
  reimplement validation or weave — they shell out to `lw`.
- **`packages/sidecar`** is an embeddable connect-style middleware. Vite
  mounts it in dev; [scripts/launch.mjs](scripts/launch.mjs) mounts it in
  production alongside the static bundle.

---

## Hosting

Loreweave is local-first. The full app only makes sense with a sidecar that
can read/write your Saga on disk, so pure static hosts (GitHub Pages,
Netlify static, Cloudflare Pages) can't run the full experience.

Two free-on-GitHub options cover the realistic cases:

- **GitHub Pages — demo preview.** The [`pages` workflow](.github/workflows/pages.yml)
  builds `apps/web` with `VITE_LW_DEMO=1` and a repo-scoped base path, then
  deploys the static bundle with a persistent banner explaining that
  reads/writes are disabled. Good as a landing page.
- **GitHub Codespaces — full editor in the browser.** The
  [.devcontainer/](.devcontainer/devcontainer.json) config installs pnpm,
  builds the workspace, and forwards port `5173`. Click **Code →
  Codespaces → Create codespace on main** and run `pnpm dev` — the real
  sidecar is available over an authenticated tunnel.

For self-hosting (Fly.io / Render / a home server) you'd need to expose the
sidecar as a production HTTP service with auth. That changes the
local-first threat model and is out of scope for this repo.

---

## Contributing

Contributions are welcome — especially bug reports against the example
Saga, agent prompt tweaks, and polish on the web UI.

1. Fork and clone.
2. `pnpm install && pnpm build:all`.
3. `pnpm test && pnpm --filter @loreweave/web test` — keep them green.
4. For UI work, `pnpm dev`. For CLI/sidecar work, `pnpm -r --filter "./packages/*" build` in a second terminal as you iterate.
5. Open a PR. Describe what it does _and what it intentionally doesn't_.

### Invariants

When changing code, preserve these:

1. Writes are **always** approval-gated — no silent canon changes.
2. The CLI stays the authoritative ground truth for validation / weave / audit.
3. Local-first: no network call is required for core workflows.
4. `StorageAdapter` is the only filesystem seam in the sidecar.

Loreweave is intentionally desktop-only: multi-tenancy, hosted SaaS, public
HTTP APIs, BYO-key proxies, and live co-editing are all explicitly out of
scope. Those paths were considered and deliberately closed.

---

## License

[MIT](LICENSE). © 2026 Sir Dany and contributors.

The bundled [example Saga](sagas/example-saga) is released under the same
license and exists to demonstrate every feature — copy it, fork it, or
delete it.
# Loreweave

A local-first, agentic book-writing workbench. Your canon lives as plain markdown and YAML on disk; VS Code Copilot agents (Muse, Scribe, Warden, Polisher, Archivist) help you ideate, draft, and keep your world consistent; a React + Vite web UI (run locally against your own files) gives you a navigable Codex, Lexicon, Thread (timeline), traces, a constellation graph, git-based versions, and inline editing.

> **Status:** early scaffolding. Core library, CLI, agents, and web UI are usable end-to-end against the example Saga.

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
apps/web/                React + Vite UI, run locally via `pnpm dev`
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

## Requirements

- Node.js `>=20.10` (required)
- `pnpm` `9.12.0` or newer (recommended via `corepack enable` or `npm install -g pnpm`)
- Git (recommended for Saga versioning and `lw git` commands)
- Optional: `pandoc` on PATH for `lw export --format tome-pdf|tome-docx|tome-epub`

> The workspace is configured for `pnpm` and the root `package.json` specifies `packageManager: "pnpm@9.12.0"`.

## Getting started

1. Install prerequisites
   - Node 20.10+ and pnpm
   - Git for repository and Saga workflows
2. Install dependencies

```pwsh
pnpm install
```

3. Build the workspace

```pwsh
pnpm -r build
```

4. Run the test suite

```pwsh
pnpm -r test
```

5. Try the CLI against the example Saga

```pwsh
pnpm lw validate sagas/example-saga
pnpm lw weave    sagas/example-saga character/aaron      # alias of `resolve`
pnpm lw echoes   sagas/example-saga character/aaron      # alias of `refs`
pnpm lw thread   sagas/example-saga main --linear
pnpm lw audit    sagas/example-saga --tome book-one
```

## Run the web UI

Start the local app — it serves the React UI from Vite and exposes a small
`/lw` middleware that shells out to the CLI against your Sagas on disk:

```pwsh
pnpm dev                             # alias of dev:web
pnpm --filter @loreweave/web dev     # same thing, explicit filter
```

The dev server binds to `127.0.0.1:5173` by default, so your filesystem is
never exposed over the network. Open <http://localhost:5173> in any modern
browser.

To ship a static bundle (no backend, useful for previewing the UI):

```pwsh
pnpm --filter @loreweave/web build
pnpm --filter @loreweave/web preview
```

> The static preview cannot read or write Sagas — filesystem access requires
> the `dev` sidecar. Run `pnpm dev` for the full editing experience.

---

## Hosting

Loreweave is local-first by design: the web UI only becomes useful when paired
with the `/lw` sidecar that reads and writes your Saga on disk. That means no
pure static host (GitHub Pages, Netlify static, Cloudflare Pages) can run the
full app — there's no Node process or filesystem behind the served HTML.

Two free-on-GitHub options cover the realistic cases:

- **GitHub Pages — demo preview.** The [`pages` workflow](.github/workflows/pages.yml)
  builds `apps/web` with `VITE_LW_DEMO=1` and a repo-scoped base path, then
  deploys the static bundle. Visitors see the UI with a persistent banner
  explaining that reads/writes are disabled; good as a landing page and
  screenshot target. To enable: in your fork's **Settings → Pages**, set
  _Source_ to **GitHub Actions**, then push to `main`.
- **GitHub Codespaces — full editor in the browser.** The
  [`.devcontainer/`](.devcontainer/devcontainer.json) config installs pnpm,
  builds the workspace packages, and forwards port `5173`. Click **Code →
  Codespaces → Create codespace on main** and run `pnpm dev` inside the
  Codespace — you get the real sidecar over an authenticated tunnel. The free
  tier includes enough core-hours for regular personal use.

For a self-hosted instance (Fly.io / Render / a home server) you'd need to
expose the sidecar as a production HTTP service with auth; that's out of
scope for the repo as it stands because it changes the local-first threat
model.

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

## Web UI

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

Loreweave is local-first; canon is plain text, so any git workflow works. The **Versions** view in the web UI and the `lw git ...` subcommands cover the common moves:

- Different drafts of the same chapter? Make a branch.
- Want to try out a name change? `lw rename` it on a feature branch, see how the Echoes shake out, merge or discard.
- Working with another writer? Push to a remote and pull as you would with code.
- Want a point-in-time safety net independent of git? `lw backup` snapshots the Saga as a self-contained zip.

The CLI is a thin wrapper around the system `git` binary, so anything git can do is still available outside Loreweave.

---

## License

TBD.
