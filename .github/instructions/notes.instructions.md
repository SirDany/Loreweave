---
description: Rules for editing Traces (sticky traces — ideas, todos, remarks, questions) under sagas/*/traces/**.
applyTo: 'sagas/**/traces/**'
---

# Traces — editing rules

Traces are sticky-trace-style annotations attached to the Saga, a Tome, a chapter, or an entry. They are **not canon**; they are scratchpad material for ideas, todos, remarks, and questions.

## Frontmatter contract

```yaml
id: <kebab-case-slug> # must match filename stem
kind: idea | todo | remark | question | done
target:
  '@character/aaron' # OR "chapter:book-one/01-arrival"
  # OR "tome:book-two"
  # OR "saga"
  # OR omit for floating traces
author: muse | scribe | warden | polisher | <human>
created: 2026-04-23
updated: 2026-04-23
status: open | resolved | archived
tags: [<sigil-id>, ...]
```

- `id` must be unique within `traces/` and match the filename stem.
- `kind=done` is for traces that captured a decision; prefer `status: resolved` on the original trace instead of creating a `done` trace.
- Target formats are exact — the validator warns when a target does not resolve.

## When to create a trace

- A brainstorm that does **not** yet belong in the Codex: create a `kind: idea` trace targeting the relevant entry or chapter.
- A concrete followup action: create a `kind: todo` trace. Close it by setting `status: resolved` once done.
- A piece of prose context ("why did Aaron hesitate here?"): create a `kind: question` trace targeting the chapter.
- Cross-character reminders ("Cassia's accent must be consistent"): create a `kind: remark` targeting `saga` or a specific character.

## Do not

- Use traces to store canon facts. If it's canon, it goes in `codex/` or `lexicon/`.
- Reference a trace by `@trace/<id>`; the Echo system only indexes `character | location | concept | lore | waypoint | term | sigil`.
- Delete resolved traces outright — mark `status: resolved` so the history is preserved. Only archive (`status: archived`) traces the writer explicitly wants hidden.
