import { describe, expect, it } from "vitest";
import { extractReferences } from "../src/references.js";

describe("references.extract", () => {
  it("finds @type/id references with line and column", () => {
    const text = "Aaron (@character/aaron) walked into @location/vellmar.\nHe said @term/grukh.";
    const refs = extractReferences(text);
    expect(refs).toHaveLength(3);
    expect(refs[0]).toMatchObject({ type: "character", id: "aaron", line: 1 });
    expect(refs[1]).toMatchObject({ type: "location", id: "vellmar", line: 1 });
    expect(refs[2]).toMatchObject({ type: "term", id: "grukh", line: 2 });
  });

  it("ignores malformed references", () => {
    const text = "foo @UnknownType/bar @character/Invalid_ID @/missing";
    const refs = extractReferences(text);
    expect(refs).toHaveLength(0);
  });
});
