import {
  buildEntryIndex,
  BUILTIN_GREGORIAN,
  extractReferences,
  loadSaga,
  resolve,
  validateSaga,
} from "@loreweave/core";

/**
 * Dump the entire Saga as one JSON blob so the desktop UI can load it in a
 * single call. Always emits JSON; no human-readable mode.
 */
export async function dumpCmd(
  saga: string,
  opts: { tome?: string },
): Promise<void> {
  const loaded = await loadSaga(saga);
  const idx = buildEntryIndex(loaded.entries);

  const entries = loaded.entries.map((e) => {
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
      aliases: e.frontmatter.aliases ?? [],
      body: e.body,
      frontmatter: e.frontmatter,
      properties: r.properties,
      provenance: r.provenance,
      inheritsChain: r.inheritsChain,
    };
  });

  const tomes = loaded.tomes.map((t) => ({
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
  }));

  const diagnostics = validateSaga(loaded, { tome: opts.tome ?? null });

  const notes = loaded.notes.map((n) => ({
    id: n.frontmatter.id,
    kind: n.frontmatter.kind,
    target: n.frontmatter.target ?? null,
    author: n.frontmatter.author ?? null,
    created: n.frontmatter.created ?? null,
    updated: n.frontmatter.updated ?? null,
    tags: n.frontmatter.tags ?? [],
    status: n.frontmatter.status,
    body: n.body,
    relPath: n.relPath,
  }));

  const payload = {
    saga: {
      root: loaded.root,
      id: loaded.manifest.id ?? null,
      title: loaded.manifest.title ?? null,
      default_calendar: loaded.manifest.default_calendar ?? null,
      tome_order: loaded.manifest.tome_order ?? [],
    },
    entries,
    tomes,
    threads: loaded.threads,
    calendars: [BUILTIN_GREGORIAN, ...loaded.calendars],
    notes,
    diagnostics,
  };

  console.log(JSON.stringify(payload));
}
