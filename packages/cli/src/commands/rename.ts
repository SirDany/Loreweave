import { promises as fs } from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { loadSaga, entryKey, type EntryType } from "@loreweave/core";

export interface RenameOpts {
  apply?: boolean;
  json?: boolean;
}

interface RenameHit {
  relPath: string;
  count: number;
  matches: Array<{ line: number; column: number; raw: string }>;
}

interface ExtraHit {
  relPath: string;
  kind: "sigil-frontmatter" | "waypoint-event";
  count: number;
}

interface RenamePlan {
  from: { type: EntryType; id: string };
  to: { type: EntryType; id: string };
  sourceFile: string | null;
  targetFile: string | null;
  idInFrontmatter: boolean;
  hits: RenameHit[];
  extraHits: ExtraHit[];
  conflicts: string[];
}

const VALID_TYPES: EntryType[] = [
  "character",
  "location",
  "concept",
  "lore",
  "waypoint",
  "term",
  "sigil",
];

function parseRef(ref: string): { type: EntryType; id: string } {
  const bare = ref.replace(/^@/, "");
  const slash = bare.indexOf("/");
  if (slash < 0) throw new Error(`invalid reference "${ref}" — expected type/id`);
  const t = bare.slice(0, slash);
  const id = bare.slice(slash + 1);
  if (!VALID_TYPES.includes(t as EntryType)) {
    throw new Error(`invalid type "${t}"`);
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    throw new Error(`invalid id "${id}" — expected kebab-case`);
  }
  return { type: t as EntryType, id };
}

function parseTarget(
  spec: string,
  fallbackType: EntryType,
): { type: EntryType; id: string } {
  if (spec.includes("/")) return parseRef(spec);
  // Allow bare id — keep the source type.
  if (!/^[a-z0-9][a-z0-9-]*$/.test(spec)) {
    throw new Error(`invalid id "${spec}"`);
  }
  return { type: fallbackType, id: spec };
}

/**
 * Walk a directory recursively and yield text files (.md, .yaml, .yml).
 */
async function* walkText(root: string): AsyncGenerator<string> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const full = path.join(root, e.name);
    if (e.isDirectory()) {
      yield* walkText(full);
    } else if (/\.(md|ya?ml)$/i.test(e.name)) {
      yield full;
    }
  }
}

function findMatches(text: string, from: { type: EntryType; id: string }): RenameHit["matches"] {
  const re = new RegExp(`@${from.type}/${from.id}(?![a-z0-9-])`, "g");
  const matches: RenameHit["matches"] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const prefix = text.slice(0, m.index);
    const line = prefix.split("\n").length;
    const lastNL = prefix.lastIndexOf("\n");
    const column = m.index - (lastNL + 1) + 1;
    matches.push({ line, column, raw: m[0] });
  }
  return matches;
}

function rewriteText(text: string, from: { type: EntryType; id: string }, to: { type: EntryType; id: string }): string {
  const re = new RegExp(`@${from.type}/${from.id}(?![a-z0-9-])`, "g");
  return text.replace(re, `@${to.type}/${to.id}`);
}

/**
 * For sigil renames, also rewrite bare-id occurrences in YAML list-style
 * frontmatter fields: `inherits`, `tags`, `speaks`, `spoken_here`.
 * Returns the rewritten text and a count of replacements made.
 */
function rewriteSigilIdInFrontmatter(
  text: string,
  fromId: string,
  toId: string,
): { text: string; count: number } {
  if (!text.startsWith("---")) return { text, count: 0 };
  const end = text.indexOf("\n---", 3);
  if (end < 0) return { text, count: 0 };
  const fm = text.slice(0, end);
  const rest = text.slice(end);

  const FIELDS = ["inherits", "tags", "speaks", "spoken_here"];
  let count = 0;
  let nextFm = fm;

  for (const field of FIELDS) {
    // Inline form: `field: [a, b, c]`
    const inlineRe = new RegExp(`^(${field}:\\s*\\[)([^\\]\\n]*)(\\])`, "m");
    nextFm = nextFm.replace(inlineRe, (_m, head, body, tail) => {
      const items = body.split(",").map((s: string) => s.trim());
      let changed = false;
      const out = items.map((it: string) => {
        const qm = it.match(/^(['"]?)(.*?)\1$/);
        const quote = qm?.[1] ?? "";
        const inner = qm?.[2] ?? it;
        if (inner === fromId) {
          changed = true;
          count++;
          return `${quote}${toId}${quote}`;
        }
        return it;
      });
      return changed ? `${head}${out.join(", ")}${tail}` : `${head}${body}${tail}`;
    });

    // Block form:
    //   field:
    //     - a
    //     - b
    const blockRe = new RegExp(
      `(^${field}:\\s*\\n)((?:[ \\t]+-[ \\t]*[^\\n]*\\n?)+)`,
      "m",
    );
    nextFm = nextFm.replace(blockRe, (_m, header, body) => {
      const lines = body.split("\n");
      let changed = false;
      const out = lines.map((line: string) => {
        const m = line.match(/^(\s+-\s*)(['"]?)([^'"\s]+)(\2)\s*$/);
        if (m && m[3] === fromId) {
          changed = true;
          count++;
          return `${m[1]}${m[2]}${toId}${m[4]}`;
        }
        return line;
      });
      return changed ? header + out.join("\n") : _m;
    });
  }

  return { text: nextFm + rest, count };
}

/**
 * For waypoint renames, also rewrite `event:` field on thread waypoints
 * that reference the bare id (or "@waypoint/<id>" / "waypoint/<id>").
 */
function rewriteWaypointEventField(
  text: string,
  fromId: string,
  toId: string,
): { text: string; count: number } {
  let count = 0;
  // event: bare-id   (kebab-id only, on its own line, possibly quoted)
  const re = new RegExp(
    `^(\\s*event:\\s*)(['"]?)(?:@?waypoint/)?${fromId}(\\2)\\s*$`,
    "gm",
  );
  const next = text.replace(re, (_m, head, q1) => {
    count++;
    return `${head}${q1}${toId}${q1}`;
  });
  return { text: next, count };
}

function rewriteFrontmatterId(text: string, fromId: string, toId: string): { text: string; changed: boolean } {
  // Only rewrite the top-of-file frontmatter block.
  if (!text.startsWith("---")) return { text, changed: false };
  const end = text.indexOf("\n---", 3);
  if (end < 0) return { text, changed: false };
  const fm = text.slice(0, end);
  const body = text.slice(end);
  const re = new RegExp(`^id:\\s*${fromId}\\s*$`, "m");
  if (!re.test(fm)) return { text, changed: false };
  return { text: fm.replace(re, `id: ${toId}`) + body, changed: true };
}

export async function buildRenamePlan(
  sagaPath: string,
  fromSpec: string,
  toSpec: string,
): Promise<RenamePlan> {
  const from = parseRef(fromSpec);
  const to = parseTarget(toSpec, from.type);

  const loaded = await loadSaga(sagaPath);
  const conflicts: string[] = [];

  // Does the target already exist?
  const targetExists = loaded.entries.some(
    (e) => e.frontmatter.type === to.type && e.frontmatter.id === to.id,
  );
  if (targetExists && entryKey(from.type, from.id) !== entryKey(to.type, to.id)) {
    conflicts.push(`target entry ${to.type}/${to.id} already exists`);
  }

  const sourceEntry = loaded.entries.find(
    (e) => e.frontmatter.type === from.type && e.frontmatter.id === from.id,
  );

  let sourceFile: string | null = null;
  let targetFile: string | null = null;
  let idInFrontmatter = false;
  if (sourceEntry) {
    sourceFile = sourceEntry.relPath;
    idInFrontmatter = sourceEntry.frontmatter.id === from.id;
    if (from.type === to.type && from.id !== to.id) {
      // Rename the file itself: same folder, new basename.
      const dir = path.dirname(sourceEntry.relPath);
      const ext = path.extname(sourceEntry.relPath);
      targetFile = path.join(dir, to.id + ext).replace(/\\/g, "/");
      const absTarget = path.join(sagaPath, targetFile);
      try {
        await fs.access(absTarget);
        if (absTarget !== path.join(sagaPath, sourceFile)) {
          conflicts.push(`target file ${targetFile} already exists`);
        }
      } catch {
        /* ok */
      }
    }
  }

  // Scan all text files for @echoes and bare-id refs in special fields.
  const hits: RenameHit[] = [];
  const extraHits: ExtraHit[] = [];
  for await (const abs of walkText(sagaPath)) {
    const rel = path.relative(sagaPath, abs).replace(/\\/g, "/");
    if (rel.startsWith(".loreweave/") || rel.startsWith("node_modules/")) continue;
    let text: string;
    try {
      text = await fs.readFile(abs, "utf8");
    } catch {
      continue;
    }
    const matches = findMatches(text, from);
    if (matches.length > 0) {
      hits.push({ relPath: rel, count: matches.length, matches });
    }

    if (from.type === "sigil") {
      // Don't double-count the source file's own `id:` (handled separately).
      const probe = rewriteSigilIdInFrontmatter(text, from.id, to.id);
      if (probe.count > 0) {
        extraHits.push({ relPath: rel, kind: "sigil-frontmatter", count: probe.count });
      }
    }
    if (from.type === "waypoint" && /\.ya?ml$/i.test(rel)) {
      const probe = rewriteWaypointEventField(text, from.id, to.id);
      if (probe.count > 0) {
        extraHits.push({ relPath: rel, kind: "waypoint-event", count: probe.count });
      }
    }
  }

  return {
    from,
    to,
    sourceFile,
    targetFile,
    idInFrontmatter,
    hits,
    extraHits,
    conflicts,
  };
}

export async function applyRenamePlan(sagaPath: string, plan: RenamePlan): Promise<void> {
  if (plan.conflicts.length > 0) {
    throw new Error("refusing to apply: " + plan.conflicts.join("; "));
  }

  // Build a set of all files that need any kind of rewrite so we read each
  // exactly once and write once.
  const files = new Set<string>();
  for (const h of plan.hits) files.add(h.relPath);
  for (const h of plan.extraHits) files.add(h.relPath);
  if (plan.sourceFile) files.add(plan.sourceFile);

  for (const rel of files) {
    const abs = path.join(sagaPath, rel);
    let text = await fs.readFile(abs, "utf8");
    const before = text;

    // 1) @echo rewrites apply everywhere.
    text = rewriteText(text, plan.from, plan.to);

    // 2) Sigil bare-id rewrites in inherits/tags/speaks/spoken_here.
    if (plan.from.type === "sigil") {
      text = rewriteSigilIdInFrontmatter(text, plan.from.id, plan.to.id).text;
    }

    // 3) Waypoint event-field rewrites in thread YAML.
    if (plan.from.type === "waypoint" && /\.ya?ml$/i.test(rel)) {
      text = rewriteWaypointEventField(text, plan.from.id, plan.to.id).text;
    }

    // 4) Source entry's frontmatter id: if id changed.
    if (
      plan.sourceFile === rel &&
      plan.from.id !== plan.to.id &&
      plan.idInFrontmatter
    ) {
      text = rewriteFrontmatterId(text, plan.from.id, plan.to.id).text;
    }

    if (text !== before) await fs.writeFile(abs, text, "utf8");
  }

  // 5) Rename the source file if a targetFile was chosen.
  if (plan.sourceFile && plan.targetFile && plan.sourceFile !== plan.targetFile) {
    const absFrom = path.join(sagaPath, plan.sourceFile);
    const absTo = path.join(sagaPath, plan.targetFile);
    await fs.mkdir(path.dirname(absTo), { recursive: true });
    await fs.rename(absFrom, absTo);
  }
}

export async function renameCmd(
  saga: string,
  fromSpec: string,
  toSpec: string,
  opts: RenameOpts,
): Promise<void> {
  let plan: RenamePlan;
  try {
    plan = await buildRenamePlan(saga, fromSpec, toSpec);
  } catch (e) {
    console.error(pc.red((e as Error).message));
    process.exit(1);
    return;
  }

  if (opts.json) {
    console.log(JSON.stringify(plan, null, 2));
  } else {
    const arrow = pc.dim("→");
    console.log(
      pc.bold(`rename: ${plan.from.type}/${plan.from.id} ${arrow} ${plan.to.type}/${plan.to.id}`),
    );
    if (plan.sourceFile) {
      console.log(`  source file: ${plan.sourceFile}`);
      if (plan.targetFile && plan.targetFile !== plan.sourceFile) {
        console.log(`  rename to:   ${plan.targetFile}`);
      }
      if (plan.from.id !== plan.to.id && plan.idInFrontmatter) {
        console.log(`  frontmatter id: ${plan.from.id} ${arrow} ${plan.to.id}`);
      }
    } else {
      console.log(pc.yellow("  (no source entry found — only rewriting echoes)"));
    }

    const totalHits = plan.hits.reduce((n, h) => n + h.count, 0);
    console.log(
      `  echoes: ${totalHits} occurrence${totalHits === 1 ? "" : "s"} across ${plan.hits.length} file${plan.hits.length === 1 ? "" : "s"}`,
    );
    for (const h of plan.hits) {
      console.log(`    ${pc.cyan(h.relPath)} (${h.count})`);
    }

    if (plan.extraHits.length > 0) {
      const totalExtra = plan.extraHits.reduce((n, h) => n + h.count, 0);
      const kindLabel =
        plan.from.type === "sigil"
          ? "sigil-id refs (inherits/tags/speaks/spoken_here)"
          : "waypoint event-field refs";
      console.log(
        `  ${kindLabel}: ${totalExtra} across ${plan.extraHits.length} file${plan.extraHits.length === 1 ? "" : "s"}`,
      );
      for (const h of plan.extraHits) {
        console.log(`    ${pc.cyan(h.relPath)} (${h.count}, ${h.kind})`);
      }
    }

    if (plan.conflicts.length > 0) {
      console.log(pc.red("  conflicts:"));
      for (const c of plan.conflicts) console.log(`    - ${c}`);
    }
  }

  if (!opts.apply) {
    if (!opts.json) console.log(pc.dim("\n(dry run — pass --apply to write changes)"));
    if (plan.conflicts.length > 0) process.exit(1);
    return;
  }
  if (plan.conflicts.length > 0) {
    console.error(pc.red("aborting due to conflicts"));
    process.exit(1);
    return;
  }
  await applyRenamePlan(saga, plan);
  if (!opts.json) console.log(pc.green("applied."));
}
