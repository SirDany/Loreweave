---
description: "Run a full consistency audit on a Saga or Tome — validate schemas, references, timelines, and slang; return a structured report."
argument-hint: "Saga slug (and optional --tome <slug>)"
agent: "warden"
---
# Audit consistency

Hand off to **Warden**. Run a full audit against the specified Saga (and optional Tome).

Steps Warden should follow:
1. `lw validate sagas/<saga>` — schema and referential integrity.
2. `lw audit sagas/<saga> [--tome <slug>]` — canon vs prose drift, slang hygiene.
3. For each Thread in `threads/`, `lw thread sagas/<saga> <thread-id>` — contradictions between absolute dates and relational edges.
4. Aggregate findings into the Warden audit format (Errors / Contradictions / Thread issues / Slang warnings / Clean). Cite every finding with `path:line`.
5. Recommend a prioritized next action (usually: fix errors → resolve contradictions → address slang warnings if strict).
