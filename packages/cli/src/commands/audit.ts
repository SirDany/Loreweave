import { hasErrors, loadSaga, validateSaga, scanLooseEnds } from "@loreweave/core";
import { printDiagnostic, printSummary } from "../print.js";

export async function auditCmd(
  saga: string,
  opts: { tome?: string; json?: boolean },
): Promise<void> {
  const loaded = await loadSaga(saga);
  const diags = validateSaga(loaded, { tome: opts.tome ?? null });
  const looseEnds = scanLooseEnds(loaded);

  if (opts.json) {
    console.log(JSON.stringify({ diagnostics: diags, looseEnds }, null, 2));
  } else {
    for (const d of diags) printDiagnostic(d);
    printSummary(diags);

    if (looseEnds.orphanEntries.length > 0) {
      console.log(`\nOrphan entries (never referenced across the saga):`);
      for (const o of looseEnds.orphanEntries) {
        console.log(`  - ${o.type}/${o.id} (${o.name}) [${o.file}]`);
      }
    }
    if (looseEnds.unlinkedWaypoints.length > 0) {
      console.log(`\nUnlinked waypoints (not placed on any thread):`);
      for (const u of looseEnds.unlinkedWaypoints) {
        console.log(`  - waypoint/${u.id} (${u.name}) [${u.file}]`);
      }
    }
  }
  if (hasErrors(diags)) process.exit(1);
}
