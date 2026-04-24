import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { registerSidecar, type MiddlewareHost } from '../src/middleware.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const exampleSaga = path.resolve(here, '../../../sagas/example-saga');

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
});
