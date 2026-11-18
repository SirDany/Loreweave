import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cp, mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { registerSidecar, type MiddlewareHost } from '../src/middleware.js';

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
    await new Promise<void>((resolve) => server?.close(() => resolve()));
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
});
