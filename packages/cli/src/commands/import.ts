import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, promises as fs } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { pipeline } from "node:stream/promises";
import yauzl from "yauzl";
import pc from "picocolors";

export interface ImportOpts {
  into?: string;
  plan?: boolean;
  resolve?: string;
  json?: boolean;
}

export interface FileConflict {
  relPath: string;
  /** sha256 of existing content, or null if new. */
  existing: string | null;
  /** sha256 of incoming content. */
  incoming: string;
}

export interface ImportPlan {
  bundleRoot: string;
  targetSaga: string;
  newFiles: string[];
  conflicts: FileConflict[];
  unchanged: string[];
}

/**
 * Import a Loreweave saga zip. With --plan, prints a plan describing
 * new/conflict/unchanged files. Without --plan, applies the plan using
 * the strategy selected by --resolve (overwrite|keep|prompt).
 *
 * prompt mode is interactive and only available in human output mode.
 */
export async function importCmd(
  zipPath: string,
  opts: ImportOpts,
): Promise<void> {
  const stagingDir = await extractZip(zipPath);
  try {
    const plan = await buildPlan(stagingDir, opts.into ?? "sagas");
    if (opts.plan) {
      if (opts.json) {
        console.log(JSON.stringify(plan, null, 2));
        return;
      }
      printPlan(plan);
      return;
    }

    const strategy = opts.resolve ?? "prompt";
    if (!["overwrite", "keep", "prompt"].includes(strategy)) {
      console.error(`--resolve must be one of: overwrite, keep, prompt`);
      process.exit(1);
    }
    await applyPlan(stagingDir, plan, strategy as "overwrite" | "keep" | "prompt", opts.json ?? false);
  } finally {
    await fs.rm(stagingDir, { recursive: true, force: true });
  }
}

export function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

export async function extractZip(zipPath: string): Promise<string> {
  const tmp = await fs.mkdtemp(path.join(process.cwd(), ".lw-import-"));
  await new Promise<void>((resolvePromise, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) return reject(err ?? new Error("cannot open zip"));
      zipfile.readEntry();
      zipfile.on("entry", (entry) => {
        const target = path.join(tmp, entry.fileName);
        if (!target.startsWith(tmp)) {
          return reject(new Error(`zip path escape: ${entry.fileName}`));
        }
        if (/\/$/.test(entry.fileName)) {
          fs.mkdir(target, { recursive: true })
            .then(() => zipfile.readEntry())
            .catch(reject);
          return;
        }
        fs.mkdir(path.dirname(target), { recursive: true })
          .then(
            () =>
              new Promise<void>((res, rej) => {
                zipfile.openReadStream(entry, (e, readStream) => {
                  if (e || !readStream) return rej(e ?? new Error("no stream"));
                  const ws = createWriteStream(target);
                  readStream.pipe(ws);
                  ws.on("close", () => res());
                  ws.on("error", rej);
                });
              }),
          )
          .then(() => zipfile.readEntry())
          .catch(reject);
      });
      zipfile.on("end", () => resolvePromise());
      zipfile.on("error", reject);
    });
  });
  return tmp;
}

/**
 * Determine the bundle's root: the zip contains a single top-level folder
 * that is the saga slug. Target saga path = `<into>/<bundleRoot>`.
 */
export async function detectBundleRoot(stagingDir: string): Promise<string> {
  const entries = await fs.readdir(stagingDir, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory());
  if (dirs.length === 1) return dirs[0]!.name;
  // Look for saga.yaml at top
  for (const e of entries) {
    if (e.isFile() && e.name === "saga.yaml") return ".";
  }
  throw new Error(
    `cannot determine bundle root in ${stagingDir} (expected a single top-level folder or saga.yaml at top)`,
  );
}

export async function buildPlan(
  stagingDir: string,
  into: string,
): Promise<ImportPlan> {
  const bundleRoot = await detectBundleRoot(stagingDir);
  const sourceRoot = path.join(stagingDir, bundleRoot);
  const targetSaga = path.resolve(into, bundleRoot === "." ? path.basename(into) : bundleRoot);

  const walk = async (dir: string, prefix = ""): Promise<string[]> => {
    const ents = await fs.readdir(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const e of ents) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      // Skip the export marker; it's metadata, not content.
      if (rel === ".loreweave-export.json") continue;
      if (e.isDirectory()) files.push(...(await walk(path.join(dir, e.name), rel)));
      else files.push(rel);
    }
    return files;
  };
  const files = await walk(sourceRoot);

  const newFiles: string[] = [];
  const conflicts: FileConflict[] = [];
  const unchanged: string[] = [];
  for (const rel of files) {
    const srcBuf = await fs.readFile(path.join(sourceRoot, rel));
    const dst = path.join(targetSaga, rel);
    let existingBuf: Buffer | null = null;
    try {
      existingBuf = await fs.readFile(dst);
    } catch {
      existingBuf = null;
    }
    const incoming = sha256(srcBuf);
    if (!existingBuf) newFiles.push(rel);
    else if (sha256(existingBuf) === incoming) unchanged.push(rel);
    else
      conflicts.push({
        relPath: rel,
        existing: sha256(existingBuf),
        incoming,
      });
  }

  return { bundleRoot, targetSaga, newFiles, conflicts, unchanged };
}

function printPlan(plan: ImportPlan) {
  console.log(pc.bold("target:"), plan.targetSaga);
  console.log(pc.green(`  new      : ${plan.newFiles.length}`));
  console.log(pc.yellow(`  conflict : ${plan.conflicts.length}`));
  console.log(pc.dim(`  unchanged: ${plan.unchanged.length}`));
  if (plan.newFiles.length) {
    console.log(pc.underline("\nnew files"));
    for (const f of plan.newFiles) console.log("  " + pc.green("+") + " " + f);
  }
  if (plan.conflicts.length) {
    console.log(pc.underline("\nconflicts"));
    for (const c of plan.conflicts) console.log("  " + pc.yellow("~") + " " + c.relPath);
  }
}

async function applyPlan(
  stagingDir: string,
  plan: ImportPlan,
  strategy: "overwrite" | "keep" | "prompt",
  jsonOut: boolean,
): Promise<void> {
  const bundleRoot = path.join(stagingDir, plan.bundleRoot);
  const actions: Array<{ relPath: string; action: "created" | "overwritten" | "kept" }> = [];

  // All new files are always applied.
  for (const rel of plan.newFiles) {
    const src = path.join(bundleRoot, rel);
    const dst = path.join(plan.targetSaga, rel);
    await fs.mkdir(path.dirname(dst), { recursive: true });
    await copyFileStream(src, dst);
    actions.push({ relPath: rel, action: "created" });
  }

  let applyAll: "overwrite" | "keep" | null =
    strategy === "overwrite" ? "overwrite" : strategy === "keep" ? "keep" : null;

  for (const c of plan.conflicts) {
    let choice: "overwrite" | "keep";
    if (applyAll) {
      choice = applyAll;
    } else {
      choice = await promptConflict(c.relPath);
      if (choice === "overwrite" || choice === "keep") {
        // ask once whether to apply to all remaining
        if (await promptApplyAll()) applyAll = choice;
      }
    }
    if (choice === "overwrite") {
      const src = path.join(bundleRoot, c.relPath);
      const dst = path.join(plan.targetSaga, c.relPath);
      await fs.mkdir(path.dirname(dst), { recursive: true });
      await copyFileStream(src, dst);
      actions.push({ relPath: c.relPath, action: "overwritten" });
    } else {
      actions.push({ relPath: c.relPath, action: "kept" });
    }
  }

  if (jsonOut) {
    console.log(JSON.stringify({ plan, actions }, null, 2));
  } else {
    const created = actions.filter((a) => a.action === "created").length;
    const overwritten = actions.filter((a) => a.action === "overwritten").length;
    const kept = actions.filter((a) => a.action === "kept").length;
    console.log(
      pc.green(`imported: ${created} created, ${overwritten} overwritten, ${kept} kept`),
    );
  }
}

async function copyFileStream(src: string, dst: string): Promise<void> {
  await pipeline(createReadStream(src), createWriteStream(dst));
}

function promptConflict(relPath: string): Promise<"overwrite" | "keep"> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(
      `conflict: ${relPath}\n  [o]verwrite, [k]eep existing (default) > `,
      (answer: string) => {
        rl.close();
        resolve(answer.trim().toLowerCase().startsWith("o") ? "overwrite" : "keep");
      },
    );
  });
}

function promptApplyAll(): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(`  apply this choice to all remaining conflicts? [y/N] `, (a: string) => {
      rl.close();
      resolve(a.trim().toLowerCase() === "y");
    });
  });
}
