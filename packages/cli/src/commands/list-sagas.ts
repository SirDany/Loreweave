import { promises as fs } from "node:fs";
import path from "node:path";
import pc from "picocolors";

export interface ListSagasOpts {
  json?: boolean;
}

interface FoundSaga {
  path: string;
  id: string;
  title: string | null;
}

function extractField(yaml: string, key: string): string | null {
  const re = new RegExp(`^${key}\\s*:\\s*(?:"([^"]*)"|'([^']*)'|(\\S.*?))\\s*$`, "m");
  const m = yaml.match(re);
  if (!m) return null;
  return (m[1] ?? m[2] ?? m[3] ?? "").trim() || null;
}

async function readSagaMeta(dir: string): Promise<FoundSaga | null> {
  const yamlPath = path.join(dir, "saga.yaml");
  let title: string | null = null;
  let id: string = path.basename(dir);
  try {
    const txt = await fs.readFile(yamlPath, "utf8");
    title = extractField(txt, "title");
    const explicitId = extractField(txt, "id");
    if (explicitId) id = explicitId;
    return { path: dir, id, title };
  } catch {
    // No saga.yaml: accept directory only if it looks like a saga.
    const [codex, tomes] = await Promise.all([
      fs.stat(path.join(dir, "codex")).catch(() => null),
      fs.stat(path.join(dir, "tomes")).catch(() => null),
    ]);
    if (!codex && !tomes) return null;
    return { path: dir, id, title: null };
  }
}

export async function listSagasCmd(
  root: string,
  opts: ListSagasOpts,
): Promise<void> {
  const abs = path.resolve(root);
  let entries: import("node:fs").Dirent[] = [];
  try {
    entries = await fs.readdir(abs, { withFileTypes: true });
  } catch (e) {
    console.error(pc.red(`cannot read ${abs}: ${(e as Error).message}`));
    process.exit(1);
  }
  const found: FoundSaga[] = [];
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith(".")) continue;
    const meta = await readSagaMeta(path.join(abs, e.name));
    if (meta) found.push(meta);
  }
  if (opts.json) {
    console.log(JSON.stringify(found, null, 2));
    return;
  }
  if (found.length === 0) {
    console.log(pc.dim("no Sagas found"));
    return;
  }
  for (const s of found) {
    const title = s.title ? pc.dim(` — ${s.title}`) : "";
    console.log(`${pc.cyan(s.id)}${title}\n  ${pc.dim(s.path)}`);
  }
}
