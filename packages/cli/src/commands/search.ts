import path from "node:path";
import { promises as fs } from "node:fs";
import pc from "picocolors";
import { loadSaga } from "@loreweave/core";

export interface SearchOpts {
  type?: string;
  scope?: string; // entries | prose | echoes | all
  case?: boolean;
  limit?: number;
  json?: boolean;
}

export interface SearchHit {
  kind: "entry" | "prose" | "echo";
  file: string;
  line: number;
  column: number;
  match: string;
  /** Entry ref (type/id) for entry hits, or chapter key (tome/chapter) for prose. */
  ref: string;
  preview: string;
}

/**
 * Plain text + Echo search across a Saga.
 *
 * Scopes:
 * - entries  → frontmatter + body of every Codex/Lexicon/Sigil entry
 * - prose    → chapter/scene markdown under tomes
 * - echoes   → match interpreted as an Echo target ("type/id" or "id");
 *              finds every @type/id occurrence in entries + prose
 * - all      → entries + prose (default)
 */
export async function searchCmd(
  saga: string,
  query: string,
  opts: SearchOpts,
): Promise<void> {
  const sagaAbs = path.resolve(saga);
  const limit = typeof opts.limit === "number" && opts.limit > 0 ? opts.limit : 200;
  const scope = (opts.scope ?? "all").toLowerCase();
  if (!["entries", "prose", "echoes", "all"].includes(scope)) {
    console.error(pc.red(`--scope must be one of: entries, prose, echoes, all`));
    process.exit(1);
  }

  const hits: SearchHit[] = [];
  if (scope === "echoes") {
    await searchEchoes(sagaAbs, query, opts.type, hits, limit);
  } else {
    const flags = opts.case ? "g" : "gi";
    const re = buildSafeRegex(query, flags);
    if (scope === "entries" || scope === "all") {
      await searchEntries(sagaAbs, re, opts.type, hits, limit);
    }
    if (scope === "prose" || scope === "all") {
      await searchProse(sagaAbs, re, hits, limit);
    }
  }

  if (opts.json) {
    console.log(JSON.stringify({ query, scope, hits }, null, 2));
    return;
  }
  if (hits.length === 0) {
    console.log(pc.dim("no matches"));
    return;
  }
  for (const h of hits) {
    const loc = `${h.file}:${h.line}:${h.column}`;
    console.log(
      `${pc.dim(h.kind)} ${pc.cyan(h.ref)} ${pc.dim(loc)}\n  ${h.preview}`,
    );
  }
  console.log(pc.dim(`\n${hits.length} match(es)`));
}

function buildSafeRegex(query: string, flags: string): RegExp {
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped, flags);
}

async function searchEntries(
  sagaAbs: string,
  re: RegExp,
  typeFilter: string | undefined,
  hits: SearchHit[],
  limit: number,
): Promise<void> {
  const saga = await loadSaga(sagaAbs);
  for (const entry of saga.entries) {
    if (typeFilter && entry.frontmatter.type !== typeFilter) continue;
    if (hits.length >= limit) return;
    const file = entry.relPath;
    const text = await fs.readFile(entry.path, "utf-8");
    appendLineMatches(
      file,
      `${entry.frontmatter.type}/${entry.frontmatter.id}`,
      text,
      re,
      "entry",
      hits,
      limit,
    );
  }
}

async function searchProse(
  sagaAbs: string,
  re: RegExp,
  hits: SearchHit[],
  limit: number,
): Promise<void> {
  const tomesDir = path.join(sagaAbs, "tomes");
  const tomes = await safeReaddir(tomesDir);
  for (const tome of tomes) {
    if (!(await isDir(path.join(tomesDir, tome)))) continue;
    const storyDir = path.join(tomesDir, tome, "story");
    await walkProse(storyDir, sagaAbs, tome, re, hits, limit);
    if (hits.length >= limit) return;
  }
}

async function walkProse(
  dir: string,
  sagaAbs: string,
  tome: string,
  re: RegExp,
  hits: SearchHit[],
  limit: number,
): Promise<void> {
  const entries = await safeReaddir(dir);
  for (const name of entries) {
    if (hits.length >= limit) return;
    const full = path.join(dir, name);
    const stat = await fs.stat(full).catch(() => null);
    if (!stat) continue;
    if (stat.isDirectory()) {
      await walkProse(full, sagaAbs, tome, re, hits, limit);
    } else if (name.endsWith(".md")) {
      const text = await fs.readFile(full, "utf-8");
      const rel = path.relative(sagaAbs, full);
      const chapter = path.basename(path.dirname(full));
      const ref = `${tome}/${chapter}`;
      appendLineMatches(rel, ref, text, re, "prose", hits, limit);
    }
  }
}

async function searchEchoes(
  sagaAbs: string,
  query: string,
  typeFilter: string | undefined,
  hits: SearchHit[],
  limit: number,
): Promise<void> {
  let target = query.trim().replace(/^@/, "");
  let typePart: string | null = null;
  let idPart: string;
  if (target.includes("/")) {
    const [t, ...rest] = target.split("/");
    typePart = t!;
    idPart = rest.join("/");
  } else {
    idPart = target;
  }
  if (typeFilter) typePart = typeFilter;
  const escId = idPart.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escType = typePart ? typePart.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : "[a-z]+";
  const re = new RegExp(`@(${escType})/(${escId})\\b`, "g");
  const saga = await loadSaga(sagaAbs);
  // Entries
  for (const entry of saga.entries) {
    if (hits.length >= limit) return;
    if (typeFilter && entry.frontmatter.type !== typeFilter) continue;
    const text = await fs.readFile(entry.path, "utf-8");
    appendLineMatches(
      entry.relPath,
      `${entry.frontmatter.type}/${entry.frontmatter.id}`,
      text,
      re,
      "echo",
      hits,
      limit,
    );
  }
  // Prose
  await searchProse(sagaAbs, re, hits, limit);
}

function appendLineMatches(
  file: string,
  ref: string,
  text: string,
  re: RegExp,
  kind: SearchHit["kind"],
  hits: SearchHit[],
  limit: number,
): void {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (hits.length >= limit) return;
    const line = lines[i]!;
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line))) {
      hits.push({
        kind,
        file,
        line: i + 1,
        column: m.index + 1,
        match: m[0],
        ref,
        preview: line.slice(Math.max(0, m.index - 20), m.index + 80).trim(),
      });
      if (hits.length >= limit) return;
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }
}

async function safeReaddir(dir: string): Promise<string[]> {
  return fs.readdir(dir).catch(() => [] as string[]);
}

async function isDir(p: string): Promise<boolean> {
  const s = await fs.stat(p).catch(() => null);
  return !!s?.isDirectory();
}
