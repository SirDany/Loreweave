import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadSaga } from "../src/loader.js";
import { FsAdapter } from "../src/storage-fs.js";
import { scanLooseEnds, findEntryUsages, deleteEntryWithAudit } from "../src/integrity.js";

async function makeTempSaga(): Promise<{ dir: string; fs: FsAdapter; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(path.join(tmpdir(), "lw-integrity-test-"));
  const fs = new FsAdapter(dir);

  await fs.writeFile(
    "saga.yaml",
    "id: test-saga\ntitle: Test Saga\ntome_order: [tome-1]\n"
  );
  await fs.writeFile(
    "tomes/tome-1/tome.yaml",
    "id: tome-1\ntitle: Tome One\n"
  );
  await fs.writeFile(
    "tomes/tome-1/story/01-start/_meta.yaml",
    "title: Start\nordinal: 1\npov: ['@character/aaron']\n"
  );
  await fs.writeFile(
    "tomes/tome-1/story/01-start/chapter.md",
    "# Start\n\n[Aaron](@character/aaron) met @character/ghost in @location/vellmar.\n"
  );
  await fs.writeFile(
    "codex/characters/aaron.md",
    "---\nid: aaron\ntype: character\nname: Aaron\ntags: [soldier]\n---\nAaron is here."
  );
  await fs.writeFile(
    "codex/characters/orphan-char.md",
    "---\nid: orphan-char\ntype: character\nname: The Forgotten\n---\nNobody mentions this character."
  );
  await fs.writeFile(
    "codex/locations/vellmar.md",
    "---\nid: vellmar\ntype: location\nname: Vellmar\n---\nVellmar gates."
  );
  await fs.writeFile(
    "sigils/soldier.md",
    "---\nid: soldier\ntype: sigil\nname: Soldier\n---\nSoldier tag."
  );

  return {
    dir,
    fs,
    cleanup: async () => {
      try {
        await rm(dir, { recursive: true, force: true });
      } catch {
        // ignore EBUSY on windows temp
      }
    },
  };
}

describe("integrity.scanLooseEnds", () => {
  it("detects broken references and orphan entries", async () => {
    const { dir, cleanup } = await makeTempSaga();
    try {
      const saga = await loadSaga(dir);
      const report = scanLooseEnds(saga);

      // Broken ref: @character/ghost
      expect(report.brokenReferences).toHaveLength(1);
      expect(report.brokenReferences[0]!.id).toBe("ghost");
      expect(report.brokenReferences[0]!.type).toBe("character");

      // Orphan entries: orphan-char
      const orphanIds = report.orphanEntries.map((o) => o.id);
      expect(orphanIds).toContain("orphan-char");
      expect(orphanIds).not.toContain("aaron");
      expect(orphanIds).not.toContain("vellmar");
      expect(orphanIds).not.toContain("soldier");
    } finally {
      await cleanup();
    }
  });

  it("finds all entry usages across chapters and metadata", async () => {
    const { dir, cleanup } = await makeTempSaga();
    try {
      const saga = await loadSaga(dir);
      const usages = findEntryUsages(saga, "character", "aaron");
      expect(usages.length).toBeGreaterThanOrEqual(2);
      const files = usages.map((u) => u.file);
      expect(files.some((f) => f.includes("chapter.md"))).toBe(true);
      expect(files.some((f) => f.includes("_meta.yaml"))).toBe(true);
    } finally {
      await cleanup();
    }
  });

  it("deletes an entry with audit and generates an audit note", async () => {
    const { dir, fs, cleanup } = await makeTempSaga();
    try {
      const saga = await loadSaga(dir);
      const res = await deleteEntryWithAudit(saga, "character", "aaron", fs);
      expect(res.deleted).toBe(true);
      expect(res.usages.length).toBeGreaterThan(0);
      expect(res.auditNoteCreated).toBeDefined();

      const noteContent = await fs.readFile(res.auditNoteCreated!);
      expect(noteContent).toContain("Loose Ends Audit");
      expect(noteContent).toContain("@character/aaron");
      expect(noteContent).toContain("chapter.md");

      const exists = await fs.exists("codex/characters/aaron.md");
      expect(exists).toBe(false);
    } finally {
      await cleanup();
    }
  });
});
