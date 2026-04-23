import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { promises as fs } from "node:fs";
import { createWriteStream } from "node:fs";
import os from "node:os";
import path from "node:path";
import archiver from "archiver";
import { buildPlan, extractZip, sha256, detectBundleRoot } from "../src/commands/import.js";
import { stripRefs } from "../src/commands/export.js";
import { ALLOWED_EXT, stageOne } from "../src/commands/ingest.js";

let tmpRoot: string;

beforeAll(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "lw-cli-tests-"));
});
afterAll(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

async function makeSaga(name: string, files: Record<string, string>): Promise<string> {
  const root = path.join(tmpRoot, name);
  for (const [rel, body] of Object.entries(files)) {
    const abs = path.join(root, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, body, "utf8");
  }
  return root;
}

async function zipDir(dir: string, outFile: string): Promise<void> {
  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const ws = createWriteStream(outFile);
    const a = archiver("zip", { zlib: { level: 9 } });
    ws.on("close", () => resolve());
    ws.on("error", reject);
    a.on("error", reject);
    a.pipe(ws);
    a.directory(dir, path.basename(dir));
    a.append(JSON.stringify({ loreweave: { kind: "saga-export", version: 1 } }), {
      name: ".loreweave-export.json",
    });
    void a.finalize();
  });
}

describe("stripRefs", () => {
  it("replaces @type/id with display names from the index", () => {
    const idx = new Map<string, string>([
      ["character/bella", "Bella Rhen"],
      ["term/skol", "skol"],
    ]);
    const text = "@character/bella raised her @term/skol and @character/unknown watched.";
    expect(stripRefs(text, idx)).toBe(
      "Bella Rhen raised her skol and @character/unknown watched.",
    );
  });

  it("leaves malformed refs untouched", () => {
    const idx = new Map<string, string>();
    expect(stripRefs("email@example.com", idx)).toBe("email@example.com");
  });
});

describe("import buildPlan", () => {
  it("classifies files as new / conflict / unchanged via sha256", async () => {
    const src = await makeSaga("src-saga", {
      "saga.yaml": "id: demo\nname: Demo\n",
      "codex/characters/a.md": "---\nid: a\ntype: character\nname: A\n---\nhi",
      "codex/characters/b.md": "---\nid: b\ntype: character\nname: B\n---\nb-1",
    });
    // Destination differs on one file, same on another, missing one.
    const dstRoot = path.join(tmpRoot, "sagas-target");
    const dst = path.join(dstRoot, "src-saga");
    await fs.mkdir(path.join(dst, "codex/characters"), { recursive: true });
    await fs.writeFile(path.join(dst, "saga.yaml"), "id: demo\nname: Demo\n", "utf8"); // unchanged
    await fs.writeFile(
      path.join(dst, "codex/characters/b.md"),
      "---\nid: b\ntype: character\nname: B\n---\nOLD",
      "utf8",
    ); // conflict
    // a.md missing => new

    // Stage the src-saga into a temp "extracted" dir
    const staging = await fs.mkdtemp(path.join(tmpRoot, "stage-"));
    const stagedSaga = path.join(staging, "src-saga");
    await fs.cp(src, stagedSaga, { recursive: true });

    const plan = await buildPlan(staging, dstRoot);
    expect(plan.bundleRoot).toBe("src-saga");
    expect(plan.newFiles).toEqual(["codex/characters/a.md"]);
    expect(plan.conflicts.map((c) => c.relPath)).toEqual(["codex/characters/b.md"]);
    expect(plan.unchanged).toEqual(["saga.yaml"]);
    const conflict = plan.conflicts[0]!;
    expect(conflict.existing).not.toBe(conflict.incoming);
  });

  it("detects bundle root from single top-level folder", async () => {
    const staging = await fs.mkdtemp(path.join(tmpRoot, "bundle-"));
    await fs.mkdir(path.join(staging, "only-one", "codex"), { recursive: true });
    await fs.writeFile(path.join(staging, "only-one", "saga.yaml"), "x", "utf8");
    expect(await detectBundleRoot(staging)).toBe("only-one");
  });
});

describe("extractZip path-escape guard", () => {
  it("round-trips a well-formed zip", async () => {
    const saga = await makeSaga("zip-saga", {
      "saga.yaml": "id: z\nname: Z\n",
    });
    const zipOut = path.join(tmpRoot, "z.zip");
    await zipDir(saga, zipOut);
    const extracted = await extractZip(zipOut);
    try {
      const inner = await fs.readFile(path.join(extracted, "zip-saga", "saga.yaml"), "utf8");
      expect(inner).toContain("id: z");
    } finally {
      await fs.rm(extracted, { recursive: true, force: true });
    }
  });
});

describe("sha256", () => {
  it("is deterministic and differs on content change", () => {
    const a = sha256(Buffer.from("hello"));
    const b = sha256(Buffer.from("hello"));
    const c = sha256(Buffer.from("hello!"));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toHaveLength(64);
  });
});

describe("ingest ALLOWED_EXT and stageOne", () => {
  it("accepts known text-like extensions", () => {
    expect(ALLOWED_EXT.has(".md")).toBe(true);
    expect(ALLOWED_EXT.has(".txt")).toBe(true);
    expect(ALLOWED_EXT.has(".yaml")).toBe(true);
  });

  it("rejects binary/unknown extensions", () => {
    expect(ALLOWED_EXT.has(".exe")).toBe(false);
    expect(ALLOWED_EXT.has(".png")).toBe(false);
    expect(ALLOWED_EXT.has(".zip")).toBe(false);
  });

  it("accepts pdf and docx for extraction", () => {
    expect(ALLOWED_EXT.has(".pdf")).toBe(true);
    expect(ALLOWED_EXT.has(".docx")).toBe(true);
  });

  it("stageOne copies allowed files and skips disallowed ones", async () => {
    const base = await fs.mkdtemp(path.join(tmpRoot, "ingest-src-"));
    const okFile = path.join(base, "notes.md");
    const badFile = path.join(base, "blob.exe");
    await fs.writeFile(okFile, "# hi", "utf8");
    await fs.writeFile(badFile, "binary", "utf8");

    const ingest = await fs.mkdtemp(path.join(tmpRoot, "ingest-dst-"));
    const staged: Array<{ source: string; staged: string; size: number }> = [];
    await stageOne(okFile, base, ingest, staged);
    await stageOne(badFile, base, ingest, staged);

    expect(staged).toHaveLength(1);
    expect(staged[0]!.source).toBe(okFile);
    const copied = await fs.readFile(path.join(ingest, "notes.md"), "utf8");
    expect(copied).toBe("# hi");
  });
});
