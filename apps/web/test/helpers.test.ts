import { describe, expect, it } from "vitest";
import {
  filterTargets,
  isValidBranchName,
  isValidEntryId,
  parseJumpTarget,
  slugify,
  type TargetCandidate,
} from "../src/lib/helpers.js";

describe("slugify", () => {
  it("lowercases and replaces spaces", () => {
    expect(slugify("Aaron Stormrider")).toBe("aaron-stormrider");
  });

  it("strips punctuation", () => {
    expect(slugify("Café — Chapter One!")).toBe("caf-chapter-one");
  });

  it("collapses repeated dashes", () => {
    expect(slugify("a   --   b")).toBe("a-b");
  });

  it("truncates at 64 chars", () => {
    const long = "x".repeat(120);
    expect(slugify(long).length).toBe(64);
  });
});

describe("isValidEntryId", () => {
  it("accepts kebab-case ids", () => {
    expect(isValidEntryId("aaron")).toBe(true);
    expect(isValidEntryId("aaron-stormrider-2")).toBe(true);
  });

  it("rejects empty / leading dash / uppercase / symbols", () => {
    expect(isValidEntryId("")).toBe(false);
    expect(isValidEntryId("-aaron")).toBe(false);
    expect(isValidEntryId("Aaron")).toBe(false);
    expect(isValidEntryId("aaron stormrider")).toBe(false);
    expect(isValidEntryId("aaron@1")).toBe(false);
  });
});

describe("isValidBranchName", () => {
  it("accepts typical git branch names", () => {
    expect(isValidBranchName("main")).toBe(true);
    expect(isValidBranchName("feature/aaron")).toBe(true);
    expect(isValidBranchName("v1.2.3")).toBe(true);
  });

  it("rejects spaces and empty strings", () => {
    expect(isValidBranchName("")).toBe(false);
    expect(isValidBranchName("with space")).toBe(false);
    expect(isValidBranchName("bad~thing")).toBe(false);
  });
});

describe("filterTargets", () => {
  const candidates: TargetCandidate[] = [
    { value: "@character/aaron", label: "Aaron Stormrider", detail: "character" },
    { value: "@character/cassia", label: "Cassia Vell", detail: "character" },
    { value: "@location/vellmar", label: "Vellmar", detail: "location" },
    { value: "chapter:book-one/01-arrival", label: "Arrival", detail: "Book One" },
  ];

  it("returns the first N when query is empty", () => {
    expect(filterTargets(candidates, "", 2)).toHaveLength(2);
  });

  it("matches by value, label or detail", () => {
    expect(filterTargets(candidates, "aaron").map((c) => c.value)).toEqual([
      "@character/aaron",
    ]);
    expect(filterTargets(candidates, "vell").map((c) => c.value)).toEqual([
      "@character/cassia",
      "@location/vellmar",
    ]);
    expect(filterTargets(candidates, "Book").map((c) => c.value)).toEqual([
      "chapter:book-one/01-arrival",
    ]);
  });

  it("respects the limit", () => {
    expect(filterTargets(candidates, "", 10).length).toBe(candidates.length);
  });
});

describe("parseJumpTarget", () => {
  it("decodes chapter targets", () => {
    expect(parseJumpTarget("chapter:book-one/01-arrival")).toEqual({
      kind: "chapter",
      key: "book-one::01-arrival",
    });
  });

  it("decodes entry targets with @ prefix", () => {
    expect(parseJumpTarget("@character/aaron")).toEqual({
      kind: "entry",
      key: "character/aaron",
    });
  });

  it("decodes entry targets without @ prefix", () => {
    expect(parseJumpTarget("term/grukh")).toEqual({
      kind: "entry",
      key: "term/grukh",
    });
  });

  it("rejects saga-level and tome-level targets", () => {
    expect(parseJumpTarget("saga")).toBeNull();
    expect(parseJumpTarget("tome:book-one")).toBeNull();
  });

  it("rejects malformed targets", () => {
    expect(parseJumpTarget("nope")).toBeNull();
  });
});
