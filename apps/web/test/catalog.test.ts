import { describe, expect, it } from "vitest";
import { buildCatalog, entrySummary } from "../src/lib/catalog.js";
import type {
  CanonDigestPayload,
  DumpEntry,
  DumpPayload,
} from "../src/lib/lw.js";

function entry(
  partial: Partial<DumpEntry> & Pick<DumpEntry, "type" | "id" | "name">,
): DumpEntry {
  return {
    type: partial.type,
    id: partial.id,
    name: partial.name,
    relPath: partial.relPath ?? `${partial.type}s/${partial.id}.md`,
    tags: partial.tags ?? [],
    inherits: partial.inherits ?? [],
    appears_in: partial.appears_in ?? null,
    status: partial.status ?? null,
    aliases: partial.aliases ?? [],
    body: partial.body ?? "",
    frontmatter: partial.frontmatter ?? {},
    properties: partial.properties ?? {},
    provenance: partial.provenance ?? {},
    inheritsChain: partial.inheritsChain ?? [],
  };
}

function payload(entries: DumpEntry[]): DumpPayload {
  return {
    entries,
    tomes: [],
    threads: [],
    calendars: [],
    traces: [],
    diagnostics: [],
    // `DumpPayload` has extra fields; cast since we only exercise .entries.
  } as unknown as DumpPayload;
}

const aaron = entry({
  type: "character",
  id: "aaron",
  name: "Aaron Stormrider",
  tags: ["northern-kingdom"],
  status: "canon",
  body: "Aaron is a weary soldier returning home after the long war.\nMore detail.",
});

describe("entrySummary", () => {
  it("uses the definition for term entries", () => {
    const e = entry({
      type: "term",
      id: "grukh",
      name: "grukh",
      frontmatter: { definition: "an old insult among northern soldiers" },
      body: "Lots of body text that should not win.",
    });
    expect(entrySummary(e)).toBe("an old insult among northern soldiers");
  });

  it("falls back to the first non-heading body line", () => {
    expect(entrySummary(aaron)).toMatch(/^Aaron is a weary soldier/);
  });

  it("truncates long summaries", () => {
    const long = "x".repeat(300);
    const e = entry({ type: "lore", id: "x", name: "X", body: long });
    const s = entrySummary(e)!;
    expect(s.endsWith("…")).toBe(true);
    expect(s.length).toBeLessThanOrEqual(201);
  });
});

describe("buildCatalog", () => {
  it("produces one entry per DumpEntry and collects sigil ids", () => {
    const sigil = entry({ type: "sigil", id: "northern-kingdom", name: "Northern Kingdom" });
    const cat = buildCatalog(payload([aaron, sigil]));
    expect(cat.entries).toHaveLength(2);
    expect(cat.sigils).toEqual(["northern-kingdom"]);
    const a = cat.entries.find((e) => e.id === "aaron")!;
    expect(a.name).toBe("Aaron Stormrider");
    expect(a.tags).toEqual(["northern-kingdom"]);
    expect(a.status).toBe("canon");
  });

  it("merges digest phone book + weave data when provided", () => {
    const digest: CanonDigestPayload = {
      schema: 1,
      sagaId: "example-saga",
      revision: "test",
      builtAt: "2026-01-01T00:00:00Z",
      counts: { entries: 1, threads: 0, tomes: 0 },
      phoneBook: [
        {
          ref: "@character/aaron",
          type: "character",
          id: "aaron",
          name: "Aaron Stormrider",
          aliases: ["Aaron", "the Stormrider"],
          tags: ["northern-kingdom"],
          relPath: "codex/characters/aaron.md",
          summary: "A weary soldier returning home.",
          status: "canon",
        },
      ],
      weaves: [
        {
          ref: "@character/aaron",
          inheritsChain: ["sigil:northern-kingdom"],
          properties: {
            allegiance: { value: "north", from: "sigil:northern-kingdom" },
            rank: { value: "captain", from: "own" },
          },
        },
      ],
      threads: [],
      tomes: [],
    };
    const cat = buildCatalog(payload([aaron]), digest);
    const a = cat.entries.find((e) => e.id === "aaron")!;
    expect(a.summary).toBe("A weary soldier returning home.");
    expect(a.aliases).toEqual(["Aaron", "the Stormrider"]);
    expect(a.inheritsChain).toEqual(["sigil:northern-kingdom"]);
    expect(a.properties).toEqual([
      { key: "allegiance", value: "north", from: "sigil:northern-kingdom" },
      { key: "rank", value: "captain", from: "own" },
    ]);
  });
});
