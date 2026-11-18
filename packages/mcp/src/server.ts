import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  getSagaOverview,
  readEntry,
  upsertEntry,
  deleteEntry,
  renameEntry,
  scanSagaLooseEnds,
  readChapter,
  writeChapter,
  getTimeline,
  addTraceNote,
  queryCanon,
} from './tools.js';

export function createLoreweaveMcpServer(): McpServer {
  const server = new McpServer({
    name: 'loreweave',
    version: '0.1.0',
  });

  // 1. loreweave_get_overview
  server.tool(
    'loreweave_get_overview',
    'Get a dense, token-efficient phonebook overview of the entire saga (tomes, chapters, characters, locations, sigils, and threads). Use this first to orient yourself without reading dozens of raw files.',
    {
      sagaRoot: z
        .string()
        .optional()
        .describe('Optional path to saga directory (e.g. "sagas/example-saga"). Defaults to the active saga.'),
    },
    async ({ sagaRoot }) => {
      try {
        const result = await getSagaOverview(sagaRoot);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Error getting saga overview: ${(err as Error).message}` }],
        };
      }
    }
  );

  // 2. loreweave_read_entry
  server.tool(
    'loreweave_read_entry',
    'Read a codex/lexicon/sigil entry by reference (e.g. "character/aaron", "@character/aaron"). Returns frontmatter, resolved inheritance weave, body markdown, and incoming/outgoing references.',
    {
      ref: z.string().describe('Reference like "character/aaron" or "@character/aaron" or "[Aaron](@char-aaron)".'),
      resolveWeave: z.boolean().optional().default(true).describe('Whether to resolve inherited Sigil properties.'),
      sagaRoot: z.string().optional().describe('Optional saga directory root.'),
    },
    async ({ ref, resolveWeave, sagaRoot }) => {
      try {
        const result = await readEntry(ref, resolveWeave, sagaRoot);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Error reading entry "${ref}": ${(err as Error).message}` }],
        };
      }
    }
  );

  // 3. loreweave_upsert_entry
  server.tool(
    'loreweave_upsert_entry',
    'Create or update a canon entry (character, location, concept, lore, waypoint, term, sigil). Automatically enforces YAML frontmatter formatting, generates clean kebab-case IDs from names, and places files in the correct directory layout.',
    {
      kind: z
        .enum(['character', 'location', 'concept', 'lore', 'waypoint', 'term', 'sigil'])
        .describe('Kind of canon entry.'),
      name: z.string().describe('Human readable name (e.g. "Aaron of Vellmar", "Northern Slang").'),
      id: z.string().optional().describe('Optional kebab-case ID (auto-derived from name if omitted).'),
      properties: z.record(z.string(), z.unknown()).optional().describe('Arbitrary key-value properties (e.g. age, appearance, role).'),
      aliases: z.array(z.string()).optional().describe('Alternative names or aliases.'),
      tags: z.array(z.string()).optional().describe('Sigil IDs labelling this entry.'),
      inherits: z.array(z.string()).optional().describe('Sigil IDs this entry inherits properties from.'),
      overrides: z.record(z.string(), z.unknown()).optional().describe('Properties that override inherited values.'),
      speaks: z.array(z.string()).optional().describe('For characters: Slang-group Sigil IDs this character speaks.'),
      spoken_here: z.array(z.string()).optional().describe('For locations: Slang-group Sigil IDs spoken here.'),
      definition: z.string().optional().describe('For terms: Glossary definition.'),
      pronunciation: z.string().optional().describe('For terms: IPA pronunciation.'),
      examples: z.array(z.string()).optional().describe('For terms: Example usage sentences.'),
      slang_of: z.string().optional().describe('For terms: Slang-group Sigil ID this term belongs to.'),
      body: z.string().optional().describe('Markdown body notes (e.g. Concept, Voice, Background).'),
      status: z.enum(['draft', 'canon']).optional().default('canon'),
      sagaRoot: z.string().optional().describe('Optional saga directory root.'),
    },
    async (params) => {
      try {
        const result = await upsertEntry(params);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Error upserting entry: ${(err as Error).message}` }],
        };
      }
    }
  );

  // 4. loreweave_delete_entry
  server.tool(
    'loreweave_delete_entry',
    'Delete a canon entry. The framework automatically scans the entire saga (all chapters, entries, notes, and threads) for mentions, surfaces all remaining references, and writes an audit note to prevent dangling loose ends.',
    {
      ref: z.string().describe('Reference to delete (e.g. "character/aaron").'),
      createAuditNote: z
        .boolean()
        .optional()
        .default(true)
        .describe('Automatically log an audit note under notes/ if remaining references are found.'),
      sagaRoot: z.string().optional().describe('Optional saga directory root.'),
    },
    async ({ ref, createAuditNote, sagaRoot }) => {
      try {
        const result = await deleteEntry(ref, createAuditNote, sagaRoot);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Error deleting entry "${ref}": ${(err as Error).message}` }],
        };
      }
    }
  );

  // 5. loreweave_cascade_rename
  server.tool(
    'loreweave_cascade_rename',
    'Rename an entry ID and/or name, and automatically rewrite all references ([Display](@type/oldId) and @type/oldId) across all chapters, notes, other entries, and threads.',
    {
      ref: z.string().describe('Current reference (e.g. "character/old-name").'),
      newId: z.string().describe('New kebab-case ID (e.g. "new-name").'),
      newName: z.string().optional().describe('Optional updated display name.'),
      sagaRoot: z.string().optional().describe('Optional saga directory root.'),
    },
    async ({ ref, newId, newName, sagaRoot }) => {
      try {
        const result = await renameEntry(ref, newId, newName, sagaRoot);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Error renaming entry: ${(err as Error).message}` }],
        };
      }
    }
  );

  // 6. loreweave_scan_loose_ends
  server.tool(
    'loreweave_scan_loose_ends',
    'Run a complete integrity check across the entire saga: scans for broken references (links to nonexistent entities), orphan entries (canon elements never referenced in any chapter, note, or entry), unlinked waypoints, and timeline contradictions.',
    {
      sagaRoot: z.string().optional().describe('Optional saga directory root.'),
    },
    async ({ sagaRoot }) => {
      try {
        const result = await scanSagaLooseEnds(sagaRoot);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Error scanning loose ends: ${(err as Error).message}` }],
        };
      }
    }
  );

  // 7. loreweave_read_chapter
  server.tool(
    'loreweave_read_chapter',
    'Read chapter prose and metadata (_meta.yaml) by tome slug and chapter slug.',
    {
      tome: z.string().describe('Tome id or folder slug (e.g. "book-one").'),
      chapter: z.string().describe('Chapter slug (e.g. "01-arrival").'),
      sagaRoot: z.string().optional().describe('Optional saga directory root.'),
    },
    async ({ tome, chapter, sagaRoot }) => {
      try {
        const result = await readChapter(tome, chapter, sagaRoot);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Error reading chapter: ${(err as Error).message}` }],
        };
      }
    }
  );

  // 8. loreweave_write_chapter
  server.tool(
    'loreweave_write_chapter',
    'Write or update chapter prose. Automatically validates references in the written text against canon, reporting any newly introduced broken references.',
    {
      tome: z.string().describe('Tome id or folder slug (e.g. "book-one").'),
      chapter: z.string().describe('Chapter slug (e.g. "01-arrival").'),
      body: z.string().describe('Full markdown prose for the chapter.'),
      meta: z
        .record(z.string(), z.unknown())
        .optional()
        .describe('Optional updated metadata (title, ordinal, pov, linked_events).'),
      sagaRoot: z.string().optional().describe('Optional saga directory root.'),
    },
    async ({ tome, chapter, body, meta, sagaRoot }) => {
      try {
        const result = await writeChapter(tome, chapter, body, meta, sagaRoot);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Error writing chapter: ${(err as Error).message}` }],
        };
      }
    }
  );

  // 9. loreweave_get_timeline
  server.tool(
    'loreweave_get_timeline',
    'Get a linearized chronological sequence of waypoints for a thread, including calendar dates, relative ordering constraints, branches, and contradiction detection.',
    {
      threadId: z.string().optional().default('main').describe('Thread id (defaults to "main").'),
      withBranches: z.boolean().optional().default(true).describe('Include waypoints from parent branches.'),
      sagaRoot: z.string().optional().describe('Optional saga directory root.'),
    },
    async ({ threadId, withBranches, sagaRoot }) => {
      try {
        const result = await getTimeline(threadId, withBranches, sagaRoot);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Error getting timeline: ${(err as Error).message}` }],
        };
      }
    }
  );

  // 10. loreweave_add_trace_note
  server.tool(
    'loreweave_add_trace_note',
    'Log an idea, todo, question, or remark to the saga traces/board notes.',
    {
      title: z.string().describe('Short note title.'),
      body: z.string().describe('Note markdown content.'),
      kind: z.enum(['idea', 'todo', 'remark', 'question']).optional().default('idea'),
      targetRef: z.string().optional().describe('Optional entity or chapter reference this note relates to.'),
      sagaRoot: z.string().optional().describe('Optional saga directory root.'),
    },
    async ({ title, body, kind, targetRef, sagaRoot }) => {
      try {
        const result = await addTraceNote(title, body, kind, targetRef, sagaRoot);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Error adding note: ${(err as Error).message}` }],
        };
      }
    }
  );

  // 11. loreweave_query_canon
  server.tool(
    'loreweave_query_canon',
    'Search and filter canon entries by kind, tags/sigils, status, or search query.',
    {
      query: z.string().optional().describe('Search text across names, IDs, and bodies.'),
      kind: z.string().optional().describe('Filter by kind (character, location, concept, etc.).'),
      tag: z.string().optional().describe('Filter by Sigil tag ID.'),
      status: z.string().optional().describe('Filter by status ("draft" or "canon").'),
      sagaRoot: z.string().optional().describe('Optional saga directory root.'),
    },
    async (params) => {
      try {
        const result = await queryCanon(params);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Error querying canon: ${(err as Error).message}` }],
        };
      }
    }
  );

  return server;
}
