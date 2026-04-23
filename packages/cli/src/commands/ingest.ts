import { promises as fs } from "node:fs";
import path from "node:path";
import pc from "picocolors";

export interface IngestOpts {
  label?: string;
  json?: boolean;
}

export const ALLOWED_EXT = new Set([ 
  ".md",
  ".markdown",
  ".txt",
  ".text",
  ".rst",
  ".html",
  ".htm",
  ".json",
  ".yaml",
  ".yml",
  ".pdf",
  ".docx",
]);

const BINARY_EXTRACTORS: Record<string, (buf: Buffer) => Promise<string>> = {
  ".pdf": async (buf) => {
    // pdf-parse is CJS; import via default export.
    const mod = (await import("pdf-parse")).default as (
      b: Buffer,
    ) => Promise<{ text: string }>;
    const r = await mod(buf);
    return r.text ?? "";
  },
  ".docx": async (buf) => {
    const mammoth = await import("mammoth");
    const r = await mammoth.extractRawText({ buffer: buf });
    return r.value ?? "";
  },
};

/**
 * Stage raw source material for the Archivist agent to analyze. The command
 * copies every file (or recursively, every file inside a folder) into
 * `<saga>/.loreweave/ingest/<batch-id>/`, along with a manifest.
 *
 * The Archivist agent (see .github/agents/archivist.agent.md) reads these
 * staged files and drafts Codex/Lexicon entries. This command deliberately
 * does NOT run the AI — it only stages raw bytes so every edit is reviewable.
 */
export async function ingestCmd(
  saga: string,
  files: string[],
  opts: IngestOpts,
): Promise<void> {
  const sagaRoot = path.resolve(saga);
  const batchId =
    (opts.label ? opts.label.replace(/[^a-z0-9-]/gi, "-") + "-" : "") +
    new Date().toISOString().replace(/[:.]/g, "-");
  const ingestDir = path.join(sagaRoot, ".loreweave", "ingest", batchId);
  await fs.mkdir(ingestDir, { recursive: true });

  const staged: Array<{ source: string; staged: string; size: number }> = [];
  for (const input of files) {
    const abs = path.resolve(input);
    const stat = await fs.stat(abs).catch(() => null);
    if (!stat) {
      console.error(`skipping missing input: ${input}`);
      continue;
    }
    if (stat.isDirectory()) {
      const walked = await walkFiles(abs);
      for (const f of walked) await stageOne(f, abs, ingestDir, staged);
    } else {
      await stageOne(abs, path.dirname(abs), ingestDir, staged);
    }
  }

  const manifest = {
    batchId,
    created: new Date().toISOString(),
    label: opts.label ?? null,
    files: staged,
  };
  await fs.writeFile(
    path.join(ingestDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );

  if (opts.json) {
    console.log(JSON.stringify(manifest, null, 2));
    return;
  }

  console.log(pc.green("staged"), staged.length, "file(s) into", ingestDir);
  console.log(
    pc.dim("next: open the workspace and invoke @archivist to draft entries."),
  );
}

export async function walkFiles(dir: string): Promise<string[]> {
  const ents = await fs.readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const e of ents) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walkFiles(full)));
    else out.push(full);
  }
  return out;
}

export async function stageOne(
  file: string,
  baseDir: string,
  ingestDir: string,
  staged: Array<{ source: string; staged: string; size: number }>,
): Promise<void> {
  const ext = path.extname(file).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) return;
  const rel = path.relative(baseDir, file).split(path.sep).join("/");
  const dst = path.join(ingestDir, rel);
  await fs.mkdir(path.dirname(dst), { recursive: true });
  const buf = await fs.readFile(file);
  await fs.writeFile(dst, buf);
  staged.push({ source: file, staged: dst, size: buf.length });

  // If this is a binary source (pdf/docx), also drop a plain-text .md sibling
  // so the Archivist can read it alongside the original.
  const extractor = BINARY_EXTRACTORS[ext];
  if (extractor) {
    try {
      const text = await extractor(buf);
      const mdDst = dst.replace(new RegExp(`\\${ext}$`, "i"), "") + ".extracted.md";
      const banner = `<!-- extracted from ${path.basename(file)} by lw ingest -->\n\n`;
      const body = Buffer.from(banner + (text.trim() || "(no text extracted)") + "\n", "utf8");
      await fs.writeFile(mdDst, body);
      staged.push({ source: file + " (extracted)", staged: mdDst, size: body.length });
    } catch (e) {
      console.error(
        pc.yellow(
          `warning: failed to extract text from ${path.basename(file)}: ${(e as Error).message}`,
        ),
      );
    }
  }
}
