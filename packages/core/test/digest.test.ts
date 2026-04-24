import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildDigest, renderPhoneBook } from '../src/digest.js';
import { loadSaga } from '../src/loader.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLE_SAGA = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'sagas',
  'example-saga',
);

describe('canon digest', () => {
  it('builds a phone book covering every entry', async () => {
    const saga = await loadSaga(EXAMPLE_SAGA);
    const digest = buildDigest(saga, { revision: 'deadbee' });
    expect(digest.version).toBe(1);
    expect(digest.revision).toBe('deadbee');
    expect(digest.counts.entries).toBe(saga.entries.length);
    expect(digest.phoneBook).toHaveLength(saga.entries.length);

    // Every entry in the phone book should round-trip to a known ref.
    const knownRefs = new Set(
      saga.entries.map((e) => `@${e.frontmatter.type}/${e.frontmatter.id}`),
    );
    for (const p of digest.phoneBook) {
      expect(knownRefs.has(p.ref)).toBe(true);
    }
  });

  it('materializes inherited Sigil properties in the weave cache', async () => {
    const saga = await loadSaga(EXAMPLE_SAGA);
    const digest = buildDigest(saga);
    // Aaron (character) inherits from at least one Sigil in the example saga.
    const aaron = digest.weaves.find((w) => w.ref === '@character/aaron');
    expect(aaron).toBeDefined();
    expect(aaron!.inheritsChain.length).toBeGreaterThan(0);
  });

  it('renders the phone book as markdown', async () => {
    const saga = await loadSaga(EXAMPLE_SAGA);
    const md = renderPhoneBook(buildDigest(saga));
    expect(md).toMatch(/^\| Ref \| Name \| Type \| Summary \|/m);
    expect(md).toContain('`@character/aaron`');
  });

  it('produces thread summaries with linearized waypoints', async () => {
    const saga = await loadSaga(EXAMPLE_SAGA);
    const digest = buildDigest(saga);
    expect(digest.threads.length).toBeGreaterThan(0);
    const main = digest.threads.find((t) => t.id === 'main');
    expect(main).toBeDefined();
    expect(main!.waypoints.length).toBeGreaterThan(0);
  });
});
