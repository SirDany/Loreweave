import { describe, expect, it } from "vitest";
import { BUILTIN_GREGORIAN } from "../src/calendar.js";
import { linearize } from "../src/timeline.js";
import type { Thread } from "../src/types.js";

function thread(id: string, partial: Partial<Thread> & { waypoints: Thread["waypoints"] }): Thread {
  return {
    id,
    waypoints: partial.waypoints,
    calendar: partial.calendar,
    branches_from: partial.branches_from,
    path: `timelines/${id}.yaml`,
    relPath: `timelines/${id}.yaml`,
  };
}

describe("timeline.linearize", () => {
  it("topologically sorts relational-only waypoints", () => {
    const t = thread("main", {
      waypoints: [
        { id: "b", event: "@event/b", after: ["a"] },
        { id: "a", event: "@event/a" },
        { id: "c", event: "@event/c", after: ["b"] },
      ],
    });
    const { waypoints, issues } = linearize("main", [t], []);
    expect(issues).toEqual([]);
    expect(waypoints.map((w) => w.id)).toEqual(["a", "b", "c"]);
  });

  it("detects cycles", () => {
    const t = thread("main", {
      waypoints: [
        { id: "a", event: "@event/a", before: ["b"] },
        { id: "b", event: "@event/b", before: ["a"] },
      ],
    });
    const { issues } = linearize("main", [t], []);
    expect(issues.some((i) => i.kind === "cycle")).toBe(true);
  });

  it("detects date-before-contradiction", () => {
    const t = thread("main", {
      calendar: "gregorian",
      waypoints: [
        { id: "a", event: "@event/a", at: "1212-05-01", before: ["b"] },
        { id: "b", event: "@event/b", at: "1212-03-01" },
      ],
    });
    const { issues } = linearize("main", [t], [BUILTIN_GREGORIAN]);
    expect(
      issues.some((i) => i.kind === "date-before-contradiction"),
    ).toBe(true);
  });

  it("follows branches_from up to the branch waypoint", () => {
    const main = thread("main", {
      waypoints: [
        { id: "m1", event: "@event/m1" },
        { id: "m2", event: "@event/m2", after: ["m1"] },
        { id: "m3", event: "@event/m3", after: ["m2"] },
      ],
    });
    const alt = thread("alt", {
      branches_from: { thread: "main", at_waypoint: "m2" },
      waypoints: [{ id: "a1", event: "@event/a1", after: ["m2"] }],
    });
    const { waypoints } = linearize("alt", [main, alt], [], {
      includeBranches: true,
    });
    const ids = waypoints.map((w) => w.id);
    expect(ids).toContain("m1");
    expect(ids).toContain("m2");
    expect(ids).not.toContain("m3"); // main's post-branch waypoint excluded
    expect(ids).toContain("a1");
    expect(ids.indexOf("m2")).toBeLessThan(ids.indexOf("a1"));
  });

  it("applies tome lens to waypoints", () => {
    const t = thread("main", {
      waypoints: [
        { id: "a", event: "@event/a", appears_in: ["book-one"] },
        { id: "b", event: "@event/b", appears_in: ["book-two"], after: ["a"] },
      ],
    });
    const r = linearize("main", [t], [], { tome: "book-one" });
    expect(r.waypoints.map((w) => w.id)).toEqual(["a"]);
  });
});
