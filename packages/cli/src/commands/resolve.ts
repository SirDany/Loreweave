import { buildEntryIndex, entryKey, loadSaga, resolve } from "@loreweave/core";
import type { EntryType } from "@loreweave/core";
import pc from "picocolors";

function parseRef(
  ref: string,
): { type: EntryType; id: string } {
  const clean = ref.replace(/^@/, "");
  const [type, id] = clean.split("/");
  if (!type || !id) {
    throw new Error(`invalid reference "${ref}" (expected type/id)`);
  }
  return { type: type as EntryType, id };
}

export async function resolveCmd(
  saga: string,
  ref: string,
  opts: { json?: boolean },
): Promise<void> {
  const { type, id } = parseRef(ref);
  const loaded = await loadSaga(saga);
  const idx = buildEntryIndex(loaded.entries);
  const entry = idx.get(entryKey(type, id));
  if (!entry) {
    console.error(`entry ${ref} not found`);
    process.exit(1);
    return;
  }
  const r = resolve(entry, idx);
  if (opts.json) {
    console.log(JSON.stringify(r, null, 2));
    return;
  }
  console.log(pc.bold(`${r.type}/${r.id}`) + (r.name ? `  — ${r.name}` : ""));
  if (r.inheritsChain.length) {
    console.log(pc.dim(`inherits: ${r.inheritsChain.join(" → ")}`));
  }
  console.log(pc.underline("properties"));
  const keys = Object.keys(r.properties).sort();
  if (keys.length === 0) {
    console.log(pc.dim("  (none)"));
  }
  for (const k of keys) {
    const provLabel =
      r.provenance[k] === "own"
        ? pc.green("own")
        : r.provenance[k] === "override"
          ? pc.red("override")
          : pc.cyan(r.provenance[k] ?? "?");
    console.log(`  ${pc.bold(k)} = ${JSON.stringify(r.properties[k])}  ${pc.dim("← " + provLabel)}`);
  }
}
