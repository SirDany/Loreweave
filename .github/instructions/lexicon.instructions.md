---
description: "Rules for editing Lexicon entries — terms, slang, fantasy-language words — under sagas/*/lexicon/**."
applyTo: "sagas/**/{lexicon,glossary}/**"
---
# Lexicon rules

- **Entry type:** `term`. Required frontmatter: `id`, `type: term`, `term`, `definition`.
- **Language & slang.**
  - `language: <name>` — optional, the in-world language or dialect.
  - `slang_of: <sigil-id>` — optional, links this term to a slang-group (a `sigil` entry with `kind: slang-group`).
- **Pronunciation & examples.**
  - `pronunciation: "<ipa or phonetic>"` — optional.
  - `examples: ["...", "..."]` — optional in-universe usage.
  - `aliases: [...]` — alternate spellings or related forms.
- **Echoes.** Terms can reference each other with `@term/<id>`; definitions may Echo characters/locations/concepts with `@type/id`.
- **Who speaks it.** Do not list speakers here. Characters and locations declare what they speak via `speaks` / `spoken_here` on their own entries.
- **Drafts.** `status: draft` is allowed while coining new words.
- **Legacy** `glossary/` still loads via alias; run `lw migrate` to move to `lexicon/`.
