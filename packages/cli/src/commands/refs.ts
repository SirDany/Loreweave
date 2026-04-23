import {
  buildEntryIndex,
  entryKey,
  extractReferences,
  loadSaga,
  normalizeRef,
} from "@loreweave/core";
import type { EntryType } from "@loreweave/core";
import pc from "picocolors";

export async function refsCmd(
  saga: string,
  ref: string,
  opts: { inTome?: string; json?: boolean },
): Promise<void> {
  const target = normalizeRef(ref);
  const loaded = await loadSaga(saga);
  const idx = buildEntryIndex(loaded.entries);

  const [targetType, targetId] = target.split("/");
  if (!targetType || !targetId) {
    console.error(`invalid reference "${ref}"`);
    process.exit(1);
    return;
  }

  // outbound: scan target entry's body for @refs
  const entry = idx.get(entryKey(targetType as EntryType, targetId));
  const outbound = entry ? extractReferences(entry.body) : [];

  // inbound: scan all chapter bodies + all entry bodies for our target
  const needle = `${targetType}/${targetId}`;
  const inbound: Array<{ file: string; line: number }> = [];
  const sources: Array<{ body: string; file: string; tome?: string }> = [];
  for (const t of loaded.tomes)
    for (const c of t.chapters)
      sources.push({ body: c.body, file: c.relPath, tome: t.manifest.id });
  for (const e of loaded.entries)
    sources.push({ body: e.body, file: e.relPath });

  for (const src of sources) {
    if (opts.inTome && src.tome && src.tome !== opts.inTome) continue;
    for (const r of extractReferences(src.body)) {
      if (`${r.type}/${r.id}` === needle) {
        inbound.push({ file: src.file, line: r.line });
      }
    }
  }

  if (opts.json) {
    console.log(JSON.stringify({ inbound, outbound }, null, 2));
    return;
  }
  console.log(pc.bold(`${target}`));
  console.log(pc.underline(`inbound (${inbound.length})`));
  for (const i of inbound) console.log(`  ${pc.cyan(i.file + ":" + i.line)}`);
  console.log(pc.underline(`outbound (${outbound.length})`));
  for (const o of outbound) console.log(`  ${pc.cyan(o.raw)}`);
}
