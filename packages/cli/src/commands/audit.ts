import { hasErrors, loadSaga, validateSaga } from "@loreweave/core";
import { printDiagnostic, printSummary } from "../print.js";

// Audit today is validate + slang warnings = validateSaga's output.
// Future: richer prose/canon drift heuristics.
export async function auditCmd(
  saga: string,
  opts: { tome?: string; json?: boolean },
): Promise<void> {
  const loaded = await loadSaga(saga);
  const diags = validateSaga(loaded, { tome: opts.tome ?? null });
  if (opts.json) {
    console.log(JSON.stringify({ diagnostics: diags }, null, 2));
  } else {
    for (const d of diags) printDiagnostic(d);
    printSummary(diags);
  }
  if (hasErrors(diags)) process.exit(1);
}
