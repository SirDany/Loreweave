import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { registerSidecar, type MiddlewareHost } from '../src/middleware.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const exampleSaga = path.resolve(here, '../../../sagas/example-saga');

function makeHost(): {
  host: MiddlewareHost;
  server: Server;
  port: Promise<number>;
} {
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

describe('sidecar /lw/continuity', () => {
  let dir: string;
  let saga: string;
  let server: Server | null = null;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'lw-continuity-'));
    saga = path.join(dir, 'saga');
    await cp(exampleSaga, saga, { recursive: true });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = null;
    await rm(dir, { recursive: true, force: true });
  });

  it('returns summary + diagnostics totals', async () => {
    const h = makeHost();
    server = h.server;
    registerSidecar(h.host, { repoRoot: dir, cliBin: '/nonexistent/bin.js' });
    const port = await h.port;

    const url = `http://127.0.0.1:${port}/lw/continuity?sagaRoot=${encodeURIComponent(saga)}`;
    const res = await fetch(url);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      summary: { totals: { entries: number } };
      diagnostics: { errors: number; warnings: number; sample: unknown[] };
    };
    expect(body.summary.totals.entries).toBeGreaterThan(0);
    expect(body.diagnostics.errors).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(body.diagnostics.sample)).toBe(true);
  });

  it('rejects missing sagaRoot with 400', async () => {
    const h = makeHost();
    server = h.server;
    registerSidecar(h.host, { repoRoot: dir, cliBin: '/nonexistent/bin.js' });
    const port = await h.port;
    const res = await fetch(`http://127.0.0.1:${port}/lw/continuity`);
    expect(res.status).toBe(400);
  });
});

describe('sidecar /lw/refs/extract', () => {
  let dir: string;
  let saga: string;
  let server: Server | null = null;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'lw-refs-extract-'));
    saga = path.join(dir, 'saga');
    await cp(exampleSaga, saga, { recursive: true });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = null;
    await rm(dir, { recursive: true, force: true });
  });

  it('returns echoes/dangling/proposed for prose', async () => {
    const h = makeHost();
    server = h.server;
    registerSidecar(h.host, { repoRoot: dir, cliBin: '/nonexistent/bin.js' });
    const port = await h.port;

    // Prose mentions Aaron by linked echo + by name (no echo) and a fake ref.
    const text = 'Aaron arrived. @character/aaron drew his sword. @character/ghostly-fake fled.';
    const res = await fetch(`http://127.0.0.1:${port}/lw/refs/extract`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sagaRoot: saga, text }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      echoes: Array<{ type: string; id: string }>;
      dangling: Array<{ type: string; id: string }>;
      proposed: Array<{ type: string; id: string; match: string }>;
    };
    expect(body.echoes.some((r) => r.id === 'aaron')).toBe(true);
    expect(body.dangling.some((r) => r.id === 'ghostly-fake')).toBe(true);
    // The "Aaron" name mention should not produce a *new* proposal because
    // it's already linked elsewhere in the text.
    expect(body.proposed.find((p) => p.id === 'aaron')).toBeUndefined();
  });

  it('rejects bad payloads with 400', async () => {
    const h = makeHost();
    server = h.server;
    registerSidecar(h.host, { repoRoot: dir, cliBin: '/nonexistent/bin.js' });
    const port = await h.port;
    const res = await fetch(`http://127.0.0.1:${port}/lw/refs/extract`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(400);
  });
});
