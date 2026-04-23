---
description: "Rules for editing book prose (chapter.md, scene files, _meta.yaml) under sagas/*/tomes/*/story/**."
applyTo: "sagas/**/tomes/**/story/**"
---
# Story prose rules

- **Canon first.** Before changing prose, weave (resolve) any `@type/id` Echoes and confirm facts against the matching Codex entries.
- **Preserve Echoes.** Do not replace `@character/aaron` with the bare word "Aaron". Keep Echoes intact; add new ones when introducing a canon entity.
- **Match `_meta.yaml`.** POV, tense, and voice declared in the chapter's `_meta.yaml` are canon for that chapter.
- **No new canon in prose alone.** If prose introduces a new character, place, term, or Waypoint that has no Codex entry, either (a) create the entry in the same turn, or (b) ask the writer before proceeding.
- **Waypoints.** Narrated events that matter to the timeline require a matching Waypoint entry in `codex/waypoints/` (`type: waypoint`) and a Waypoint placement in the relevant `threads/<thread>.yaml`.
- **Drafts.** Work-in-progress chapters may have `status: draft` in `_meta.yaml`; treat them as malleable but still subject to canon.
- **Slang.** Only have characters use `@term/<id>` from slang-groups listed in their `speaks` field, unless the writer explicitly wants code-switching, mocking, or learning portrayed.
