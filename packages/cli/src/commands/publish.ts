import {
  buildEntryIndex,
  extractReferences,
  loadSaga,
  resolve,
  summarizeSaga,
  validateSaga,
  type Saga,
} from '@loreweave/core';
import { promises as fs } from 'node:fs';
import path from 'node:path';

interface PublishOptions {
  out?: string;
  /** Include private entries (default false). */
  includePrivate?: boolean;
  /** Limit to a single tome (forwarded to validation + filters). */
  tome?: string;
  /** Print plan + counts but write nothing. */
  plan?: boolean;
  json?: boolean;
}

function isPrivate(fm: { visibility?: 'public' | 'private' }): boolean {
  return fm.visibility === 'private';
}

function filterSagaForPublish(saga: Saga, includePrivate: boolean): Saga {
  if (includePrivate) return saga;
  return {
    ...saga,
    entries: saga.entries.filter((e) => !isPrivate(e.frontmatter)),
  };
}

interface DumpEntry {
  type: string;
  id: string;
  name: string;
  relPath: string;
  tags: string[];
  inherits: string[];
  appears_in: string[] | null;
  status: string | null;
  visibility: 'public' | 'private';
  aliases: string[];
  body: string;
  frontmatter: unknown;
  properties: Record<string, unknown>;
  provenance: Record<string, unknown>;
  inheritsChain: string[];
}

function dumpEntries(saga: Saga): DumpEntry[] {
  const idx = buildEntryIndex(saga.entries);
  return saga.entries.map((e) => {
    const r = resolve(e, idx);
    return {
      type: e.frontmatter.type,
      id: e.frontmatter.id,
      name: e.frontmatter.name ?? e.frontmatter.id,
      relPath: e.relPath,
      tags: e.frontmatter.tags ?? [],
      inherits: e.frontmatter.inherits ?? [],
      appears_in: e.frontmatter.appears_in ?? null,
      status: e.frontmatter.status ?? null,
      visibility: e.frontmatter.visibility ?? 'public',
      aliases: e.frontmatter.aliases ?? [],
      body: e.body,
      frontmatter: e.frontmatter,
      properties: r.properties,
      provenance: r.provenance,
      inheritsChain: r.inheritsChain,
    };
  });
}

async function writeJson(out: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, JSON.stringify(data), 'utf8');
}

export async function publishCmd(
  sagaPath: string,
  opts: PublishOptions,
): Promise<void> {
  const loaded = await loadSaga(sagaPath);
  const filtered = filterSagaForPublish(loaded, !!opts.includePrivate);

  const skipped = loaded.entries.length - filtered.entries.length;
  const summary = summarizeSaga(filtered);
  const diagnostics = validateSaga(filtered, { tome: opts.tome ?? null });
  const errors = diagnostics.filter((d) => d.severity === 'error').length;

  const out = path.resolve(
    opts.out ?? path.join(sagaPath, '.loreweave', 'publish'),
  );

  const plan = {
    saga: loaded.manifest.id,
    out,
    publishedEntries: filtered.entries.length,
    skippedPrivate: skipped,
    diagnostics: { errors, warnings: diagnostics.length - errors },
    files: [
      'demo/dump.json',
      'demo/kinds.json',
      'demo/lenses.json',
      'demo/summary.json',
      'demo/diagnostics.json',
    ],
  };

  if (opts.plan) {
    if (opts.json) console.log(JSON.stringify(plan, null, 2));
    else {
      console.log(`publish plan for ${plan.saga}:`);
      console.log(`  out: ${plan.out}`);
      console.log(`  ${plan.publishedEntries} entries (skipping ${plan.skippedPrivate} private)`);
      console.log(`  diagnostics: ${plan.diagnostics.errors} errors, ${plan.diagnostics.warnings} warnings`);
      for (const f of plan.files) console.log(`  + ${f}`);
    }
    return;
  }

  if (errors > 0) {
    console.error(`refusing to publish: ${errors} validation error(s). Run \`lw audit\` first or use --include-private to bypass.`);
    process.exitCode = 1;
    return;
  }

  // Build the same JSON shape the GitHub Pages demo bake produces, plus
  // a summary + diagnostics file for hosted dashboards.
  const dumpPayload = {
    saga: {
      root: filtered.root,
      id: filtered.manifest.id ?? null,
      title: filtered.manifest.title ?? null,
      default_calendar: filtered.manifest.default_calendar ?? null,
      tome_order: filtered.manifest.tome_order ?? [],
    },
    entries: dumpEntries(filtered),
    tomes: filtered.tomes.map((t) => ({
      id: t.manifest.id,
      title: t.manifest.title ?? t.manifest.id,
      relPath: t.relPath,
      chapters: t.chapters.map((c) => ({
        slug: c.slug,
        title: c.meta.title ?? c.slug,
        ordinal: c.meta.ordinal ?? 0,
        relPath: c.relPath,
        body: c.body,
        meta: c.meta,
        refs: extractReferences(c.body),
      })),
    })),
    threads: filtered.threads,
    calendars: filtered.calendars,
    diagnostics,
  };

  const kindsPayload = filtered.kinds
    ? Array.from(filtered.kinds.byId.values()).map((k) => ({
        id: k.id,
        name: k.name,
        echoPrefix: k.echoPrefix,
        aliases: k.aliases,
        storage: k.storage,
        builtin: k.builtin,
        source: k.source,
        description: k.description,
        properties: k.properties,
        display: k.display,
      }))
    : [];

  // Mirror what `lw lenses --json` would emit. We don't have a public
  // helper for this, so read `<saga>/.loreweave/lenses/` if present.
  const lensesDir = path.join(sagaPath, '.loreweave', 'lenses');
  let lensesPayload: unknown[] = [];
  try {
    const files = await fs.readdir(lensesDir);
    const yamlMod = await import('yaml');
    for (const f of files) {
      if (!f.endsWith('.yaml') && !f.endsWith('.yml')) continue;
      const raw = await fs.readFile(path.join(lensesDir, f), 'utf8');
      lensesPayload.push(yamlMod.parse(raw));
    }
  } catch {
    // No lenses dir — leave empty.
  }

  await writeJson(path.join(out, 'demo', 'dump.json'), dumpPayload);
  await writeJson(path.join(out, 'demo', 'kinds.json'), kindsPayload);
  await writeJson(path.join(out, 'demo', 'lenses.json'), lensesPayload);
  await writeJson(path.join(out, 'demo', 'summary.json'), summary);
  await writeJson(path.join(out, 'demo', 'diagnostics.json'), diagnostics);

  if (opts.json) {
    console.log(JSON.stringify(plan, null, 2));
  } else {
    console.log(`published ${plan.publishedEntries} entries to ${out}`);
    if (skipped > 0) console.log(`  (skipped ${skipped} private)`);
    console.log(
      `next: copy a built web bundle (apps/web/dist/*) alongside ${path.join(out, 'demo')} and serve, or upload to GitHub Pages with VITE_LW_DEMO=1.`,
    );
  }
}
