import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadSaga } from "../src/loader.js";
import { hasErrors, validateSaga } from "../src/validator.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLE_SAGA = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "sagas",
  "example-saga",
);

describe("example saga", () => {
  it("loads and validates with zero errors", async () => {
    const saga = await loadSaga(EXAMPLE_SAGA);
    const diags = validateSaga(saga);
    const errors = diags.filter((d) => d.severity === "error");
    if (errors.length) {
      console.error(errors);
    }
    expect(hasErrors(diags)).toBe(false);
  });

  it("emits a slang-misuse warning for the planted case", async () => {
    const saga = await loadSaga(EXAMPLE_SAGA);
    const diags = validateSaga(saga);
    const slangWarnings = diags.filter(
      (d) => d.code === "slang-misuse" && d.severity === "warning",
    );
    expect(slangWarnings.length).toBeGreaterThan(0);
  });
});
