import { hasErrors, loadSaga, validateSaga } from "@loreweave/core";
import { printDiagnostic, printSummary } from "../print.js";

interface Opts {
  tome?: string;
  json?: boolean;
}

export async function validateCmd(saga: string, opts: Opts): Promise<void> {
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
