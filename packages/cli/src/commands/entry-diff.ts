import path from "node:path";
import pc from "picocolors";
import { loadSaga } from "@loreweave/core";
import { gitDiff } from "./git.js";

export interface EntryDiffOpts {
  staged?: boolean;
  json?: boolean;
}

/**
 * Diff a single entry's file against HEAD (or against the index with --staged).
 * Convenience wrapper around `lw git diff --file=<path>` that accepts a Loreweave
 * ref like `character/aaron` or `term/old-mountain-saying`.
 */
export async function entryDiffCmd(
  saga: string,
  ref: string,
  opts: EntryDiffOpts,
): Promise<void> {
  const sagaAbs = path.resolve(saga);
  const [type, id] = ref.split("/");
  if (!type || !id) {
    console.error(pc.red(`bad ref: ${ref} (expected type/id, e.g. character/aaron)`));
    process.exit(1);
  }
  const loaded = await loadSaga(sagaAbs);
  const entry = loaded.entries.find(
    (e) => e.frontmatter.type === type && e.frontmatter.id === id,
  );
  if (!entry) {
    console.error(pc.red(`no such entry: ${ref}`));
    process.exit(2);
  }
  const diff = await gitDiff(sagaAbs, entry.path, !!opts.staged);
  if (opts.json) {
    console.log(
      JSON.stringify({ ref, ...diff, file: entry.relPath }, null, 2),
    );
    return;
  }
  if (!diff.patch.trim()) {
    console.log(pc.dim(`no changes (${entry.relPath})`));
    return;
  }
  console.log(diff.patch);
}
