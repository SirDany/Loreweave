---
description: "Create a new glossary term (word, slang, fantasy-language lexeme) with pronunciation, definition, and optional slang-group linkage."
argument-hint: "Term and short definition"
---
# New glossary term

Create a new term in `sagas/<saga>/lexicon/`.

Steps:
1. Ask for (or confirm): **term**, **definition (one line)**, **language** (optional), **slang-group Sigil** (optional; e.g. `northern-slang`), **pronunciation** (IPA or phonetic, optional), **aliases** (optional).
2. Propose an `id` (kebab-case from term). Warn on collision with an existing term.
3. Draft:
   ```yaml
   ---
   id: <id>
   type: term
   term: "<Term>"
   language: "<Language>"        # optional
   slang_of: <slang-group-sigil> # optional
   pronunciation: "<ipa>"         # optional
   aliases: []
   examples: []
   status: draft
   ---
   <Definition paragraph.>
   ```
4. If a `slang_of` Sigil is given but no matching `tag` entry exists, offer to create it with `kind: slang-group`.
5. Remind the writer that characters who speak this slang must list the Sigil in their `speaks` field.
