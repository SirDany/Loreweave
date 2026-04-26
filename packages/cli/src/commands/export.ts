import { loadSaga } from '@loreweave/core';
import archiver from 'archiver';
import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pc from 'picocolors';

export type ExportFormat =
  | 'saga'
  | 'tome-md'
  | 'tome-html'
  | 'tome-pdf'
  | 'tome-docx'
  | 'tome-epub'
  | 'chapter-md'
  | 'codex-md'
  | 'codex-html'
  | 'slang-md'
  | 'saga-json';

export interface ExportOpts {
  out?: string;
  tome?: string;
  chapter?: string;
  format?: ExportFormat;
  plan?: boolean;
  json?: boolean;
}

const PANDOC_FORMATS: ExportFormat[] = ['tome-pdf', 'tome-docx', 'tome-epub'];
const TOME_FORMATS: ExportFormat[] = [
  'tome-md',
  'tome-html',
  'tome-pdf',
  'tome-docx',
  'tome-epub',
];

/**
 * Export a Saga as a shareable zip, publish a single Tome, render the codex
 * as a "world bible", or extract a single chapter.
 */
export async function exportCmd(saga: string, opts: ExportOpts): Promise<void> {
  const format: ExportFormat = opts.format ?? 'saga';
  const outFallback = (ext: string) => {
    const base = path.basename(path.resolve(saga));
    const tomeBit = opts.tome ? '-' + opts.tome : '';
    const chapterBit = opts.chapter ? '-' + opts.chapter : '';
    return path.resolve(`${base}${tomeBit}${chapterBit}.${ext}`);
  };

  if (format === 'saga') {
    if (opts.plan) {
      const plan = await planSagaZip(saga);
      if (opts.json) console.log(JSON.stringify(plan, null, 2));
      else printSagaPlan(plan);
      return;
    }
    const out = opts.out ?? outFallback('zip');
    await exportSagaZip(saga, out);
    console.log(pc.green('exported saga →'), out);
    return;
  }

  if (format === 'saga-json') {
    const out = opts.out ?? outFallback('json');
    await exportSagaJson(saga, out);
    console.log(pc.green('exported saga-json →'), out);
    return;
  }

  if (format === 'codex-md' || format === 'codex-html') {
    const ext = format === 'codex-md' ? 'md' : 'html';
    const out =
      opts.out ??
      path.resolve(`${path.basename(path.resolve(saga))}-codex.${ext}`);
    await exportCodex(saga, format, out);
    console.log(pc.green(`exported ${format} →`), out);
    return;
  }

  if (format === 'slang-md') {
    const out =
      opts.out ?? path.resolve(`${path.basename(path.resolve(saga))}-slang.md`);
    await exportSlangMd(saga, out);
    console.log(pc.green('exported slang-md →'), out);
    return;
  }

  if (format === 'chapter-md') {
    if (!opts.tome || !opts.chapter) {
      console.error('--tome and --chapter are required for chapter-md');
      process.exit(1);
    }
    const out = opts.out ?? outFallback('md');
    await exportChapterMd(saga, opts.tome, opts.chapter, out);
    console.log(pc.green('exported chapter-md →'), out);
    return;
  }

  if (TOME_FORMATS.includes(format)) {
    if (!opts.tome) {
      console.error(`--tome is required for format ${format}`);
      process.exit(1);
    }
    if (PANDOC_FORMATS.includes(format) && !hasPandoc()) {
      console.error(
        pc.red(
          'pandoc not found on PATH — install it for PDF/DOCX/EPUB export: https://pandoc.org/installing.html'
        )
      );
      process.exit(1);
    }
    const ext =
      format === 'tome-md'
        ? 'md'
        : format === 'tome-html'
        ? 'html'
        : format === 'tome-pdf'
        ? 'pdf'
        : format === 'tome-docx'
        ? 'docx'
        : 'epub';
    const out = opts.out ?? outFallback(ext);
    if (format === 'tome-md' || format === 'tome-html') {
      await exportTome(saga, opts.tome, format, out);
    } else {
      await exportTomeViaPandoc(
        saga,
        opts.tome,
        ext as 'pdf' | 'docx' | 'epub',
        out
      );
    }
    console.log(pc.green(`exported ${format} →`), out);
    return;
  }

  console.error(`unknown format "${format}"`);
  process.exit(1);
}

interface SagaZipPlan {
  saga: string;
  totalFiles: number;
  totalBytes: number;
  files: Array<{ relPath: string; size: number }>;
}

async function walkSagaFiles(
  absRoot: string,
  prefix = ''
): Promise<Array<{ relPath: string; size: number }>> {
  const ents = await fs.readdir(path.join(absRoot, prefix), {
    withFileTypes: true,
  });
  const out: Array<{ relPath: string; size: number }> = [];
  for (const e of ents) {
    if (e.name === '.git' || e.name === 'node_modules') continue;
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    const full = path.join(absRoot, rel);
    if (e.isDirectory()) {
      out.push(...(await walkSagaFiles(absRoot, rel)));
    } else {
      const stat = await fs.stat(full);
      out.push({ relPath: rel, size: stat.size });
    }
  }
  return out;
}

export async function planSagaZip(sagaPath: string): Promise<SagaZipPlan> {
  const abs = path.resolve(sagaPath);
  const files = await walkSagaFiles(abs);
  return {
    saga: abs,
    totalFiles: files.length,
    totalBytes: files.reduce((n, f) => n + f.size, 0),
    files,
  };
}

function printSagaPlan(plan: SagaZipPlan): void {
  console.log(pc.bold('saga:'), plan.saga);
  console.log(
    `  files: ${plan.totalFiles}, total: ${(plan.totalBytes / 1024).toFixed(
      1
    )} KB`
  );
  for (const f of plan.files.slice(0, 50)) {
    console.log(`  ${pc.dim(String(f.size).padStart(8))}  ${f.relPath}`);
  }
  if (plan.files.length > 50)
    console.log(pc.dim(`  … and ${plan.files.length - 50} more`));
}

async function exportSagaZip(sagaPath: string, outFile: string): Promise<void> {
  const abs = path.resolve(sagaPath);
  const stat = await fs.stat(abs);
  if (!stat.isDirectory()) throw new Error(`${abs} is not a directory`);

  await fs.mkdir(path.dirname(outFile), { recursive: true });

  await new Promise<void>((resolvePromise, reject) => {
    const output = createWriteStream(outFile);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', () => resolvePromise());
    output.on('error', reject);
    archive.on('error', reject);
    archive.pipe(output);

    // Use the saga folder's basename as the zip root.
    const rootName = path.basename(abs);
    archive.directory(abs, rootName);
    // Add a manifest marker so imports can detect Loreweave bundles.
    archive.append(
      JSON.stringify(
        {
          loreweave: {
            kind: 'saga-export',
            version: 1,
            root: rootName,
            exported_at: new Date().toISOString(),
          },
        },
        null,
        2
      ),
      { name: '.loreweave-export.json' }
    );
    void archive.finalize();
  });
}

/**
 * Replace `@type/id` references with the entity's display name when
 * resolvable; otherwise leave the raw ref in place. Used by tome-md and
 * tome-html exports so published prose doesn't leak Codex ids.
 *
 * Recognizes the optional `{display text}` override syntax: when
 * present, the override wins over the resolved entity name.
 */
export function stripRefs(text: string, idx: Map<string, string>): string {
  return text.replace(
    /@([a-z][a-z0-9-]*)\/([a-z0-9][a-z0-9-]*)(?:\{([^}\n]*)\})?/g,
    (raw, type: string, id: string, display: string | undefined) => {
      if (display !== undefined && display.length > 0) return display;
      // Strip the `{...}` suffix from the fallback so a missing entity
      // still renders as the bare echo rather than echo+braces.
      const bare = `@${type}/${id}`;
      return idx.get(`${type}/${id}`) ?? bare;
    },
  );
}

async function exportTome(
  sagaPath: string,
  tomeId: string,
  format: 'tome-md' | 'tome-html',
  outFile: string
): Promise<void> {
  const loaded = await loadSaga(sagaPath);
  const tome = loaded.tomes.find((t) => t.manifest.id === tomeId);
  if (!tome) throw new Error(`tome "${tomeId}" not found in ${sagaPath}`);

  const title = tome.manifest.title ?? tome.manifest.id;
  const chapters = [...tome.chapters].sort(
    (a, b) => (a.meta.ordinal ?? 0) - (b.meta.ordinal ?? 0)
  );

  // Strip `@type/id` references for published prose; keep the visible name if
  // we can resolve it, else fall back to the id.
  const idx = new Map<string, string>();
  for (const e of loaded.entries)
    idx.set(
      `${e.frontmatter.type}/${e.frontmatter.id}`,
      e.frontmatter.name ?? e.frontmatter.id
    );
  const stripRefsLocal = (text: string): string => stripRefs(text, idx);

  if (format === 'tome-md') {
    const parts: string[] = [];
    parts.push(`# ${title}\n\n`);
    for (const c of chapters) {
      parts.push(`## ${c.meta.title ?? c.slug}\n\n`);
      parts.push(stripRefsLocal(c.body).trim());
      parts.push('\n\n');
    }
    await fs.mkdir(path.dirname(outFile), { recursive: true });
    await fs.writeFile(outFile, parts.join(''), 'utf8');
    return;
  }

  // tome-html
  const escape = (s: string) =>
    s.replace(
      /[&<>]/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!)
    );
  const paragraphs = (text: string) =>
    text
      .split(/\n{2,}/)
      .map((p) => `<p>${escape(p).replace(/\n/g, '<br/>')}</p>`)
      .join('\n');
  const body = chapters
    .map(
      (c) =>
        `<section><h2>${escape(c.meta.title ?? c.slug)}</h2>\n${paragraphs(
          stripRefsLocal(c.body).trim()
        )}</section>`
    )
    .join('\n');
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${escape(title)}</title>
<style>
body { font-family: Georgia, serif; max-width: 42rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.6; color: #222; }
h1 { font-size: 2rem; }
h2 { margin-top: 3rem; border-bottom: 1px solid #ddd; padding-bottom: 0.25rem; }
p { text-indent: 1.5em; margin: 0 0 0.75em 0; }
</style>
</head>
<body>
<h1>${escape(title)}</h1>
${body}
</body>
</html>
`;
  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await fs.writeFile(outFile, html, 'utf8');
}

export function hasPandoc(): boolean {
  try {
    const r = spawnSync('pandoc', ['--version'], {
      stdio: 'ignore',
      shell: process.platform === 'win32',
    });
    return r.status === 0;
  } catch {
    return false;
  }
}

/**
 * Build a tome markdown string in memory (same content as tome-md export),
 * then hand it to pandoc for PDF/DOCX/EPUB conversion. Pulls author / language
 * from the saga manifest when present so EPUB / PDF metadata is meaningful.
 */
async function exportTomeViaPandoc(
  sagaPath: string,
  tomeId: string,
  ext: 'pdf' | 'docx' | 'epub',
  outFile: string
): Promise<void> {
  const loaded = await loadSaga(sagaPath);
  const tome = loaded.tomes.find((t) => t.manifest.id === tomeId);
  if (!tome) throw new Error(`tome "${tomeId}" not found in ${sagaPath}`);

  const title = tome.manifest.title ?? tome.manifest.id;
  const author = tome.manifest.author ?? loaded.manifest.author ?? null;
  const subtitle = tome.manifest.subtitle ?? null;
  const language = loaded.manifest.language ?? 'en';
  const date = new Date().toISOString().slice(0, 10);
  const chapters = [...tome.chapters].sort(
    (a, b) => (a.meta.ordinal ?? 0) - (b.meta.ordinal ?? 0)
  );
  const idx = new Map<string, string>();
  for (const e of loaded.entries)
    idx.set(
      `${e.frontmatter.type}/${e.frontmatter.id}`,
      e.frontmatter.name ?? e.frontmatter.id
    );

  const fmLines: string[] = ['---', `title: ${JSON.stringify(title)}`];
  if (subtitle) fmLines.push(`subtitle: ${JSON.stringify(subtitle)}`);
  if (author) fmLines.push(`author: ${JSON.stringify(author)}`);
  fmLines.push(`date: ${JSON.stringify(date)}`);
  fmLines.push(`lang: ${JSON.stringify(language)}`);
  fmLines.push('---', '');

  const parts: string[] = [...fmLines];
  for (const c of chapters) {
    parts.push(`# ${c.meta.title ?? c.slug}`, ``);
    parts.push(stripRefs(c.body, idx).trim(), ``);
  }
  const md = parts.join('\n');

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lw-pandoc-'));
  const tmpMd = path.join(tmpDir, `${tomeId}.md`);
  await fs.writeFile(tmpMd, md, 'utf8');

  await fs.mkdir(path.dirname(outFile), { recursive: true });

  const args = [tmpMd, '-o', outFile, '--from=markdown', '--toc'];
  if (ext === 'pdf') args.push('--pdf-engine=xelatex');
  if (ext === 'epub') args.push('--metadata', `lang=${language}`);

  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn('pandoc', args, {
      stdio: ['ignore', 'inherit', 'inherit'],
      shell: process.platform === 'win32',
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`pandoc exited with code ${code}`));
    });
  });

  await fs.rm(tmpDir, { recursive: true, force: true });
}

/** Export a single chapter as plain markdown with refs stripped to names. */
async function exportChapterMd(
  sagaPath: string,
  tomeId: string,
  chapterSlug: string,
  outFile: string
): Promise<void> {
  const loaded = await loadSaga(sagaPath);
  const tome = loaded.tomes.find((t) => t.manifest.id === tomeId);
  if (!tome) throw new Error(`tome "${tomeId}" not found in ${sagaPath}`);
  const chapter = tome.chapters.find((c) => c.slug === chapterSlug);
  if (!chapter) {
    throw new Error(
      `chapter "${chapterSlug}" not found in tome "${tomeId}" (have: ${tome.chapters
        .map((c) => c.slug)
        .join(', ')})`
    );
  }
  const idx = new Map<string, string>();
  for (const e of loaded.entries)
    idx.set(
      `${e.frontmatter.type}/${e.frontmatter.id}`,
      e.frontmatter.name ?? e.frontmatter.id
    );
  const title = chapter.meta.title ?? chapter.slug;
  const out = `# ${title}\n\n${stripRefs(chapter.body, idx).trim()}\n`;
  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await fs.writeFile(outFile, out, 'utf8');
}

/**
 * Export the codex (and lexicon) as a single browsable document — a "world
 * bible" the writer can hand to beta readers without giving up the raw repo.
 *
 * Entries are grouped by type; cross-references are linked when possible
 * (markdown anchors / HTML anchors).
 */
async function exportCodex(
  sagaPath: string,
  format: 'codex-md' | 'codex-html',
  outFile: string
): Promise<void> {
  const loaded = await loadSaga(sagaPath);
  const groups: Array<{ type: string; label: string }> = [
    { type: 'character', label: 'Characters' },
    { type: 'location', label: 'Locations' },
    { type: 'concept', label: 'Concepts' },
    { type: 'lore', label: 'Lore' },
    { type: 'waypoint', label: 'Waypoints' },
    { type: 'term', label: 'Lexicon' },
    { type: 'sigil', label: 'Sigils' },
  ];

  const idx = new Map<string, string>();
  for (const e of loaded.entries) {
    idx.set(
      `${e.frontmatter.type}/${e.frontmatter.id}`,
      e.frontmatter.name ?? e.frontmatter.id
    );
  }
  const anchorOf = (type: string, id: string) => `${type}-${id}`;

  if (format === 'codex-md') {
    const parts: string[] = [];
    parts.push(`# ${loaded.manifest.title ?? loaded.manifest.id} — Codex\n\n`);
    parts.push(`_Generated ${new Date().toISOString().slice(0, 10)}_\n\n`);
    for (const g of groups) {
      const items = loaded.entries.filter((e) => e.frontmatter.type === g.type);
      if (items.length === 0) continue;
      parts.push(`## ${g.label}\n\n`);
      items.sort((a, b) =>
        (a.frontmatter.name ?? a.frontmatter.id).localeCompare(
          b.frontmatter.name ?? b.frontmatter.id
        )
      );
      for (const e of items) {
        const name = e.frontmatter.name ?? e.frontmatter.id;
        parts.push(
          `### ${name}  <a id="${anchorOf(g.type, e.frontmatter.id)}"></a>\n\n`
        );
        parts.push(`*${g.type}/${e.frontmatter.id}*\n\n`);
        // Replace @echoes with markdown links to in-document anchors.
        const linked = e.body.replace(
          /@([a-zA-Z]+)\/([a-zA-Z0-9\-_]+)(?:\{([^}\n]*)\})?/g,
          (raw, type, id, override) => {
            const display =
              override !== undefined && override.length > 0
                ? override
                : idx.get(`${type}/${id}`) ?? raw;
            return `[${display}](#${anchorOf(type, id)})`;
          }
        );
        parts.push(linked.trim() + '\n\n');
      }
    }
    await fs.mkdir(path.dirname(outFile), { recursive: true });
    await fs.writeFile(outFile, parts.join(''), 'utf8');
    return;
  }

  // codex-html
  const escape = (s: string) =>
    s.replace(
      /[&<>]/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!)
    );
  const paragraphs = (text: string) =>
    text
      .split(/\n{2,}/)
      .map((p) => `<p>${p}</p>`)
      .join('\n');

  const sections: string[] = [];
  for (const g of groups) {
    const items = loaded.entries.filter((e) => e.frontmatter.type === g.type);
    if (items.length === 0) continue;
    items.sort((a, b) =>
      (a.frontmatter.name ?? a.frontmatter.id).localeCompare(
        b.frontmatter.name ?? b.frontmatter.id
      )
    );
    const entryHtml = items
      .map((e) => {
        const name = e.frontmatter.name ?? e.frontmatter.id;
        // Tokenize @echoes, escape the body, then re-inject anchor tags.
        const tokens: Array<{ type: string; id: string; display: string }> = [];
        const tokenized = e.body.replace(
          /@([a-zA-Z]+)\/([a-zA-Z0-9\-_]+)(?:\{([^}\n]*)\})?/g,
          (raw, type, id, override) => {
            const display =
              override !== undefined && override.length > 0
                ? override
                : idx.get(`${type}/${id}`) ?? raw;
            tokens.push({ type, id, display });
            return `\u0000LWREF${tokens.length - 1}\u0000`;
          }
        );
        const escaped = escape(tokenized).replace(
          /\u0000LWREF(\d+)\u0000/g,
          (_, n) => {
            const t = tokens[Number(n)]!;
            return `<a href="#${anchorOf(t.type, t.id)}">${escape(
              t.display
            )}</a>`;
          }
        );
        return `<article id="${anchorOf(g.type, e.frontmatter.id)}">
  <h3>${escape(name)}</h3>
  <div class="ref">${g.type}/${escape(e.frontmatter.id)}</div>
  ${paragraphs(escaped)}
</article>`;
      })
      .join('\n');
    sections.push(
      `<section><h2>${escape(g.label)}</h2>\n${entryHtml}</section>`
    );
  }

  const title = loaded.manifest.title ?? loaded.manifest.id;
  const html = `<!doctype html>
<html lang="${escape(loaded.manifest.language ?? 'en')}">
<head>
<meta charset="utf-8"/>
<title>${escape(title)} — Codex</title>
<style>
body { font-family: Georgia, serif; max-width: 48rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; color: #222; }
h1 { font-size: 2rem; }
h2 { margin-top: 3rem; border-bottom: 1px solid #ddd; padding-bottom: 0.25rem; }
article { margin: 1.5rem 0; padding: 0.75rem 1rem; background: #fafafa; border-left: 3px solid #c9a227; }
article h3 { margin: 0 0 0.25rem 0; }
.ref { color: #888; font-size: 0.85rem; font-family: ui-monospace, monospace; margin-bottom: 0.5rem; }
a { color: #6b4a00; }
</style>
</head>
<body>
<h1>${escape(title)} — Codex</h1>
<p><em>Generated ${new Date().toISOString().slice(0, 10)}</em></p>
${sections.join('\n')}
</body>
</html>
`;
  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await fs.writeFile(outFile, html, 'utf8');
}

/** Dump the entire loaded saga as JSON — same structure as `lw dump`. */
async function exportSagaJson(
  sagaPath: string,
  outFile: string
): Promise<void> {
  const loaded = await loadSaga(sagaPath);
  const payload = {
    saga: {
      root: loaded.root,
      id: loaded.manifest.id,
      title: loaded.manifest.title ?? null,
      author: loaded.manifest.author ?? null,
      language: loaded.manifest.language ?? null,
      default_calendar: loaded.manifest.default_calendar ?? null,
      tome_order: loaded.manifest.tome_order ?? [],
    },
    entries: loaded.entries.map((e) => ({
      type: e.frontmatter.type,
      id: e.frontmatter.id,
      name: e.frontmatter.name,
      relPath: e.relPath,
      frontmatter: e.frontmatter,
      body: e.body,
    })),
    tomes: loaded.tomes.map((t) => ({
      id: t.manifest.id,
      title: t.manifest.title ?? null,
      relPath: t.relPath,
      chapters: t.chapters.map((c) => ({
        slug: c.slug,
        relPath: c.relPath,
        meta: c.meta,
        body: c.body,
      })),
    })),
    threads: loaded.threads,
    calendars: loaded.calendars,
    traces: loaded.traces,
    exported_at: new Date().toISOString(),
  };
  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await fs.writeFile(outFile, JSON.stringify(payload, null, 2), 'utf8');
}

/**
 * Render the Lexicon as a slang cheat-sheet, grouped by language → slang-group.
 * Useful for handing to translators or printing for the desk. Each term shows
 * its definition, optional pronunciation, and which characters/locations are
 * known to use it (via `speaks` / `spoken_here`).
 */
async function exportSlangMd(sagaPath: string, outFile: string): Promise<void> {
  const loaded = await loadSaga(sagaPath);
  const terms = loaded.entries.filter((e) => e.frontmatter.type === 'term');
  const sigils = new Map<string, string>(
    loaded.entries
      .filter((e) => e.frontmatter.type === 'sigil')
      .map((e) => [e.frontmatter.id, e.frontmatter.name ?? e.frontmatter.id])
  );
  // Build "who speaks what" reverse lookup.
  const speakers = new Map<string, string[]>(); // sigil id -> ["character/aaron", ...]
  for (const e of loaded.entries) {
    const fm = e.frontmatter as unknown as Record<string, unknown>;
    const groups = (Array.isArray(fm.speaks) ? fm.speaks : []) as string[];
    const here = (
      Array.isArray(fm.spoken_here) ? fm.spoken_here : []
    ) as string[];
    for (const g of [...groups, ...here]) {
      if (typeof g !== 'string') continue;
      const arr = speakers.get(g) ?? [];
      arr.push(`${e.frontmatter.type}/${e.frontmatter.id}`);
      speakers.set(g, arr);
    }
  }

  // Group terms by (language || "Common") -> (slang_of || "_general")
  const byLang = new Map<string, Map<string, typeof terms>>();
  for (const t of terms) {
    const fm = t.frontmatter as unknown as Record<string, unknown>;
    const lang = (typeof fm.language === 'string' && fm.language) || 'Common';
    const group =
      (typeof fm.slang_of === 'string' && fm.slang_of) || '_general';
    if (!byLang.has(lang)) byLang.set(lang, new Map());
    const g = byLang.get(lang)!;
    if (!g.has(group)) g.set(group, []);
    g.get(group)!.push(t);
  }

  const lines: string[] = [];
  lines.push(
    `# ${loaded.manifest.title ?? loaded.manifest.id} — Slang & Lexicon\n`
  );
  lines.push(`*Generated ${new Date().toISOString().slice(0, 10)}*\n`);
  for (const [lang, groups] of [...byLang.entries()].sort()) {
    lines.push(`\n## ${lang}\n`);
    for (const [group, gTerms] of [...groups.entries()].sort()) {
      const sigilName =
        group === '_general' ? 'General terms' : sigils.get(group) ?? group;
      lines.push(`\n### ${sigilName}`);
      if (group !== '_general') {
        const who = speakers.get(group) ?? [];
        if (who.length) {
          lines.push(`*Spoken by:* ${who.map((w) => `\`${w}\``).join(', ')}\n`);
        }
      }
      gTerms.sort((a, b) =>
        (a.frontmatter.name ?? a.frontmatter.id).localeCompare(
          b.frontmatter.name ?? b.frontmatter.id
        )
      );
      for (const t of gTerms) {
        const fm = t.frontmatter as unknown as Record<string, unknown>;
        const name = t.frontmatter.name ?? t.frontmatter.id;
        const pron =
          typeof fm.pronunciation === 'string' ? ` /${fm.pronunciation}/` : '';
        const def =
          (typeof fm.definition === 'string' && fm.definition) ||
          t.body.split('\n').find((l) => l.trim()) ||
          '';
        lines.push(`- **${name}**${pron} — ${def.trim()}`);
        const examples = Array.isArray(fm.examples)
          ? (fm.examples as unknown[])
          : [];
        for (const ex of examples) {
          if (typeof ex === 'string') lines.push(`    - *"${ex}"*`);
        }
      }
    }
  }
  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await fs.writeFile(outFile, lines.join('\n') + '\n', 'utf8');
}
