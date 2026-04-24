#!/usr/bin/env node
/**
 * Loreweave local launcher.
 *
 * Serves the pre-built web bundle (`apps/web/dist/`) and mounts the
 * HTTP sidecar on the same port. Intended as the single-command way to
 * run Loreweave as a desktop app without Vite.
 *
 * Usage:
 *   node scripts/launch.mjs [--port 4729] [--no-open]
 *
 * Requirements:
 *   - `pnpm build` has produced both:
 *       - packages/sidecar/dist/index.js
 *       - packages/cli/dist/bin.js
 *       - apps/web/dist/
 */
import { createServer } from 'node:http';
import { promises as fs, createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

const argv = process.argv.slice(2);
const portArg = argv.indexOf('--port');
const port = portArg >= 0 ? Number(argv[portArg + 1]) : 4729;
const open = !argv.includes('--no-open');

const distDir = path.join(repoRoot, 'apps', 'web', 'dist');
const cliBin = path.join(repoRoot, 'packages', 'cli', 'dist', 'bin.js');
const sidecarEntry = path.join(
  repoRoot,
  'packages',
  'sidecar',
  'dist',
  'index.js',
);

// Ensure prerequisite builds exist before we start.
for (const required of [distDir, cliBin, sidecarEntry]) {
  try {
    await fs.access(required);
  } catch {
    console.error(
      `\n✖ missing ${path.relative(repoRoot, required)}\n` +
        `  run \`pnpm install && pnpm -r build && pnpm --filter @loreweave/web build\` first.`,
    );
    process.exit(1);
  }
}

const { registerSidecar } = await import(sidecarEntry);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

const sidecarRoutes = [];
const host = {
  use(prefix, handler) {
    sidecarRoutes.push({ prefix, handler });
    return host;
  },
};
registerSidecar(host, { repoRoot, cliBin });

async function serveStatic(req, res) {
  let url = (req.url ?? '/').split('?')[0];
  if (url.endsWith('/')) url += 'index.html';
  const rel = url.replace(/^\/+/, '');
  const abs = path.join(distDir, rel);
  // Reject traversal attempts — keep everything under distDir.
  if (!abs.startsWith(distDir)) {
    res.statusCode = 403;
    res.end('forbidden');
    return;
  }
  try {
    const stat = await fs.stat(abs);
    if (stat.isDirectory()) {
      return serveFile(path.join(abs, 'index.html'), res);
    }
    return serveFile(abs, res);
  } catch {
    // SPA fallback — Vite builds a single index.html that handles routing.
    return serveFile(path.join(distDir, 'index.html'), res);
  }
}

function serveFile(abs, res) {
  const ext = path.extname(abs).toLowerCase();
  res.setHeader('content-type', MIME[ext] ?? 'application/octet-stream');
  res.setHeader('cache-control', 'no-cache');
  const stream = createReadStream(abs);
  stream.on('error', () => {
    res.statusCode = 500;
    res.end('read error');
  });
  stream.pipe(res);
}

const server = createServer((req, res) => {
  const pathname = (req.url ?? '').split('?')[0];
  const match = sidecarRoutes
    .filter(
      (r) => pathname === r.prefix || pathname.startsWith(r.prefix + '/'),
    )
    .sort((a, b) => b.prefix.length - a.prefix.length)[0];
  if (match) return match.handler(req, res);
  return serveStatic(req, res);
});

server.listen(port, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${port}`;
  console.log(`Loreweave is running at ${url}`);
  if (open) tryOpen(url);
});

function tryOpen(url) {
  const plat = process.platform;
  const cmd =
    plat === 'win32'
      ? 'cmd'
      : plat === 'darwin'
        ? 'open'
        : 'xdg-open';
  const args = plat === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    execFile(cmd, args, { windowsHide: true }, () => {});
  } catch {
    /* best effort */
  }
}
