// Validator: schema checks are already done at load time; this module
// layers referential integrity, cycles, shadowing, slang hygiene, and timeline contradictions.
import { extractReferences, normalizeRef } from "./references.js";
import { buildEntryIndex, CycleError, resolve } from "./resolver.js";
import { canCharacterSpeakTerm } from "./slang.js";
import { linearize } from "./timeline.js";
import type { Entry, EntryKey, Saga, Waypoint } from "./types.js";
import { entryKey } from "./types.js";

export type Severity = "error" | "warning";

export interface Diagnostic {
  severity: Severity;
  code: string;
  message: string;
  file?: string;
  line?: number;
}

function diag(
  severity: Severity,
  code: string,
  message: string,
  file?: string,
  line?: number,
): Diagnostic {
  return { severity, code, message, file, line };
}

function checkFrontmatterRefs(
  entries: Entry[],
  index: Map<EntryKey, Entry>,
  out: Diagnostic[],
) {
  for (const e of entries) {
    const fm = e.frontmatter;
    // inherits -> Sigil entries must exist
    for (const sigilId of fm.inherits ?? []) {
      if (!index.has(entryKey("sigil", sigilId))) {
        out.push(
          diag(
            "error",
            "missing-sigil",
            `${fm.type}/${fm.id} inherits unknown sigil "${sigilId}"`,
            e.relPath,
          ),
        );
      }
    }
    // tags -> Sigil entries must exist
    for (const sigilId of fm.tags ?? []) {
      if (!index.has(entryKey("sigil", sigilId))) {
        out.push(
          diag(
            "warning",
            "unknown-sigil",
            `${fm.type}/${fm.id} uses unknown sigil "${sigilId}"`,
            e.relPath,
          ),
        );
      }
    }
    // speaks / spoken_here must resolve to slang-group tags
    const speakLists: [string, string[] | undefined][] = [
      ["speaks", fm.speaks],
      ["spoken_here", fm.spoken_here],
    ];
    for (const [field, list] of speakLists) {
      for (const sigilId of list ?? []) {
        const sigil = index.get(entryKey("sigil", sigilId));
        if (!sigil) {
          out.push(
            diag(
              "error",
              "missing-slang-group",
              `${fm.type}/${fm.id}.${field} references unknown sigil "${sigilId}"`,
              e.relPath,
            ),
          );
          continue;
        }
        const kind = (sigil.frontmatter as { kind?: string }).kind;
        if (kind !== "slang-group") {
          out.push(
            diag(
              "error",
              "not-slang-group",
              `${fm.type}/${fm.id}.${field} references sigil "${sigilId}" which is not kind: slang-group`,
              e.relPath,
            ),
          );
        }
      }
    }
    // term.slang_of -> must be a slang-group Sigil
    if (fm.type === "term") {
      const slangOf = (fm as { slang_of?: string }).slang_of;
      if (slangOf) {
        const sigil = index.get(entryKey("sigil", slangOf));
        if (!sigil) {
          out.push(
            diag(
              "error",
              "missing-slang-group",
              `term/${fm.id}.slang_of references unknown sigil "${slangOf}"`,
              e.relPath,
            ),
          );
        } else if ((sigil.frontmatter as { kind?: string }).kind !== "slang-group") {
          out.push(
            diag(
              "error",
              "not-slang-group",
              `term/${fm.id}.slang_of references sigil "${slangOf}" which is not kind: slang-group`,
              e.relPath,
            ),
          );
        }
      }
    }
  }
}

function checkCycles(
  entries: Entry[],
  index: Map<EntryKey, Entry>,
  out: Diagnostic[],
) {
  for (const e of entries) {
    try {
      resolve(e, index);
    } catch (err) {
      if (err instanceof CycleError) {
        out.push(
          diag(
            "error",
            "inherit-cycle",
            `inheritance cycle: ${err.chain.join(" -> ")}`,
            e.relPath,
          ),
        );
      } else {
        throw err;
      }
    }
  }
}

function checkProseRefs(
  saga: Saga,
  index: Map<EntryKey, Entry>,
  out: Diagnostic[],
) {
  // prose = chapter bodies; also check entry bodies (they may contain @refs).
  const sources: Array<{ body: string; relPath: string }> = [];
  for (const t of saga.tomes)
    for (const c of t.chapters) sources.push({ body: c.body, relPath: c.relPath });
  for (const e of saga.entries) sources.push({ body: e.body, relPath: e.relPath });

  for (const src of sources) {
    for (const ref of extractReferences(src.body)) {
      if (!index.has(entryKey(ref.type, ref.id))) {
        out.push(
          diag(
            "error",
            "broken-reference",
            `reference ${ref.raw} is not resolvable`,
            src.relPath,
            ref.line,
          ),
        );
      }
    }
  }
}

function checkAppearsIn(saga: Saga, out: Diagnostic[]) {
  const tomeIds = new Set(saga.tomes.map((t) => t.manifest.id));
  for (const e of saga.entries) {
    for (const tomeId of e.frontmatter.appears_in ?? []) {
      if (!tomeIds.has(tomeId)) {
        out.push(
          diag(
            "error",
            "unknown-tome",
            `${e.frontmatter.type}/${e.frontmatter.id}.appears_in references unknown tome "${tomeId}"`,
            e.relPath,
          ),
        );
      }
    }
  }
  const allWaypoints: Array<{ wp: Waypoint; threadRel: string }> = [];
  for (const t of saga.threads)
    for (const w of t.waypoints)
      allWaypoints.push({ wp: w, threadRel: t.relPath });
  for (const { wp, threadRel } of allWaypoints) {
    for (const tomeId of wp.appears_in ?? []) {
      if (!tomeIds.has(tomeId)) {
        out.push(
          diag(
            "error",
            "unknown-tome",
            `waypoint "${wp.id}".appears_in references unknown tome "${tomeId}"`,
            threadRel,
          ),
        );
      }
    }
  }
}

function checkWaypointEvents(
  saga: Saga,
  index: Map<EntryKey, Entry>,
  out: Diagnostic[],
) {
  for (const t of saga.threads) {
    for (const wp of t.waypoints) {
      const id = normalizeRef(wp.event);
      // `event` field may be "@waypoint/xxx", "waypoint/xxx", or bare "xxx"
      const eventId = id.startsWith("waypoint/")
        ? id.slice("waypoint/".length)
        : id;
      if (!index.has(entryKey("waypoint", eventId))) {
        out.push(
          diag(
            "error",
            "broken-reference",
            `waypoint "${wp.id}" references unknown @waypoint/${eventId}`,
            t.relPath,
          ),
        );
      }
    }
  }
}

function checkThreads(saga: Saga, out: Diagnostic[]) {
  for (const t of saga.threads) {
    // Include branches for validation so relational edges to parent waypoints resolve.
    const res = linearize(t.id, saga.threads, saga.calendars, {
      includeBranches: Boolean(t.branches_from),
    });
    for (const issue of res.issues) {
      out.push(
        diag(
          issue.kind === "cycle" || issue.kind.endsWith("contradiction")
            ? "error"
            : "warning",
          issue.kind,
          issue.message,
          t.relPath,
        ),
      );
    }
  }
}

function checkSlang(saga: Saga, index: Map<EntryKey, Entry>, out: Diagnostic[]) {
  // slang misuse: a character uses @term/X in chapter body where term X is in slang-group S,
  // and the character doesn't list S in `speaks`.
  // Heuristic: a term reference "belongs to" a character when the chapter's `_meta.yaml.pov`
  // includes them, or a character is referenced in a nearby sentence (MVP: same paragraph).
  // MVP implementation: check POV characters only.
  for (const tome of saga.tomes) {
    const strict =
      tome.manifest.strict_slang === true;
    for (const chapter of tome.chapters) {
      const povRefs = chapter.meta.pov ?? [];
      const povIds = povRefs
        .map((r) => normalizeRef(r))
        .filter((r) => r.startsWith("character/"))
        .map((r) => r.slice("character/".length));
      if (!povIds.length) continue;
      for (const ref of extractReferences(chapter.body)) {
        if (ref.type !== "term") continue;
        for (const povId of povIds) {
          const res = canCharacterSpeakTerm(index, povId, ref.id);
          if (res.slangGroup && !res.ok) {
            out.push(
              diag(
                strict ? "error" : "warning",
                "slang-misuse",
                `POV character "@character/${povId}" uses @term/${ref.id} from slang-group "${res.slangGroup}" which they don't declare in \`speaks\``,
                chapter.relPath,
                ref.line,
              ),
            );
          }
        }
      }
    }
  }
}

function checkNotes(
  saga: Saga,
  index: Map<EntryKey, Entry>,
  out: Diagnostic[],
) {
  const tomeIds = new Set(saga.tomes.map((t) => t.manifest.id));
  const chapterKeys = new Set<string>();
  for (const t of saga.tomes)
    for (const c of t.chapters) chapterKeys.add(`${t.manifest.id}/${c.slug}`);

  for (const n of saga.notes) {
    const target = n.frontmatter.target;
    if (!target || target === "saga") continue;
    if (target.startsWith("chapter:")) {
      const key = target.slice("chapter:".length);
      if (!chapterKeys.has(key)) {
        out.push(
          diag(
            "warning",
            "note-bad-target",
            `note/${n.frontmatter.id}.target "${target}" does not match any chapter`,
            n.relPath,
          ),
        );
      }
      continue;
    }
    if (target.startsWith("tome:")) {
      const id = target.slice("tome:".length);
      if (!tomeIds.has(id)) {
        out.push(
          diag(
            "warning",
            "note-bad-target",
            `note/${n.frontmatter.id}.target "${target}" does not match any tome`,
            n.relPath,
          ),
        );
      }
      continue;
    }
    // Otherwise expect @type/id
    const cleaned = normalizeRef(target);
    const [typ, id] = cleaned.split("/");
    if (!typ || !id) {
      out.push(
        diag(
          "warning",
          "note-bad-target",
          `note/${n.frontmatter.id}.target "${target}" is not a valid @type/id reference`,
          n.relPath,
        ),
      );
      continue;
    }
    if (!index.has(entryKey(typ as Entry["frontmatter"]["type"], id))) {
      out.push(
        diag(
          "warning",
          "note-bad-target",
          `note/${n.frontmatter.id}.target "@${cleaned}" does not resolve to an entry`,
          n.relPath,
        ),
      );
    }
  }
}

export interface ValidateOptions {
  /** Restrict prose-dependent checks (slang, prose refs) to one Tome. */
  tome?: string | null;
}

export function validateSaga(saga: Saga, opts: ValidateOptions = {}): Diagnostic[] {
  const out: Diagnostic[] = [];
  const index = buildEntryIndex(saga.entries);

  // duplicate ids per type
  const seen = new Map<EntryKey, string>();
  for (const e of saga.entries) {
    const k = entryKey(e.frontmatter.type, e.frontmatter.id);
    if (seen.has(k)) {
      out.push(
        diag(
          "error",
          "duplicate-id",
          `duplicate ${e.frontmatter.type}/${e.frontmatter.id} (also at ${seen.get(k)})`,
          e.relPath,
        ),
      );
    } else {
      seen.set(k, e.relPath);
    }
  }

  checkFrontmatterRefs(saga.entries, index, out);
  checkCycles(saga.entries, index, out);
  checkAppearsIn(saga, out);
  checkWaypointEvents(saga, index, out);
  checkThreads(saga, out);
  checkProseRefs(saga, index, out);
  checkSlang(saga, index, out);
  checkNotes(saga, index, out);

  // tome filter: if caller asked for a specific tome, drop warnings/errors
  // from other tomes' prose. Canon-wide errors (missing refs, cycles) remain.
  if (opts.tome) {
    return out.filter((d) => {
      if (!d.file) return true;
      if (!d.file.startsWith("tomes/")) return true;
      return d.file.startsWith(`tomes/${opts.tome}/`);
    });
  }
  return out;
}

export function hasErrors(diags: Diagnostic[]): boolean {
  return diags.some((d) => d.severity === "error");
}
