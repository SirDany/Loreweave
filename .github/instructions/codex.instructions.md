---
description: "Rules for editing Codex entries (characters, locations, concepts, lore, waypoints) under sagas/*/codex/**."
applyTo: "sagas/**/{codex,wiki}/**"
---
# Codex rules

- **Frontmatter is canonical.** Every entry needs `id`, `type`, `name`. `id` must be the filename stem. Never edit `id` without updating every Echo.
- **Inheritance & overrides.**
  - `inherits: [<sigil-id>, ...]` — Sigil-level defaults merged BFS.
  - `overrides: { key: value, ... }` — **always** wins over inheritance.
  - `properties: { ... }` — the entry's own facts; wins over inheritance, loses to `overrides`.
- **No cycles.** An entry cannot, via `inherits`, reach itself.
- **`appears_in`.** Optional `appears_in: [<tome-slug>, ...]`. Omit = present across all Tomes of the Saga. Never duplicate entries to express Tome-exclusivity.
- **Echoes.** Link to other entries as `@type/id` (inline in prose fields) or as structured references (e.g. `related: ["@character/bella"]`).
- **Provenance comments.** When you change a property that contradicts prior canon, add a terse comment (`# was: ...`) so Warden can track intent.
- **Drafts.** `status: draft` for speculative entries; `status: canon` (or absent) for established.
- **Waypoints** (narrative events) live in `codex/waypoints/` with `type: waypoint`. Their placement on a Thread is declared in `threads/<thread>.yaml`, **not** in the entry itself. A Waypoint may appear on multiple Threads.
- **Legacy names** (`wiki/`, `type: event`, `@event/`) still load via aliases but should be migrated — run `lw migrate <saga>`.
