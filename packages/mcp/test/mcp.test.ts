import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  getSagaOverview,
  readEntry,
  scanSagaLooseEnds,
  getTimeline,
  queryCanon,
} from '../src/tools.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLE_SAGA = path.resolve(__dirname, '../../../sagas/example-saga');

describe('Loreweave MCP Tools', () => {
  it('loreweave_get_overview returns dense saga overview', async () => {
    const overview = await getSagaOverview(EXAMPLE_SAGA);
    expect(overview.saga.id).toBe('example-saga');
    expect(overview.characters.length).toBeGreaterThan(0);
    expect(overview.characters.some((c) => c.id === 'aaron')).toBe(true);
    expect(overview.locations.some((l) => l.id === 'vellmar')).toBe(true);
    expect(overview.tomes.length).toBeGreaterThan(0);
  });

  it('loreweave_read_entry reads aaron with weave and references', async () => {
    const entry = await readEntry('character/aaron', true, EXAMPLE_SAGA);
    expect(entry.ref).toBe('character/aaron');
    expect(entry.frontmatter.name).toBe('Aaron of Vellmar');
    expect(entry.weave).toBeDefined();
    expect(entry.incomingReferencesCount).toBeGreaterThan(0);
  });

  it('loreweave_scan_loose_ends runs integrity scan on example saga', async () => {
    const report = await scanSagaLooseEnds(EXAMPLE_SAGA);
    expect(report).toBeDefined();
    expect(report.brokenReferences).toBeInstanceOf(Array);
    expect(report.orphanEntries).toBeInstanceOf(Array);
    expect(report.timelineIssues).toBeInstanceOf(Array);
  });

  it('loreweave_get_timeline returns linearized thread with waypoints', async () => {
    const timeline = await getTimeline('main', true, EXAMPLE_SAGA);
    expect(timeline.threadId).toBe('main');
    expect(timeline.waypoints.length).toBeGreaterThan(0);
    expect(timeline.waypoints[0]!.order).toBeDefined();
  });

  it('loreweave_query_canon filters entries by kind', async () => {
    const res = await queryCanon({ kind: 'character', sagaRoot: EXAMPLE_SAGA });
    expect(res.count).toBeGreaterThan(0);
    expect(res.entries.every((e) => e.type === 'character')).toBe(true);
  });
});
