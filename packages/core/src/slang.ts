// Slang-group helpers: who speaks what, and is this character using slang they shouldn't?
import type { Entry, EntryKey } from "./types.js";
import { entryKey } from "./types.js";

export interface SlangMisuse {
  character: string;
  termRef: string; // "@term/<id>"
  slangGroup: string;
  reasonHint: string;
}

/** All slang-group Sigil ids. */
export function slangGroups(entries: Entry[]): Set<string> {
  const out = new Set<string>();
  for (const e of entries) {
    if (
      e.frontmatter.type === "sigil" &&
      "kind" in e.frontmatter &&
      (e.frontmatter as { kind?: string }).kind === "slang-group"
    ) {
      out.add(e.frontmatter.id);
    }
  }
  return out;
}

/** Map a term id to its slang-group (if any). */
export function termSlangMap(entries: Entry[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const e of entries) {
    if (e.frontmatter.type === "term") {
      const fm = e.frontmatter as { slang_of?: string; id: string };
      if (fm.slang_of) map.set(fm.id, fm.slang_of);
    }
  }
  return map;
}

/** Given a character entry, return the set of slang-groups they speak. */
export function characterSpeaks(entry: Entry): Set<string> {
  return new Set(entry.frontmatter.speaks ?? []);
}

/**
 * Build a quick lookup: given character id + term id, does the character speak this term's slang-group?
 * Returns null if character doesn't exist or term isn't in any slang-group.
 */
export function canCharacterSpeakTerm(
  entries: Map<EntryKey, Entry>,
  charId: string,
  termId: string,
): { ok: boolean; slangGroup: string | null } {
  const char = entries.get(entryKey("character", charId));
  const term = entries.get(entryKey("term", termId));
  if (!char || !term) return { ok: true, slangGroup: null };
  const slangOf = (term.frontmatter as { slang_of?: string }).slang_of;
  if (!slangOf) return { ok: true, slangGroup: null };
  const speaks = characterSpeaks(char);
  return { ok: speaks.has(slangOf), slangGroup: slangOf };
}
