import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { listSnapshots } from "../src/commands/backup-list.js";

let tmpRoot: string;

beforeAll(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "lw-backup-tests-"));
});
afterAll(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

describe("backup-list", () => {
  it("lists zip snapshots newest-first and parses labels", async () => {
    const saga = path.join(tmpRoot, "my-saga");
    const dir = path.join(saga, ".loreweave", "backups");
    await fs.mkdir(dir, { recursive: true });
    const older = path.join(dir, "my-saga-2026-01-01T00-00-00-000Z.zip");
    const newer = path.join(dir, "my-saga-2026-02-02T00-00-00-000Z-work-in-progress.zip");
    await fs.writeFile(older, "old");
    await fs.writeFile(newer, "new");
    // Stagger mtimes explicitly.
    await fs.utimes(older, new Date("2026-01-01"), new Date("2026-01-01"));
    await fs.utimes(newer, new Date("2026-02-02"), new Date("2026-02-02"));

    const snaps = await listSnapshots(saga, dir);
    expect(snaps).toHaveLength(2);
    expect(snaps[0]!.file).toBe("my-saga-2026-02-02T00-00-00-000Z-work-in-progress.zip");
    expect(snaps[0]!.label).toBe("work-in-progress");
    expect(snaps[1]!.file).toBe("my-saga-2026-01-01T00-00-00-000Z.zip");
    expect(snaps[1]!.label).toBeNull();
  });

  it("returns empty list when the backups dir does not exist", async () => {
    const saga = path.join(tmpRoot, "empty-saga");
    await fs.mkdir(saga, { recursive: true });
    const snaps = await listSnapshots(saga, path.join(saga, ".loreweave", "backups"));
    expect(snaps).toEqual([]);
  });
});
