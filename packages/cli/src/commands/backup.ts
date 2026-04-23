import archiver from "archiver";
import { createWriteStream, promises as fs } from "node:fs";
import path from "node:path";
import pc from "picocolors";

export interface BackupOpts {
  label?: string;
  out?: string;
  json?: boolean;
  keep?: number;
}

interface BackupResult {
  path: string;
  bytes: number;
  pruned: string[];
}

/**
 * Snapshot a Saga as a timestamped zip into `<saga>/.loreweave/backups/`.
 * Optional --keep <n> prunes older snapshots so the folder doesn't grow
 * forever. The zip excludes `.git/`, `.loreweave/backups/`, and
 * `node_modules/` so backups stay self-referential and small.
 */
export async function backupCmd(saga: string, opts: BackupOpts): Promise<void> {
  const sagaAbs = path.resolve(saga);
  const stat = await fs.stat(sagaAbs).catch(() => null);
  if (!stat?.isDirectory()) {
    console.error(pc.red(`not a directory: ${sagaAbs}`));
    process.exit(1);
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const labelBit = opts.label ? "-" + opts.label.replace(/[^a-zA-Z0-9._-]/g, "-") : "";
  const fileName = `${path.basename(sagaAbs)}-${stamp}${labelBit}.zip`;
  const backupsDir =
    opts.out ?? path.join(sagaAbs, ".loreweave", "backups");
  await fs.mkdir(backupsDir, { recursive: true });
  const outFile = path.join(backupsDir, fileName);

  const bytes = await zipSagaExcluding(sagaAbs, outFile, [
    ".git",
    "node_modules",
    path.join(".loreweave", "backups"),
  ]);

  let pruned: string[] = [];
  if (typeof opts.keep === "number" && opts.keep > 0) {
    pruned = await pruneOlder(backupsDir, opts.keep);
  }

  const result: BackupResult = { path: outFile, bytes, pruned };
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(pc.green("backup →"), outFile, pc.dim(`(${(bytes / 1024).toFixed(1)} KB)`));
  if (pruned.length) {
    console.log(pc.dim(`pruned ${pruned.length} older snapshot(s)`));
  }
}

async function zipSagaExcluding(
  sagaAbs: string,
  outFile: string,
  excludeRel: string[],
): Promise<number> {
  return new Promise<number>((resolvePromise, reject) => {
    const output = createWriteStream(outFile);
    const archive = archiver("zip", { zlib: { level: 9 } });
    let bytes = 0;
    output.on("close", () => resolvePromise(bytes));
    output.on("error", reject);
    archive.on("error", reject);
    archive.on("end", () => {
      bytes = archive.pointer();
    });
    archive.pipe(output);
    const rootName = path.basename(sagaAbs);
    archive.glob("**/*", {
      cwd: sagaAbs,
      dot: true,
      ignore: excludeRel.flatMap((p) => [p, `${p}/**`]),
    }, { prefix: rootName });
    archive.append(
      JSON.stringify(
        {
          loreweave: {
            kind: "saga-backup",
            version: 1,
            root: rootName,
            created: new Date().toISOString(),
          },
        },
        null,
        2,
      ),
      { name: ".loreweave-export.json" },
    );
    void archive.finalize();
  });
}

async function pruneOlder(dir: string, keep: number): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const zips = entries
    .filter((e) => e.isFile() && e.name.endsWith(".zip"))
    .map((e) => path.join(dir, e.name));
  if (zips.length <= keep) return [];
  const stats = await Promise.all(
    zips.map(async (p) => ({ p, mtime: (await fs.stat(p)).mtimeMs })),
  );
  stats.sort((a, b) => b.mtime - a.mtime);
  const toRemove = stats.slice(keep).map((s) => s.p);
  for (const p of toRemove) await fs.rm(p, { force: true });
  return toRemove;
}
