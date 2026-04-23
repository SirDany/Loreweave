---
description: Rules for editing Notes (sticky notes — ideas, todos, remarks, questions) under sagas/*/notes/**.
applyTo: "sagas/**/notes/**"
---

# Notes — editing rules

Notes are sticky-note-style annotations attached to the Saga, a Tome, a chapter, or an entry. They are **not canon**; they are scratchpad material for ideas, todos, remarks, and questions.

## Frontmatter contract

```yaml
id: <kebab-case-slug>           # must match filename stem
kind: idea | todo | remark | question | done
target: "@character/aaron"       # OR "chapter:book-one/01-arrival"
                                  # OR "tome:book-two"
                                  # OR "saga"
                                  # OR omit for floating notes
author: muse | scribe | warden | polisher | <human>
created: 2026-04-23
updated: 2026-04-23
status: open | resolved | archived
tags: [<sigil-id>, ...]
```

- `id` must be unique within `notes/` and match the filename stem.
- `kind=done` is for notes that captured a decision; prefer `status: resolved` on the original note instead of creating a `done` note.
- Target formats are exact — the validator warns when a target does not resolve.

## When to create a note

- A brainstorm that does **not** yet belong in the Codex: create a `kind: idea` note targeting the relevant entry or chapter.
- A concrete followup action: create a `kind: todo` note. Close it by setting `status: resolved` once done.
- A piece of prose context ("why did Aaron hesitate here?"): create a `kind: question` note targeting the chapter.
- Cross-character reminders ("Cassia's accent must be consistent"): create a `kind: remark` targeting `saga` or a specific character.

## Do not

- Use notes to store canon facts. If it's canon, it goes in `codex/` or `lexicon/`.
- Reference a note by `@note/<id>`; the Echo system only indexes `character | location | concept | lore | waypoint | term | sigil`.
- Delete resolved notes outright — mark `status: resolved` so the history is preserved. Only archive (`status: archived`) notes the writer explicitly wants hidden.
