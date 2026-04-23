import { promises as fs } from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { extractZip, detectBundleRoot, buildPlan } from "./import.js";
import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";

export interface RestoreOpts {
  saga?: string;
  apply?: boolean;
  json?: boolean;
  noPreBackup?: boolean;
}

export interface RestoreSummary {
  zip: string;
  targetSaga: string;
  preBackup: string | null;
  newFiles: number;
  overwritten: number;
  unchanged: number;
  removed: number;
}

/**
 * Restore a Saga from a backup zip. Dry-run by default; pass --apply to write.
 *
 * Steps when applied:
 * 1. Take a safety pre-restore backup of the current target into
 *    `<saga>/.loreweave/backups/` (unless --no-pre-backup).
 * 2. Extract the zip into a temp dir, detect the bundle root.
 * 3. Compute the file plan (new / conflicts / unchanged) using the
 *    same logic as `lw import`.
 * 4. Overwrite all incoming files; remove files not present in the
 *    snapshot (so restore is a true point-in-time replacement).
 *
 * `.git/` and `.loreweave/backups/` are preserved untouched.
 */
export async function restoreCmd(zip: string, opts: RestoreOpts): Promise<void> {
  const zipAbs = path.resolve(zip);
  const stat = await fs.stat(zipAbs).catch(() => null);
  if (!stat?.isFile()) {
    console.error(pc.red(`not a file: ${zipAbs}`));
    process.exit(1);
  }
  const stagingDir = await extractZip(zipAbs);
  try {
    const bundleRoot = await detectBundleRoot(stagingDir);
    const targetSaga = opts.saga
      ? path.resolve(opts.saga)
      : path.resolve("sagas", bundleRoot === "." ? path.basename(zipAbs, ".zip") : bundleRoot);

    const into = path.dirname(targetSaga);
    const plan = await buildPlan(stagingDir, into);
    if (path.resolve(plan.targetSaga) !== targetSaga) {
      // Force the requested target by recomputing relative to opts.saga.
      // buildPlan derives target from bundleRoot; if user passed --saga we honor it.
      plan.targetSaga = targetSaga;
    }

    const sourceRoot = path.join(stagingDir, bundleRoot);
    const removed = await listRemovals(targetSaga, sourceRoot);

    const summary: RestoreSummary = {
      zip: zipAbs,
      targetSaga,
      preBackup: null,
      newFiles: plan.newFiles.length,
      overwritten: plan.conflicts.length,
      unchanged: plan.unchanged.length,
      removed: removed.length,
    };

    if (!opts.apply) {
      if (opts.json) {
        console.log(JSON.stringify({ ...summary, removedFiles: removed }, null, 2));
        return;
      }
      console.log(pc.bold("restore plan (dry-run)"));
      console.log(`  zip       : ${zipAbs}`);
      console.log(`  target    : ${targetSaga}`);
      console.log(pc.green(`  new       : ${summary.newFiles}`));
      console.log(pc.yellow(`  overwrite : ${summary.overwritten}`));
      console.log(pc.dim(`  unchanged : ${summary.unchanged}`));
      console.log(pc.red(`  remove    : ${summary.removed}`));
      if (removed.length) {
        console.log(pc.underline("\nfiles to remove"));
        for (const f of removed.slice(0, 50)) console.log("  " + pc.red("-") + " " + f);
        if (removed.length > 50) console.log(pc.dim(`  …and ${removed.length - 50} more`));
      }
      console.log(pc.dim(`\npass --apply to perform the restore`));
      return;
    }

    // Apply.
    const targetExists = await fs.stat(targetSaga).catch(() => null);
    if (targetExists?.isDirectory() && !opts.noPreBackup) {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const dir = path.join(targetSaga, ".loreweave", "backups");
      await fs.mkdir(dir, { recursive: true });
      const preFile = path.join(dir, `${path.basename(targetSaga)}-${stamp}-pre-restore.zip`);
      const archiver = (await import("archiver")).default;
      await new Promise<void>((res, rej) => {
        const out = createWriteStream(preFile);
        const archive = archiver("zip", { zlib: { level: 9 } });
        out.on("close", () => res());
        archive.on("error", rej);
        archive.pipe(out);
        archive.glob(
          "**/*",
          {
            cwd: targetSaga,
            dot: true,
            ignore: [".git", ".git/**", ".loreweave/backups", ".loreweave/backups/**", "node_modules", "node_modules/**"],
          },
          { prefix: path.basename(targetSaga) },
        );
        void archive.finalize();
      });
      summary.preBackup = preFile;
    }

    // Overwrite/create all incoming files.
    for (const rel of [...plan.newFiles, ...plan.conflicts.map((c) => c.relPath)]) {
      const src = path.join(sourceRoot, rel);
      const dst = path.join(targetSaga, rel);
      await fs.mkdir(path.dirname(dst), { recursive: true });
      await pipeline(createReadStream(src), createWriteStream(dst));
    }
    // Remove files not present in the snapshot.
    for (const rel of removed) {
      const dst = path.join(targetSaga, rel);
      await fs.rm(dst, { force: true });
    }
    // Best-effort prune of empty directories.
    await pruneEmptyDirs(targetSaga);

    if (opts.json) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      console.log(pc.green("restored:"), targetSaga);
      console.log(
        pc.dim(
          `  +${summary.newFiles} new · ~${summary.overwritten} overwritten · -${summary.removed} removed${
            summary.preBackup ? `\n  pre-restore safety backup: ${summary.preBackup}` : ""
          }`,
        ),
      );
    }
  } finally {
    await fs.rm(stagingDir, { recursive: true, force: true });
  }
}

/**
 * Files currently in target that the snapshot does NOT contain (so they
 * would be removed by a full restore). `.git/` and `.loreweave/backups/`
 * are preserved.
 */
async function listRemovals(target: string, sourceRoot: string): Promise<string[]> {
  const targetFiles = await walk(target, [".git", path.join(".loreweave", "backups"), "node_modules"]);
  const sourceFiles = new Set(await walk(sourceRoot, []));
  return targetFiles.filter((f) => !sourceFiles.has(f) && f !== ".loreweave-export.json");
}

async function walk(root: string, skip: string[]): Promise<string[]> {
  const out: string[] = [];
  const skipSet = new Set(skip.map((s) => s.split(path.sep).join("/")));
  const inner = async (dir: string, prefix: string): Promise<void> => {
    const ents = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const e of ents) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (skipSet.has(rel)) continue;
      let nestedSkip = false;
      for (const s of skipSet) {
        if (rel === s || rel.startsWith(s + "/")) {
          nestedSkip = true;
          break;
        }
      }
      if (nestedSkip) continue;
      if (e.isDirectory()) await inner(path.join(dir, e.name), rel);
      else out.push(rel);
    }
  };
  await inner(root, "");
  return out;
}

async function pruneEmptyDirs(root: string): Promise<void> {
  const inner = async (dir: string): Promise<boolean> => {
    const ents = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    let allEmpty = ents.length > 0;
    for (const e of ents) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        const empty = await inner(full);
        if (!empty) allEmpty = false;
      } else {
        allEmpty = false;
      }
    }
    if (allEmpty && dir !== root) {
      await fs.rmdir(dir).catch(() => {});
      return true;
    }
    return ents.length === 0;
  };
  await inner(root);
}
