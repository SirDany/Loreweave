# Loreweave

<p align="center">
  <img src="docs/assets/loreweave-icon.png" alt="Loreweave" width="160" />
</p>

<p align="center">
  <strong>A customizable framework for your notes, lore, and canon — engineered so AI agents assist your writing by following your own exact definitions precisely and reliably.</strong>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-PolyForm--Noncommercial--1.0.0-orange.svg" alt="License: PolyForm Noncommercial 1.0.0" /></a>
  <img src="https://img.shields.io/badge/node-%E2%89%A520.10-brightgreen" alt="Node >= 20.10" />
  <img src="https://img.shields.io/badge/pnpm-9.12-f69220" alt="pnpm 9.12" />
  <img src="https://img.shields.io/badge/mcp-compliant-blueviolet" alt="Model Context Protocol" />
  <img src="https://img.shields.io/badge/local--first-yes-blue" alt="Local First" />
</p>

---

## What is Loreweave?

> **Loreweave is a software solution designed to be tailored to your own needs, intended to be used with an AI agent for assisting — not for autonomous content generation.**

Most "AI writing" tools attempt to automate authoring: they generate generic prose, impose rigid three-act structures, or force your world into inflexible, pre-baked genre templates. 

**Loreweave does the exact opposite:**
- **You define the world, the categories, and the processes:** It is not a program designed to guide or dictate your creative process. Instead, every category, entity type, taxonomy, tag, rule, and workflow is defined entirely by the user. Whether your world needs characters, magic systems, quantum technologies, diplomatic treaties, or custom architectural classifications, you decide how your notes are structured.
- **Assisting, not content generating:** Loreweave is not an auto-complete ghostwriter or a bulk text generator. The AI is positioned as a rigorous, bounded **assistant** (an auditor, fact-checker, researcher, and continuity editor). Human writers retain total creative authority.
- **A reliable framework for your notes and agents:** Loreweave turns your notes, outlines, and world lore (stored as plain Markdown and YAML on your disk) into a typed, validated knowledge graph. This provides a deterministic foundation for AI agents: instead of hallucinating or drifting, **agents follow your own definitions, rules, and canon precisely and reliably**.
- **Human agency and approval gates:** Agents never silently modify your manuscript or canon. Every write proposed by an agent is strictly approval-gated and automatically committed to local Git history, giving you complete rollback capability and audit trails.

---

## Quickstart: How to Get Running

Anyone can get Loreweave running locally in just a few minutes. Follow the step-by-step instructions below.

### 1. Prerequisites

Before starting, make sure you have the following installed on your machine:

- **Node.js**: version `20.10.0` or higher ([Download Node.js](https://nodejs.org/))
  ```bash
  node --version   # should report v20.10.0 or greater
  ```
- **pnpm**: version `9.x` ([Installation Guide](https://pnpm.io/installation))
  ```bash
  # If you have npm or corepack:
  corepack enable
  # OR:
  npm install -g pnpm
  pnpm --version   # should report 9.x
  ```
- **Git**: installed and available in your terminal path ([Download Git](https://git-scm.com/))
  ```bash
  git --version
  ```

*(Optional dependencies)*:
- **Rust toolchain** (stable): only needed if you want to compile the native desktop Tauri application.
- **Pandoc**: only needed if exporting to PDF, DOCX, or EPUB formats (`lw export --format tome-pdf`).

---

### 2. Setup (3 Steps)

Open your terminal (PowerShell, Bash, or Zsh) and run:

```bash
# 1. Clone the repository
git clone https://github.com/Sir-Dany/Loreweave.git
cd Loreweave

# 2. Install workspace dependencies
pnpm install

# 3. Build all packages and the web application bundle
pnpm build:all
```

> **Tip:** `pnpm build:all` compiles `@loreweave/core`, `@loreweave/cli`, `@loreweave/sidecar`, `@loreweave/mcp`, and the `@loreweave/web` production assets in `apps/web/dist/`.

---

### 3. Launch Loreweave

You can run Loreweave in whichever mode fits your workflow:

#### Option A: Local Web Workbench (Recommended for Writers)

Launch the integrated local server (serves the web interface and mounts the local sidecar):

```bash
pnpm start
```

- Opens automatically in your browser at **`http://127.0.0.1:4729`**.
- Local-first & private: binds strictly to `127.0.0.1` — your files are never transmitted to any cloud server.
- Optional flags:
  ```bash
  node scripts/launch.mjs --port 8080    # Custom port
  node scripts/launch.mjs --no-open      # Don't auto-launch browser
  ```

#### Option B: Active UI Development Mode (Hot Reload)

If you are developing features or tweaking UI components with instant hot module reloading:

```bash
pnpm dev
```

- Starts the Vite development server at **`http://127.0.0.1:5173`** with the live sidecar middleware mounted.

#### Option C: Connect AI Agents via MCP (Model Context Protocol)

Loreweave provides a native **Model Context Protocol (MCP)** server over stdio. This enables any MCP-compatible AI assistant (such as **Claude Desktop**, **Cursor**, **Antigravity**, **VS Code**, or **Roo Code**) to read your canon, query timelines, audit consistency, and propose scoped changes using domain tools.

To run the MCP server manually:
```bash
pnpm mcp
```

##### Connecting to Claude Desktop
Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "loreweave": {
      "command": "pnpm",
      "args": ["--dir", "/path/to/Loreweave", "mcp"],
      "env": {
        "LOREWEAVE_SAGA_DIR": "/path/to/Loreweave/sagas/example-saga"
      }
    }
  }
}
```

##### Connecting to Cursor or Antigravity
Configure an MCP server in `.cursor/mcp.json` or your assistant settings:
```json
{
  "mcpServers": {
    "loreweave": {
      "command": "node",
      "args": ["/path/to/Loreweave/packages/mcp/dist/index.js"],
      "env": {
        "LOREWEAVE_SAGA_DIR": "/path/to/Loreweave/sagas/example-saga"
      }
    }
  }
}
```

The MCP server exposes high-level domain tools:
- `loreweave_get_overview` — summary of sagas, tomes, and entry counts
- `loreweave_read_entry` — read typed entries and their resolved frontmatter
- `loreweave_upsert_entry` — create or edit entries (draft / review flow)
- `loreweave_delete_entry` — delete entries safely
- `loreweave_get_timeline` — query chronologically ordered events and threads
- `loreweave_scan_loose_ends` — identify unresolved plot points and broken references
- `loreweave_cascade_rename` — rename an entry across all markdown echoes and YAML frontmatter

#### Option D: Command Line Ground Truth (`lw` CLI)

The `lw` CLI is the authoritative validator and manipulator of your canon:

```bash
# Validate your Saga graph and cross-references:
pnpm lw validate sagas/example-saga

# Inspect the resolved weave (inheritance + overrides) for an entry:
pnpm lw weave sagas/example-saga character/aaron

# Find all inbound and outbound references (Echoes) for an entity:
pnpm lw echoes sagas/example-saga character/aaron

# Audit prose chapters for broken echoes or canon drift:
pnpm lw audit sagas/example-saga --tome book-one

# Print a linear chronological timeline:
pnpm lw thread sagas/example-saga main --linear

# Concatenate scene files into a chapter:
pnpm lw compile sagas/example-saga --tome book-one
```

#### Option E: Desktop App (Tauri)

For a dedicated native desktop window (backed by Rust and system webview):

```bash
# Launch in native desktop debug mode:
pnpm desktop

# Build standalone desktop installer (.exe, .deb, .AppImage):
pnpm desktop:build
```

---

### 4. Running the Tests

Verify that your local setup is healthy:

```bash
# Run tests across core, cli, mcp, and sidecar:
pnpm test

# Run web UI component and integration tests:
pnpm --filter @loreweave/web test
```

---

## Core Concepts & Architecture

### Plain Text on Disk

Everything in Loreweave is stored as human-readable **Markdown** and **YAML** in standard directories. You can edit with VS Code, Obsidian, Neovim, or the Loreweave Web UI. There are no opaque databases, proprietary file formats, or cloud locks.

```
sagas/<saga-slug>/
  saga.yaml           # Metadata, active tome, calendar references
  codex/              # characters/, locations/, concepts/, lore/, waypoints/
  lexicon/            # terms/ and slang/ with phonetic pronunciation
  sigils/             # reusable tags, groups, and property-inheritance templates
  threads/            # timelines (<thread-id>.yaml) with calendar dates and DAG edges
  calendars/          # custom world calendars (<calendar-id>.yaml)
  traces/             # idea notes, todos, and inline remarks
  kinds/              # user-defined custom entity types (e.g., magic-system.md)
  tomes/<tome-slug>/  # books containing story prose
    tome.yaml
    story/01-first-chapter/
      chapter.md      # prose manuscript
      _meta.yaml      # chapter POV, setting, and timeline waypoint
      scenes/         # optional: modular scenes concatenated via `lw compile`
```

### The Assistance Pipeline: How Agents Respect Your Definitions

```
┌────────────────────────────────────────────────────────┐
│                   YOUR CANON ON DISK                   │
│   (Markdown + Frontmatter YAML + Threads + Lexicon)    │
└──────────────────────────┬─────────────────────────────┘
                           │ Typed Parse & Validation
                           ▼
┌────────────────────────────────────────────────────────┐
│                   @loreweave/core                      │
│   - Weave Resolution (Sigil inheritance + overrides)   │
│   - Echo Reference Graph (@type/id indexing)           │
│   - Chronological Thread & Calendar DAG                │
│   - Canon Digest Generation                            │
└──────────────┬──────────────────────────┬──────────────┘
               │                          │
        stdio  │                   HTTP   │
               ▼                          ▼
┌──────────────────────────────┐   ┌─────────────────────────────┐
│       @loreweave/mcp         │   │     @loreweave/sidecar      │
│  (For Claude, Cursor, AGY)   │   │  (For Web UI & Local Copilot│
└──────────────┬───────────────┘   └──────────────┬──────────────┘
               │                                  │
               ▼                                  ▼
┌────────────────────────────────────────────────────────┐
│                ASSISTING AGENT EXECUTION               │
│  1. Agent receives full Canon Digest & typed schemas   │
│  2. Agent calls domain tools to query exact facts      │
│  3. Agent performs audit, fact-check, or scoped draft  │
│  4. Proposals require Human Approval before write      │
│  5. Changes committed to local Git with audit trail   │
└────────────────────────────────────────────────────────┘
```

---

## Vocabulary

| Term | Meaning |
| :--- | :--- |
| **Saga** | A complete story universe or book series (`sagas/<slug>/`). |
| **Tome** | A single book within a Saga. Holds story prose under `tomes/<slug>/story/`. |
| **Codex** | Encyclopedia entries (characters, locations, concepts, lore, waypoints, custom kinds). |
| **Sigil** | A template for property inheritance and tagging. Entries inheriting a Sigil receive its default properties unless explicitly overridden. |
| **Weave** | The resolved, fully-computed view of an entry: its own fields + inherited Sigil properties + explicit overrides. |
| **Echo** | An inline reference (`@type/id`) in prose or notes that cross-links directly to a Codex entry. |
| **Thread** | A narrative timeline comprised of Waypoints, with support for branching timelines (`branches_from`) and relational ordering (`before`/`after`/`concurrent`). |
| **Waypoint** | A discrete narrative event or milestone tied to a calendar date, a relational position, or both. |
| **Lexicon** | World vocabulary: terms, dialects, slang, pronunciations, and specialized meanings. |
| **Trace** | Sticky note or memo attached to an entry or floating freely (ideas, questions, reminders). |

See [docs/conventions.md](docs/conventions.md) for the complete specification.

---

## The Built-in Agent Roles

Loreweave includes pre-configured, specialized agent personas in [.github/agents/](.github/agents/). Each agent is strictly bounded to prevent unauthorized modifications:

| Agent | Purpose & Boundaries |
| :--- | :--- |
| **`@warden`** | **Continuity Auditor:** Checks prose against the Codex. Verifies that character eye colors, travel timelines, lore constraints, and slang terms match established canon. Never edits files directly. |
| **`@scribe`** | **Prose & Canon Co-Writer:** Drafts or expands scenes while strictly adhering to Codex facts. If a new fact is established, it proposes a draft Codex update with `status: draft`. |
| **`@muse`** | **Ideation Partner:** Brainstorms plot alternatives, explores character motivations, and pressure-tests narrative logic. Never commits prose or alters canon. |
| **`@polisher`** | **Style & Grammar Editor:** Refines cadence, sentence structure, and vocabulary. Strictly barred from modifying facts, names, or lore. |
| **`@archivist`** | **Worldbuilder Assistant:** Ingests raw source notes (staged via `lw ingest`) and structures them into properly formatted Codex and Lexicon entries for your approval. |

---

## Web UI (Grimoire)

The Loreweave web application provides a clean, responsive workbench for writers:

- **Story Studio:** Split-view editor with prose on the left and active `@type/id` Codex reference cards on the right. Includes live autocomplete for lore entities and click-to-jump navigation.
- **Codex Explorer:** Filter, search, and manage world entries. Renaming an entry automatically updates all referencing Echoes and Sigils across the entire Saga.
- **Timeline Loom:** Visual representation of Threads, branching narrative paths, and calendar waypoints.
- **Constellation Graph:** Interactive graph showing the web of relationships and Sigil inheritance hierarchies connecting your lore.
- **Lexicon & Slang Guide:** Rapid lookup of pronunciation guides, dialect groupings, and definitions.
- **Versions & Snapshots:** Built-in Git branch manager, visual diff viewer, and instant snapshot backup/restore tools.

---

## Extending Loreweave to Your Needs

Because Loreweave is designed to be tailored to your requirements, it provides two primary extension points:

1. **Custom Kinds (Entity Types):**
   Need an entity type that isn't standard? Create a Markdown file in `sagas/<saga>/kinds/<kind-id>.md` (e.g., `magic-school.md`, `starship.md`, `faction.md`). Loreweave automatically generates forms, validation, and CLI commands for your custom kind. See [docs/kinds.md](docs/kinds.md).

2. **Custom Lenses (Views):**
   Want a custom way to view your data? Loreweave supports virtual Lenses (such as property-bucketed Kanban boards, timelines, or tabular registries). Add a YAML manifest at `sagas/<saga>/.loreweave/lenses/<lens-id>.yaml`. See [docs/loom.md](docs/loom.md).

---

## Troubleshooting

- **`node_modules missing` / Command not found**: Make sure you have run `pnpm install` in the root repository folder.
- **`missing dist/index.js` or `apps/web/dist`**: You must build the project before launching `pnpm start`. Run `pnpm build:all`.
- **Port already in use**: If port `4729` (default for `pnpm start`) or `5173` (default for `pnpm dev`) is in use, pass a custom port:
  ```bash
  node scripts/launch.mjs --port 5000
  ```
- **Node version warnings**: Ensure you are running Node.js `>= 20.10.0` with `node -v`. If you use `nvm` or `fnm`, run `nvm use 20` or `fnm use 20`.

---

## License

This software is licensed under the **[PolyForm Noncommercial License 1.0.0](LICENSE)**.

### Summary of Terms:
- **Free for Personal Use:** You are free to use, study, modify, and build upon Loreweave for personal writing, hobby projects, research, education, and noncommercial creative pursuits without paying any fees.
- **Commercial Use Strictly Prohibited:** You may not use this software for any commercial purpose (including for-profit business tools, commercial SaaS hosting, paid writing services, or embedding in commercial applications) without prior written permission.
- **Consent & Collaboration:** Commercial use is permitted **only with the express prior consent, collaboration, or a commercial license agreement** from the author (**Sir Dany**). For commercial inquiries, partnerships, or collaboration proposals, please reach out via GitHub issues or contact the maintainer directly.
