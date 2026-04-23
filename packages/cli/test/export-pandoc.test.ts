import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { exportCmd } from "../src/commands/export.js";
import { hasPandoc } from "../src/commands/export.js";

let tmpRoot: string;

beforeAll(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "lw-export-pandoc-"));
});
afterAll(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

async function buildSaga(name: string): Promise<string> {
  const root = path.join(tmpRoot, name);
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(path.join(root, "saga.yaml"), "id: demo\nname: Demo\n", "utf8");
  await fs.mkdir(path.join(root, "tomes/book-one/story/01-opening"), {
    recursive: true,
  });
  await fs.writeFile(
    path.join(root, "tomes/book-one/tome.yaml"),
    "id: book-one\ntitle: Book One\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(root, "tomes/book-one/story/01-opening/_meta.yaml"),
    "title: Opening\nordinal: 1\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(root, "tomes/book-one/story/01-opening/chapter.md"),
    "Once upon a time.\n",
    "utf8",
  );
  return root;
}

describe("lw export tome-pdf / tome-docx", () => {
  it("produces a docx file via pandoc when available", async () => {
    if (!hasPandoc()) {
      console.warn("pandoc not on PATH — skipping pandoc export test");
      return;
    }
    const saga = await buildSaga("pandoc-saga");
    const out = path.join(tmpRoot, "book-one.docx");
    await exportCmd(saga, { format: "tome-docx", tome: "book-one", out });
    const stat = await fs.stat(out);
    expect(stat.size).toBeGreaterThan(1000);
  });
});
