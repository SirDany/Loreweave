import { describe, expect, it } from "vitest";
import { buildEntryIndex, CycleError, resolve } from "../src/resolver.js";
import type { Entry } from "../src/types.js";

function mkEntry(
  type: Entry["frontmatter"]["type"],
  id: string,
  fm: Partial<Entry["frontmatter"]> = {},
): Entry {
  return {
    frontmatter: { id, type, ...fm } as Entry["frontmatter"],
    body: "",
    path: `${type}/${id}.md`,
    relPath: `${type}/${id}.md`,
  };
}

describe("resolver", () => {
  it("applies own properties with 'own' provenance", () => {
    const aaron = mkEntry("character", "aaron", {
      properties: { height: 180 },
    });
    const idx = buildEntryIndex([aaron]);
    const r = resolve(aaron, idx);
    expect(r.properties.height).toBe(180);
    expect(r.provenance.height).toBe("own");
  });

  it("inherits tag properties BFS with tag:<id> provenance", () => {
    const northern = mkEntry("sigil", "northern-kingdom", {
      properties: { speaks_slang: true, climate: "cold" },
    });
    const aaron = mkEntry("character", "aaron", {
      inherits: ["northern-kingdom"],
    });
    const idx = buildEntryIndex([aaron, northern]);
    const r = resolve(aaron, idx);
    expect(r.properties.speaks_slang).toBe(true);
    expect(r.provenance.speaks_slang).toBe("sigil:northern-kingdom");
    expect(r.properties.climate).toBe("cold");
  });

  it("own properties beat inherited ones", () => {
    const northern = mkEntry("sigil", "northern-kingdom", {
      properties: { speaks_slang: true },
    });
    const aaron = mkEntry("character", "aaron", {
      inherits: ["northern-kingdom"],
      properties: { speaks_slang: false },
    });
    const idx = buildEntryIndex([aaron, northern]);
    const r = resolve(aaron, idx);
    expect(r.properties.speaks_slang).toBe(false);
    expect(r.provenance.speaks_slang).toBe("own");
  });

  it("overrides beat own AND inherited (Aaron example)", () => {
    const northern = mkEntry("sigil", "northern-kingdom", {
      properties: { speaks_slang: true },
    });
    const aaron = mkEntry("character", "aaron", {
      inherits: ["northern-kingdom"],
      properties: { speaks_slang: true },
      overrides: { speaks_slang: false },
    });
    const idx = buildEntryIndex([aaron, northern]);
    const r = resolve(aaron, idx);
    expect(r.properties.speaks_slang).toBe(false);
    expect(r.provenance.speaks_slang).toBe("override");
  });

  it("detects inheritance cycles", () => {
    const a = mkEntry("sigil", "a", { inherits: ["b"] });
    const b = mkEntry("sigil", "b", { inherits: ["a"] });
    const idx = buildEntryIndex([a, b]);
    expect(() => resolve(a, idx)).toThrow(CycleError);
  });

  it("inherits transitively through tags", () => {
    const root = mkEntry("sigil", "humanoid", { properties: { legs: 2 } });
    const mid = mkEntry("sigil", "northerner", {
      inherits: ["humanoid"],
      properties: { climate: "cold" },
    });
    const aaron = mkEntry("character", "aaron", { inherits: ["northerner"] });
    const idx = buildEntryIndex([aaron, mid, root]);
    const r = resolve(aaron, idx);
    expect(r.properties.legs).toBe(2);
    expect(r.properties.climate).toBe("cold");
  });
});
