import { describe, expect, it } from "vitest";
import { refAtOffset } from "../src/editor/refAtCursor.js";

describe("refAtOffset", () => {
  const doc = "Aaron met @character/bella near @location/vellmar.\nHe said 'skol'.";

  it("returns null when the cursor isn't inside a ref", () => {
    expect(refAtOffset(doc, 0)).toBeNull();
    expect(refAtOffset(doc, 5)).toBeNull();
  });

  it("finds the first ref when cursor is mid-token", () => {
    const pos = doc.indexOf("@character");
    const r = refAtOffset(doc, pos + 3)!;
    expect(r).not.toBeNull();
    expect(r.type).toBe("character");
    expect(r.id).toBe("bella");
  });

  it("treats the position right after the id as still-inside", () => {
    const end = doc.indexOf("@character/bella") + "@character/bella".length;
    const r = refAtOffset(doc, end)!;
    expect(r.id).toBe("bella");
  });

  it("finds the second ref further down the document", () => {
    const pos = doc.indexOf("vellmar");
    const r = refAtOffset(doc, pos)!;
    expect(r.type).toBe("location");
    expect(r.id).toBe("vellmar");
  });

  it("captures a {display} override and includes the suffix in the range", () => {
    const overrideDoc = "The @character/aaron{king} stood.";
    const pos = overrideDoc.indexOf("aaron");
    const r = refAtOffset(overrideDoc, pos)!;
    expect(r.type).toBe("character");
    expect(r.id).toBe("aaron");
    expect(r.display).toBe("king");
    expect(r.raw).toBe("@character/aaron{king}");
    // Cursor anywhere inside the override should still resolve.
    const insideBraces = overrideDoc.indexOf("king") + 1;
    expect(refAtOffset(overrideDoc, insideBraces)?.id).toBe("aaron");
  });
});
