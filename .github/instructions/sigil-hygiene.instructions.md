---
description: "Rules for editing Sigil entries under sagas/*/sigils/**. Covers kind, slang-groups, and hygiene."
applyTo: "sagas/**/{sigils,tags}/**"
---
# Sigil hygiene

- **Entry type:** `sigil`. Required frontmatter: `id`, `type: sigil`, `name`. Optional: `kind`, `description`, `properties`.
- **`kind`** classifies the Sigil for the UI and validator. Known kinds:
  - `group` — generic grouping (default when omitted).
  - `slang-group` — groups Lexicon terms; referenced by `term.slang_of` and by `character.speaks` / `location.spoken_here`.
  - `faction`, `species`, `era` — semantic groupings; purely informational.
- **Inheritance.** Sigils may carry `properties` that get merged into any entry declaring `inherits: [<sigil-id>]`.
- **Don't create Sigils with no users.** If an entry doesn't reference a Sigil, ask whether to delete it.
- **Slang-group Sigils.**
  - Must have `kind: slang-group`.
  - Their `properties` typically include linguistic flavor (e.g. `register: "informal"`, `region: "north"`).
  - Do not list member terms here; membership is owned by each term via `slang_of`.
- **Naming.** Kebab-case ids. The `name` is a human label, not a style override.
- **Legacy** `tags/` + `type: tag` still load via aliases; run `lw migrate` to move to `sigils/` + `type: sigil`.
