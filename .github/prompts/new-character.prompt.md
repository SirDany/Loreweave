---
description: "Create a new character entry in the Codex with proper frontmatter, tags, inheritance, and a starter description."
argument-hint: "Character name and one-line concept"
---
# New character

Create a new character entry in the current Saga's `codex/characters/`.

Steps:
1. Ask for (or confirm from the prompt): **name**, **role / concept (one line)**, **Tome(s) they appear in** (or "all"), **affiliations / factions** (which become Sigils), and **slang-groups they speak** (if any).
2. Propose an `id` (kebab-case from name). Confirm uniqueness against existing entries.
3. Draft the frontmatter:
   ```yaml
   ---
   id: <id>
   type: character
   name: <Name>
   aliases: []
   tags: [<affiliation-sigils>]
   inherits: [<sigils-whose-defaults-apply>]
   speaks: [<slang-group-sigils>]
   appears_in: [<tome-slugs>]   # omit if present across the whole Saga
   status: draft                # remove when canonized
   properties:
     age: ~
     appearance: ~
     role: "<role>"
   ---
   ```
4. Below the frontmatter, write a **Concept** section (3–5 bullets: who they are, what they want, what stands in the way) and a **Voice** section (1–2 sentences on how they talk).
5. Do **not** write prose about them. This is Codex, not narrative.
6. Report the file path and remind the writer to run `lw validate` (or simply save — Loreweave will re-validate).
