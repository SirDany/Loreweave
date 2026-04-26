import { describe, expect, it } from "vitest";
import { extractReferences, normalizeRef } from "../src/references.js";

describe("references.extract", () => {
  it("finds @type/id references with line and column", () => {
    const text = "Aaron (@character/aaron) walked into @location/vellmar.\nHe said @term/grukh.";
    const refs = extractReferences(text);
    expect(refs).toHaveLength(3);
    expect(refs[0]).toMatchObject({ type: "character", id: "aaron", line: 1 });
    expect(refs[1]).toMatchObject({ type: "location", id: "vellmar", line: 1 });
    expect(refs[2]).toMatchObject({ type: "term", id: "grukh", line: 2 });
    // No display override on plain references.
    expect(refs[0]!.display).toBeUndefined();
  });

  it("ignores malformed references", () => {
    const text = "foo @UnknownType/bar @character/Invalid_ID @/missing";
    const refs = extractReferences(text);
    expect(refs).toHaveLength(0);
  });

  it("captures the {display} override on supported references", () => {
    const text = "The @character/aaron{king} stood watch over @location/vellmar{the city}.";
    const refs = extractReferences(text);
    expect(refs).toHaveLength(2);
    expect(refs[0]).toMatchObject({
      type: "character",
      id: "aaron",
      display: "king",
      raw: "@character/aaron{king}",
    });
    expect(refs[1]).toMatchObject({
      type: "location",
      id: "vellmar",
      display: "the city",
    });
  });

  it("treats {} immediately after the id as an empty override (not absent)", () => {
    const refs = extractReferences("@character/aaron{} returned.");
    expect(refs).toHaveLength(1);
    expect(refs[0]!.display).toBe("");
  });

  it("does not let display text span newlines", () => {
    const refs = extractReferences("@character/aaron{first\nsecond}");
    // The brace block is rejected; the bare reference still matches.
    expect(refs).toHaveLength(1);
    expect(refs[0]!.display).toBeUndefined();
    expect(refs[0]!.raw).toBe("@character/aaron");
  });

  it("normalizeRef strips both @ and {display}", () => {
    expect(normalizeRef("@character/aaron")).toBe("character/aaron");
    expect(normalizeRef("@character/aaron{the king}")).toBe("character/aaron");
    expect(normalizeRef("character/aaron{x}")).toBe("character/aaron");
  });
});
