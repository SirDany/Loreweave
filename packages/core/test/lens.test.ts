import { describe, expect, it } from "vitest";
import {
  entryInTome,
  filterEntriesForTome,
  filterWaypointsForTome,
  waypointInTome,
} from "../src/lens.js";
import type { Entry, Waypoint } from "../src/types.js";

const e = (id: string, appears_in?: string[]): Entry => ({
  frontmatter: { id, type: "character", appears_in },
  body: "",
  path: `x/${id}.md`,
  relPath: `x/${id}.md`,
});

describe("lens", () => {
  it("entryInTome: passes when appears_in is absent", () => {
    expect(entryInTome(e("aaron"), "book-one")).toBe(true);
  });
  it("entryInTome: passes when tome is in appears_in", () => {
    expect(entryInTome(e("aaron", ["book-one"]), "book-one")).toBe(true);
  });
  it("entryInTome: fails when tome not in appears_in", () => {
    expect(entryInTome(e("aaron", ["book-two"]), "book-one")).toBe(false);
  });
  it("entryInTome: null tome = show all", () => {
    expect(entryInTome(e("aaron", ["book-two"]), null)).toBe(true);
  });
  it("filterEntriesForTome", () => {
    const out = filterEntriesForTome(
      [e("a"), e("b", ["book-one"]), e("c", ["book-two"])],
      "book-one",
    );
    expect(out.map((x) => x.frontmatter.id)).toEqual(["a", "b"]);
  });
  it("filterWaypointsForTome", () => {
    const wps: Waypoint[] = [
      { id: "w1", event: "@event/e1" },
      { id: "w2", event: "@event/e2", appears_in: ["book-one"] },
      { id: "w3", event: "@event/e3", appears_in: ["book-two"] },
    ];
    expect(filterWaypointsForTome(wps, "book-one").map((w) => w.id)).toEqual([
      "w1",
      "w2",
    ]);
    expect(waypointInTome(wps[2]!, null)).toBe(true);
  });
});
