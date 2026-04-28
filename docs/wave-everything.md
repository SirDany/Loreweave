# Wave: cross-cutting features

This page summarises the features added in the `feat/wave-everything`
branch. Each lands as its own commit so individual pieces can be
reviewed (or reverted) in isolation.

## Block transclusion -- `@type/id#anchor`

Echoes can now select a slice of the target entry's body:

```md
The siege is described in @lore/the-fall#aftermath. Compare with the
quieter @lore/the-fall#prelude{the calm before}.
```

The anchor is the slugified heading text (`Prelude / Coda` -> `prelude-coda`).
Resolution returns the matching heading and everything beneath it up
to the next sibling-or-higher heading. An empty anchor (`@type/id#`)
returns the whole body.

API (in `@loreweave/core`): `extractTransclusions`, `slugifyHeading`,
`resolveTransclusion`. `normalizeRef` strips the anchor (and any
`{display}` suffix) so existing rename / lookup flows keep working.

## Per-entry `visibility`

Frontmatter now accepts an optional `visibility: public | private`. The
default is `public`. `lw publish` excludes private entries from the
baked snapshot unless `--include-private` is passed.

## `lw new <kind> <id>`

Scaffolds a stub markdown file under the kind's storage folder, with
required-and-defaulted properties pre-filled from the kind catalog.
Honours `--name`, `--status`, `--visibility`, `--tags`, `--dry-run`,
`--force`.

```bash
lw new sagas/example-saga character ezra --name "Ezra" --status draft
```

## `lw publish`

Bakes the same JSON shape the GitHub Pages demo workflow consumes
(`dump.json`, `kinds.json`, `lenses.json`) plus `summary.json` and
`diagnostics.json` under `<out>/demo/`. Refuses to publish when
validation has errors; preview with `--plan` first.

```bash
lw publish sagas/my-saga --out dist --plan
lw publish sagas/my-saga --out dist
```

To deploy: copy a built web bundle (`apps/web/dist/*` produced with
`VITE_LW_DEMO=1`) alongside the `demo/` folder and serve.

## Sidecar routes

* `GET /lw/continuity?sagaRoot=...&tome=...&limit=N` -- runs validation
  and returns rolled-up totals plus a sample of diagnostics. Used by
  the dashboard view.
* `POST /lw/refs/extract { sagaRoot, text }` -- returns echoes already
  in the prose, dangling echoes, and proposed entries whose name or
  aliases appear in the text but aren't linked. Designed for inline
  "Did you mean to link X?" suggestions.

## Desktop shell additions

Four Tauri commands (callable from the web shell via the global
`__TAURI_INTERNALS__.invoke`):

* `list_recent_sagas` / `add_recent_saga` / `forget_recent_saga` --
  maintain `~/.loreweave/recents.json`, capped at 20 entries.
* `check_for_updates` -- thin wrapper over `tauri-plugin-updater`. The
  endpoint is configured in `tauri.conf.json` but `updater.active` is
  `false` until releases are signed and a real Ed25519 pubkey is
  added.
* `open_log_file` -- returns today's desktop log path. Sidecar
  stdout/stderr is mirrored to `~/.loreweave/logs/desktop-<day>.log`
  in addition to the `lw://log` event.

The web app picks these up through `apps/web/src/lib/desktop.ts`,
which detects the Tauri runtime and falls back to no-ops in plain
browser / Pages mode.

The system tray menu (Show / Quick capture / Check for updates / Quit)
is documented as a TODO in `apps/desktop/src-tauri/src/lib.rs`. It was
deferred until the Tauri 2 menu/tray API is locked down for the
version pinned in `Cargo.toml` -- wiring it blind from a CI-only
build is too risky. The Rust commands above already provide the
underlying behaviour; the tray is a UX shortcut on top.

## Out of scope (deliberately)

* Yjs/Automerge multi-author collab -- needs a sync server and a
  conflict-resolution design.
* Plugin sandbox -- needs a security model and a versioned API
  contract.
* Embedded local LLM -- huge binary footprint, licensing implications.
* World Anvil / Notion / Foundry VTT export profiles -- format
  research per target. Existing pandoc-based exports cover the
  most common cases.
* Per-saga signed auto-update releases -- the plumbing is ready;
  pubkey + signing key generation is a release-process change, not a
  code change.
