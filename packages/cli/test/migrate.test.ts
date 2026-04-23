import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { applyPlan, buildPlan } from "../src/commands/migrate.js";

let tmpRoot: string;

beforeAll(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "lw-migrate-tests-"));
});
afterAll(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

async function writeFile(p: string, body: string): Promise<void> {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, body, "utf8");
}

async function buildLegacySaga(name: string): Promise<string> {
  const root = path.join(tmpRoot, name);
  await writeFile(path.join(root, "saga.yaml"), "id: demo\nname: Demo\n");
  await writeFile(
    path.join(root, "wiki/characters/aaron.md"),
    "---\nid: aaron\ntype: character\nname: Aaron\n---\nHe met @event/duel.",
  );
  await writeFile(
    path.join(root, "wiki/events/duel.md"),
    "---\nid: duel\ntype: event\nname: The Duel\n---\nA fateful clash.",
  );
  await writeFile(
    path.join(root, "glossary/skol.md"),
    "---\nid: skol\ntype: term\nterm: skol\ndefinition: hail\n---\n",
  );
  await writeFile(
    path.join(root, "tags/northern.md"),
    "---\nid: northern\ntype: tag\nname: Northern\n---\n",
  );
  await writeFile(
    path.join(root, "timelines/main.yaml"),
    'id: main\nwaypoints:\n  - id: w1\n    event: "@event/duel"\n',
  );
  return root;
}

describe("lw migrate", () => {
  it("plans top-level + nested folder renames and content rewrites", async () => {
    const root = await buildLegacySaga("plan-saga");
    const plan = await buildPlan(root);

    const topRename = (from: string, to: string) =>
      plan.folders.find((f) => f.from === from && f.to === to);
    expect(topRename("wiki", "codex")).toBeDefined();
    expect(topRename("wiki", "codex")!.exists).toBe(true);
    expect(topRename("glossary", "lexicon")!.exists).toBe(true);
    expect(topRename("tags", "sigils")!.exists).toBe(true);
    expect(topRename("timelines", "threads")!.exists).toBe(true);
    const nested = plan.folders.find((f) => f.from === "codex/events");
    expect(nested).toBeDefined();
    expect(nested!.to).toBe("codex/waypoints");
    expect(nested!.exists).toBe(true);

    // Every legacy file that needs rewriting is flagged.
    const byPath = new Map(plan.files.map((f) => [f.relPath, f.changes]));
    expect(byPath.get("wiki/characters/aaron.md")).toContain(
      "@event/ -> @waypoint/",
    );
    expect(byPath.get("wiki/events/duel.md")).toEqual(
      expect.arrayContaining(["type: event -> waypoint"]),
    );
    expect(byPath.get("tags/northern.md")).toContain("type: tag -> sigil");
    expect(byPath.get("timelines/main.yaml")).toContain("@event/ -> @waypoint/");
  });

  it("applies renames (including codex/events -> codex/waypoints) and rewrites content", async () => {
    const root = await buildLegacySaga("apply-saga");
    const plan = await buildPlan(root);
    await applyPlan(plan);

    // Top-level folders renamed.
    for (const legacy of ["wiki", "glossary", "tags", "timelines"]) {
      await expect(fs.stat(path.join(root, legacy))).rejects.toThrow();
    }
    await expect(fs.stat(path.join(root, "codex/characters"))).resolves.toBeDefined();
    await expect(fs.stat(path.join(root, "lexicon"))).resolves.toBeDefined();
    await expect(fs.stat(path.join(root, "sigils"))).resolves.toBeDefined();
    await expect(fs.stat(path.join(root, "threads"))).resolves.toBeDefined();

    // Nested: codex/events -> codex/waypoints.
    await expect(fs.stat(path.join(root, "codex/events"))).rejects.toThrow();
    const duelPath = path.join(root, "codex/waypoints/duel.md");
    const duel = await fs.readFile(duelPath, "utf8");
    expect(duel).toContain("type: waypoint");
    expect(duel).not.toContain("type: event");

    const aaron = await fs.readFile(
      path.join(root, "codex/characters/aaron.md"),
      "utf8",
    );
    expect(aaron).toContain("@waypoint/duel");
    expect(aaron).not.toContain("@event/duel");

    const northern = await fs.readFile(path.join(root, "sigils/northern.md"), "utf8");
    expect(northern).toContain("type: sigil");

    const thread = await fs.readFile(path.join(root, "threads/main.yaml"), "utf8");
    expect(thread).toContain("@waypoint/duel");
  });

  it("reports conflicts when both legacy and canonical folders exist", async () => {
    const root = path.join(tmpRoot, "conflict-saga");
    await writeFile(path.join(root, "saga.yaml"), "id: c\nname: C\n");
    await writeFile(path.join(root, "wiki/a.md"), "---\nid: a\ntype: character\n---\n");
    await writeFile(path.join(root, "codex/b.md"), "---\nid: b\ntype: character\n---\n");

    const plan = await buildPlan(root);
    const top = plan.folders.find((f) => f.from === "wiki" && f.to === "codex")!;
    expect(top.exists).toBe(true);
    expect(top.conflict).toBe(true);
  });
});
