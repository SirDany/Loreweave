import pc from "picocolors";
import type { Diagnostic } from "@loreweave/core";

export function printDiagnostic(d: Diagnostic): void {
  const sev =
    d.severity === "error" ? pc.red("error") : pc.yellow("warning");
  const loc = d.file ? ` ${pc.cyan(d.file + (d.line ? `:${d.line}` : ""))}` : "";
  console.log(`${sev} ${pc.dim("[" + d.code + "]")}${loc}  ${d.message}`);
}

export function printSummary(diags: Diagnostic[]): void {
  const errors = diags.filter((d) => d.severity === "error").length;
  const warnings = diags.filter((d) => d.severity === "warning").length;
  if (errors === 0 && warnings === 0) {
    console.log(pc.green("✓ clean"));
  } else {
    console.log(
      `${errors ? pc.red(errors + " error(s)") : "0 errors"}, ${warnings ? pc.yellow(warnings + " warning(s)") : "0 warnings"}`,
    );
  }
}
