import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cp, mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { registerSidecar, compactToolResultForModel, type MiddlewareHost } from '../src/middleware.js';
import { runTool } from '../src/tools.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const exampleSaga = path.resolve(here, '../../../sagas/example-saga');
const cliBin = path.resolve(here, '../../cli/dist/bin.js');

/**
 * Minimal connect-style host backed by Node's http server. Routes by exact
 * path prefix so `/lw/digest` doesn't get swallowed by `/lw`.
 */
function makeHost(): { host: MiddlewareHost; server: Server; port: Promise<number> } {
  const routes: Array<{
    prefix: string;
    handler: (req: any, res: any) => unknown;
  }> = [];
  const host: MiddlewareHost = {
    use(prefix, handler) {
      routes.push({ prefix, handler });
      return host;
    },
  };
  const server = createServer((req, res) => {
    const url = req.url ?? '';
    // Longest-prefix match so `/lw/digest` wins over `/lw`.
    const pathname = url.split('?')[0] ?? '';
    const match = routes
      .filter((r) => pathname === r.prefix || pathname.startsWith(r.prefix + '/'))
      .sort((a, b) => b.prefix.length - a.prefix.length)[0];
    if (!match) {
      res.statusCode = 404;
      res.end('not found');
      return;
    }
    match.handler(req, res);
  });
  const port = new Promise<number>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') resolve(addr.port);
    });
  });
  return { host, server, port };
}

describe('sidecar /lw/digest', () => {
  let dir: string;
  let saga: string;
  let server: Server | null = null;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'lw-digest-http-'));
    saga = path.join(dir, 'saga');
    await cp(exampleSaga, saga, { recursive: true });
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
    server = null;
    await rm(dir, { recursive: true, force: true });
  });

  it('returns the cached digest as JSON', async () => {
    const h = makeHost();
    server = h.server;
    registerSidecar(h.host, { repoRoot: dir, cliBin: '/nonexistent/bin.js' });
    const port = await h.port;

    const url = `http://127.0.0.1:${port}/lw/digest?sagaRoot=${encodeURIComponent(saga)}`;
    const res = await fetch(url);
    expect(res.status).toBe(200);
    const digest = (await res.json()) as {
      phoneBook: Array<{ ref: string }>;
      revision: string;
      counts: { entries: number };
    };
    expect(digest.phoneBook.length).toBeGreaterThan(0);
    expect(digest.revision).toBeTruthy();
    expect(digest.phoneBook.some((e) => e.ref === '@character/aaron')).toBe(true);
  });

  it('rejects missing sagaRoot with 400', async () => {
    const h = makeHost();
    server = h.server;
    registerSidecar(h.host, { repoRoot: dir, cliBin: '/nonexistent/bin.js' });
    const port = await h.port;
    const res = await fetch(`http://127.0.0.1:${port}/lw/digest`);
    expect(res.status).toBe(400);
  });

  it('POST /lw/ingest stages base64-uploaded files via lw ingest', async () => {
    const h = makeHost();
    server = h.server;
    registerSidecar(h.host, { repoRoot: dir, cliBin });
    const port = await h.port;

    const contentBase64 = Buffer.from('# Notes\n\nCharacter: Lyra.\n', 'utf8').toString('base64');
    const res = await fetch(`http://127.0.0.1:${port}/lw/ingest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sagaRoot: saga,
        label: 'test-batch',
        files: [
          {
            name: 'notes.md',
            relPath: 'folder/notes.md',
            contentBase64,
          },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      manifest: {
        batchId: string;
        files: Array<{ source: string; staged: string; size: number }>;
      };
    };
    expect(json.ok).toBe(true);
    expect(json.manifest.files).toHaveLength(1);
    const stagedText = await readFile(json.manifest.files[0]!.staged, 'utf8');
    expect(stagedText).toContain('Lyra');
  });

  it('POST /lw/import-upload writes a base64 archive to a temp zip file', async () => {
    const h = makeHost();
    server = h.server;
    registerSidecar(h.host, { repoRoot: dir, cliBin });
    const port = await h.port;

    const payload = Buffer.from('PK\x03\x04dummy-zip-bytes', 'binary');
    const res = await fetch(`http://127.0.0.1:${port}/lw/import-upload`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: '../evil/bundle.zip',
        contentBase64: payload.toString('base64'),
      }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; zipPath: string };
    expect(json.ok).toBe(true);
    expect(path.basename(json.zipPath)).toBe('bundle.zip');
    try {
      const written = await readFile(json.zipPath);
      expect(written.equals(payload)).toBe(true);
    } finally {
      await rm(path.dirname(json.zipPath), { recursive: true, force: true });
    }
  });

  it('POST /lw/saga-delete deletes a valid saga directory and rejects non-sagas', async () => {
    const h = makeHost();
    server = h.server;
    registerSidecar(h.host, { repoRoot: dir, cliBin });
    const port = await h.port;

    const notASaga = path.join(dir, 'plain-dir');
    await mkdir(notASaga, { recursive: true });
    const badRes = await fetch(`http://127.0.0.1:${port}/lw/saga-delete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sagaRoot: notASaga }),
    });
    expect(badRes.status).toBe(400);

    const rootRes = await fetch(`http://127.0.0.1:${port}/lw/saga-delete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sagaRoot: dir }),
    });
    expect(rootRes.status).toBe(400);

    const okRes = await fetch(`http://127.0.0.1:${port}/lw/saga-delete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sagaRoot: saga }),
    });
    expect(okRes.status).toBe(200);
    const json = (await okRes.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
    const stillExists = await stat(saga).catch(() => null);
    expect(stillExists).toBeNull();
  });

  it('POST /lw/saga-create scaffolds a valid saga, rejects duplicates with 409, and deletes cleanly', async () => {
    const h = makeHost();
    server = h.server;
    registerSidecar(h.host, { repoRoot: dir, cliBin });
    const port = await h.port;

    const createRes = await fetch(`http://127.0.0.1:${port}/lw/saga-create`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'The Starlit Reach',
        parentDir: 'sagas',
        tomeTitle: 'First Star',
      }),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as {
      ok: boolean;
      path: string;
      id: string;
      title: string;
    };
    expect(created.ok).toBe(true);
    expect(created.id).toBe('the-starlit-reach');
    expect(created.title).toBe('The Starlit Reach');

    const manifest = await readFile(path.join(created.path, 'saga.yaml'), 'utf8');
    expect(manifest).toContain('id: the-starlit-reach');
    expect((await stat(path.join(created.path, 'calendars', 'gregorian.yaml'))).isFile()).toBe(true);
    expect((await stat(path.join(created.path, 'threads', 'main.yaml'))).isFile()).toBe(true);
    expect((await stat(path.join(created.path, 'tomes', 'first-star', 'tome.yaml'))).isFile()).toBe(true);
    expect((await stat(path.join(created.path, 'tomes', 'first-star', 'story', '01-opening', 'chapter.md'))).isFile()).toBe(true);

    const dupRes = await fetch(`http://127.0.0.1:${port}/lw/saga-create`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'The Starlit Reach',
        parentDir: 'sagas',
        tomeTitle: 'First Star',
      }),
    });
    expect(dupRes.status).toBe(409);

    const delRes = await fetch(`http://127.0.0.1:${port}/lw/saga-delete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sagaRoot: created.path }),
    });
    expect(delRes.status).toBe(200);
    const gone = await stat(created.path).catch(() => null);
    expect(gone).toBeNull();
  });

  it('runTool propose_new_entry normalizes singular folders and code-fenced entries', async () => {
    const res = await runTool(
      'propose_new_entry',
      {
        sagaRoot: saga,
        relPath: 'codex/character/new-ai.md',
        content: '```markdown\n---\n# New AI\n\n- **Type:** character\n- **Status:** draft\n```',
      },
      {
        repoRoot: dir,
        cliBin,
        defaultSagaRoot: saga,
        safeJoin: (root, rel) => path.resolve(root, rel),
      },
    );
    expect(res.ok).toBe(true);
    const data = res.data as { relPath: string; content: string };
    expect(data.relPath).toBe('codex/characters/new-ai.md');
    expect(data.content.startsWith('---\nid: new-ai\ntype: character\n')).toBe(true);
    expect(data.content).not.toContain('```markdown');
  });

  it('runTool lw_list_entries handles all/plural aliases and lw_weave returns exists: false on missing sigils', async () => {
    const toolCtx = {
      repoRoot: dir,
      cliBin,
      defaultSagaRoot: saga,
      safeJoin: (root: string, rel: string) => path.resolve(root, rel),
    };

    const allRes = await runTool('lw_list_entries', { sagaRoot: saga, type: 'all' }, toolCtx);
    expect(allRes.ok).toBe(true);
    const allRows = allRes.data as Array<{ type: string; id: string; name: string }>;
    expect(allRows.length).toBeGreaterThan(0);

    const charRes = await runTool('lw_list_entries', { sagaRoot: saga, type: 'characters' }, toolCtx);
    expect(charRes.ok).toBe(true);
    const charRows = charRes.data as Array<{ type: string; id: string; name: string }>;
    expect(charRows.length).toBeGreaterThan(0);
    expect(charRows.every((r) => r.type === 'character')).toBe(true);

    const weaveRes = await runTool('lw_weave', { sagaRoot: saga, ref: '@sigil/nonexistent' }, toolCtx);
    expect(weaveRes.ok).toBe(true);
    const weaveData = weaveRes.data as { exists: boolean; ref: string; message: string };
    expect(weaveData.exists).toBe(false);
    expect(weaveData.ref).toBe('sigil/nonexistent');
  });

  it('runTool read_file respects maxChars and provides truncation paging metadata', async () => {
    const toolCtx = {
      repoRoot: dir,
      cliBin,
      defaultSagaRoot: saga,
      safeJoin: (root: string, rel: string) => path.resolve(root, rel),
    };

    // Create a large mock markdown document (e.g., 20KB, 200 lines)
    const largeDocPath = path.resolve(saga, 'codex/lore/large-chronicle.md');
    await mkdir(path.dirname(largeDocPath), { recursive: true });
    const paragraph = 'The deep void hummed with resonant energy across distant sectors.\n';
    const largeText = paragraph.repeat(300); // ~20,000 characters
    const fs = await import('node:fs/promises');
    await fs.writeFile(largeDocPath, largeText, 'utf8');

    // Call read_file with default maxChars (8000)
    const readRes = await runTool(
      'read_file',
      { sagaRoot: saga, relPath: 'codex/lore/large-chronicle.md' },
      toolCtx,
    );
    expect(readRes.ok).toBe(true);
    const data = readRes.data as {
      totalLines: number;
      totalChars: number;
      returnedChars: number;
      startLine: number;
      endLine: number;
      hasMore: boolean;
      nextStartLine?: number;
      isTruncated: boolean;
      content: string;
    };

    expect(data.isTruncated).toBe(true);
    expect(data.hasMore).toBe(true);
    expect(data.nextStartLine).toBe(data.endLine + 1);
    expect(data.returnedChars).toBeLessThanOrEqual(8500);
    expect(data.content).toContain('[Loreweave: Content truncated at line');
    expect(data.content).toContain(`startLine: ${data.nextStartLine}`);

    // Read the next chunk starting at nextStartLine
    const chunk2 = await runTool(
      'read_file',
      {
        sagaRoot: saga,
        relPath: 'codex/lore/large-chronicle.md',
        startLine: data.nextStartLine,
      },
      toolCtx,
    );
    expect(chunk2.ok).toBe(true);
    const data2 = chunk2.data as typeof data;
    expect(data2.startLine).toBe(data.nextStartLine);
    expect(data2.startLine).toBeGreaterThan(1);
  });

  it('compactToolResultForModel strips full content and diffs while preserving metadata', () => {
    const rawNewProposal = {
      ok: true,
      data: {
        kind: 'new',
        sagaRoot: 'sagas/example',
        relPath: 'codex/characters/aaron.md',
        content: '# Aaron\n\n'.repeat(500), // Huge 4KB payload
        original: '',
        diff: '+# Aaron\n'.repeat(500),
      },
    };

    const compacted = compactToolResultForModel('propose_new_entry', rawNewProposal) as {
      ok: boolean;
      data: { kind: string; relPath: string; message: string; content?: unknown; diff?: unknown };
    };

    expect(compacted.ok).toBe(true);
    expect(compacted.data.kind).toBe('new');
    expect(compacted.data.relPath).toBe('codex/characters/aaron.md');
    expect(compacted.data.content).toBeUndefined();
    expect(compacted.data.diff).toBeUndefined();
    expect(compacted.data.message).toContain('Proposal for new entry');

    const rawEditProposal = {
      ok: true,
      data: {
        kind: 'edit',
        sagaRoot: 'sagas/example',
        relPath: 'codex/characters/aaron.md',
        original: 'old content',
        next: 'new content',
        diff: '--- old\n+++ new',
      },
    };

    const compactedEdit = compactToolResultForModel('propose_edit', rawEditProposal) as {
      ok: boolean;
      data: { kind: string; relPath: string; message: string; diff?: unknown };
    };
    expect(compactedEdit.ok).toBe(true);
    expect(compactedEdit.data.kind).toBe('edit');
    expect(compactedEdit.data.diff).toBeUndefined();
  });
});
