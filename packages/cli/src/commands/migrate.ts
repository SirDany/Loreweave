import { promises as fs } from "node:fs";
import path from "node:path";
import pc from "picocolors";

export interface MigrateOpts {
  apply?: boolean;
  json?: boolean;
}

interface FolderRename {
  from: string;
  to: string;
}

const FOLDER_RENAMES: FolderRename[] = [
  { from: "wiki", to: "codex" },
  { from: "glossary", to: "lexicon" },
  { from: "tags", to: "sigils" },
  { from: "timelines", to: "threads" },
];

/**
 * Folder renames applied *inside* the canonical Codex after the top-level
 * renames above have run. Currently: `codex/events/` -> `codex/waypoints/`.
 */
const NESTED_FOLDER_RENAMES: FolderRename[] = [
  { from: "codex/events", to: "codex/waypoints" },
];

/** In-file substitutions applied to frontmatter + body of markdown/yaml files. */
const CONTENT_REWRITES: Array<{ find: RegExp; replace: string; label: string }> = [
  { find: /^type:\s*event\b/m, replace: "type: waypoint", label: "type: event -> waypoint" },
  { find: /^type:\s*tag\b/m, replace: "type: sigil", label: "type: tag -> sigil" },
  { find: /@event\//g, replace: "@waypoint/", label: "@event/ -> @waypoint/" },
  { find: /@tag\//g, replace: "@sigil/", label: "@tag/ -> @sigil/" },
];

interface PlanFolder {
  from: string;
  to: string;
  exists: boolean;
  conflict: boolean;
}

interface PlanFile {
  relPath: string;
  changes: string[];
}

interface MigratePlan {
  sagaRoot: string;
  folders: PlanFolder[];
  files: PlanFile[];
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  if (!(await exists(dir))) return out;
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (e.name === ".loreweave" || e.name === "node_modules") continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

export async function migrateCmd(
  sagaArg: string,
  opts: MigrateOpts,
): Promise<void> {
  const sagaRoot = path.resolve(sagaArg);
  if (!(await exists(path.join(sagaRoot, "saga.yaml")))) {
    console.error(`not a Saga directory (no saga.yaml): ${sagaRoot}`);
    process.exit(1);
  }

  const plan = await buildPlan(sagaRoot);

  if (opts.json) {
    console.log(JSON.stringify(plan, null, 2));
    if (!opts.apply) return;
  } else {
    printPlan(plan);
    if (!opts.apply) {
      console.log(pc.dim("\nrun again with --apply to perform the migration."));
      return;
    }
  }

  await applyPlan(plan);
  if (!opts.json) console.log(pc.green("\nmigration complete."));
}

export async function buildPlan(sagaRoot: string): Promise<MigratePlan> {
  const folders: PlanFolder[] = [];
  for (const r of FOLDER_RENAMES) {
    const from = path.join(sagaRoot, r.from);
    const to = path.join(sagaRoot, r.to);
    const fromExists = await exists(from);
    const toExists = await exists(to);
    folders.push({
      from: r.from,
      to: r.to,
      exists: fromExists,
      conflict: fromExists && toExists,
    });
  }

  // Nested renames are evaluated against the *post-top-level* layout: a
  // legacy `wiki/events/` folder will exist at `codex/events/` once the
  // outer renames apply, so report that as the source path.
  const reverseTopMap = new Map<string, string>();
  for (const r of FOLDER_RENAMES) reverseTopMap.set(r.to, r.from);
  for (const r of NESTED_FOLDER_RENAMES) {
    const [topSegment, ...rest] = r.from.split("/");
    const legacyTop = reverseTopMap.get(topSegment ?? "");
    const sourceCandidates = [
      path.join(sagaRoot, r.from),
      ...(legacyTop ? [path.join(sagaRoot, legacyTop, ...rest)] : []),
    ];
    let from: string | null = null;
    for (const c of sourceCandidates) {
      if (await exists(c)) {
        from = c;
        break;
      }
    }
    const to = path.join(sagaRoot, r.to);
    const fromExists = from !== null;
    const toExists = await exists(to);
    folders.push({
      from: r.from,
      to: r.to,
      exists: fromExists,
      conflict: fromExists && toExists && from !== to,
    });
  }

  const allFiles = await walk(sagaRoot);
  const rewritable = allFiles.filter((f) => /\.(md|markdown|ya?ml)$/i.test(f));
  const files: PlanFile[] = [];
  for (const f of rewritable) {
    const raw = await fs.readFile(f, "utf8");
    const changes: string[] = [];
    for (const r of CONTENT_REWRITES) {
      if (r.find.test(raw)) changes.push(r.label);
      // reset global regex lastIndex after .test
      r.find.lastIndex = 0;
    }
    if (changes.length) {
      files.push({
        relPath: path.relative(sagaRoot, f).split(path.sep).join("/"),
        changes,
      });
    }
  }

  return { sagaRoot, folders, files };
}

function printPlan(plan: MigratePlan): void {
  console.log(pc.bold("saga:"), plan.sagaRoot);
  console.log(pc.underline("\nfolder renames"));
  for (const f of plan.folders) {
    if (!f.exists) {
      console.log(pc.dim(`  ${f.from}/  (absent, skip)`));
      continue;
    }
    if (f.conflict) {
      console.log(
        pc.red(`  ${f.from}/ -> ${f.to}/  (CONFLICT: both exist; merge manually)`),
      );
      continue;
    }
    console.log(pc.green(`  ${f.from}/ -> ${f.to}/`));
  }
  console.log(pc.underline(`\nfile rewrites (${plan.files.length})`));
  for (const f of plan.files.slice(0, 50)) {
    console.log("  " + pc.cyan(f.relPath) + "  " + pc.dim(f.changes.join(", ")));
  }
  if (plan.files.length > 50) {
    console.log(pc.dim(`  … and ${plan.files.length - 50} more`));
  }
}

export async function applyPlan(plan: MigratePlan): Promise<void> {
  const topRenameSet = new Set(FOLDER_RENAMES.map((r) => r.from));
  // 1. top-level renames first (so nested rename sources reference canonical paths).
  for (const f of plan.folders) {
    if (!f.exists || f.conflict) continue;
    if (!topRenameSet.has(f.from)) continue;
    const from = path.join(plan.sagaRoot, f.from);
    const to = path.join(plan.sagaRoot, f.to);
    await fs.rename(from, to);
  }
  // 2. nested renames (e.g. codex/events -> codex/waypoints).
  for (const f of plan.folders) {
    if (!f.exists || f.conflict) continue;
    if (topRenameSet.has(f.from)) continue;
    const to = path.join(plan.sagaRoot, f.to);
    // After step 1, a nested source referenced as `codex/events` lives at
    // `<root>/codex/events` regardless of whether it started at `wiki/events`.
    const fromPostTop = path.join(plan.sagaRoot, f.from);
    if (!(await exists(fromPostTop)) || fromPostTop === to) continue;
    await fs.rename(fromPostTop, to);
  }

  // 3. rewrite files. Re-walk because paths may have changed.
  const allFiles = await walk(plan.sagaRoot);
  const rewritable = allFiles.filter((f) => /\.(md|markdown|ya?ml)$/i.test(f));
  for (const f of rewritable) {
    const raw = await fs.readFile(f, "utf8");
    let next = raw;
    for (const r of CONTENT_REWRITES) next = next.replace(r.find, r.replace);
    if (next !== raw) await fs.writeFile(f, next, "utf8");
  }
}
