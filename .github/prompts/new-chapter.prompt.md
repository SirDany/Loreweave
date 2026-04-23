---
description: "Scaffold a new chapter folder in a Tome with chapter.md and _meta.yaml, pre-linked to POV characters and referenced events."
argument-hint: "Tome slug and chapter title"
---
# New chapter

Create a new chapter under `sagas/<saga>/tomes/<tome>/story/`.

Steps:
1. Confirm: **Tome slug**, **chapter title**, **ordinal** (defaulting to next available), **POV character(s)**, **referenced events** (optional), **target length** (words).
2. Create the folder `NN-<slug>/` where `NN` is zero-padded ordinal and `<slug>` is kebab-case of title.
3. Write `chapter.md` with a one-line H1 (the chapter title) and an empty body (or a 1-line scene beat if the user provided one). Do **not** write prose yet — that's Scribe's job, on request.
4. Write `_meta.yaml`:
   ```yaml
   title: "<Title>"
   ordinal: <N>
   status: draft
   pov: ["@character/<id>"]
   voice: "<1-line tone note>"
   tense: past
   summary: ""
   linked_events: []
   ```
5. Report the folder path and offer to hand off to **Muse** (for beat brainstorming) or **Scribe** (if the prompt already contains a clear request to draft).
