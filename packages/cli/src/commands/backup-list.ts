import { promises as fs } from "node:fs";
import path from "node:path";
import pc from "picocolors";

export interface BackupListOpts {
  dir?: string;
  json?: boolean;
}

export interface BackupSnapshot {
  file: string;
  path: string;
  bytes: number;
  modified: string;
  label: string | null;
}

/**
 * List `.loreweave/backups/*.zip` snapshots for a Saga, newest first.
 */
export async function backupListCmd(
  saga: string,
  opts: BackupListOpts,
): Promise<void> {
  const sagaAbs = path.resolve(saga);
  const dir = opts.dir ?? path.join(sagaAbs, ".loreweave", "backups");
  const snapshots = await listSnapshots(sagaAbs, dir);
  if (opts.json) {
    console.log(JSON.stringify({ dir, snapshots }, null, 2));
    return;
  }
  if (snapshots.length === 0) {
    console.log(pc.dim(`no snapshots in ${dir}`));
    return;
  }
  for (const s of snapshots) {
    const kb = (s.bytes / 1024).toFixed(1);
    console.log(
      `${pc.cyan(s.file)} ${pc.dim(`${kb} KB · ${s.modified}`)}${
        s.label ? pc.yellow(` [${s.label}]`) : ""
      }`,
    );
  }
  console.log(pc.dim(`\n${snapshots.length} snapshot(s)`));
}

export async function listSnapshots(
  sagaAbs: string,
  dir: string,
): Promise<BackupSnapshot[]> {
  const entries = await fs.readdir(dir).catch(() => [] as string[]);
  const base = path.basename(sagaAbs) + "-";
  const out: BackupSnapshot[] = [];
  for (const name of entries) {
    if (!name.endsWith(".zip")) continue;
    const full = path.join(dir, name);
    const st = await fs.stat(full).catch(() => null);
    if (!st?.isFile()) continue;
    let label: string | null = null;
    if (name.startsWith(base)) {
      const rest = name.slice(base.length, -".zip".length);
      // stamp pattern: 2026-04-23T17-08-53-973Z, optionally followed by -label
      const m = rest.match(
        /^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)(?:-(.*))?$/,
      );
      if (m && m[2]) label = m[2];
    }
    out.push({
      file: name,
      path: full,
      bytes: st.size,
      modified: st.mtime.toISOString(),
      label,
    });
  }
  out.sort((a, b) => (a.modified < b.modified ? 1 : -1));
  return out;
}
