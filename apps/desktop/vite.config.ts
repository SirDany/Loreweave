import react from '@vitejs/plugin-react';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');
const CLI_BIN = path.join(REPO_ROOT, 'packages/cli/dist/bin.js');

/**
 * Dev-only middleware that lets the webview invoke the `lw` CLI without Tauri.
 * POST /lw with { args: string[] } → { stdout, stderr, code }.
 * POST /lw/write with { sagaRoot, relPath, content } → 204 on success.
 * When Tauri is present the client uses the real `lw_invoke` / `lw_write`
 * commands instead.
 */
function lwSidecar(): Plugin {
  return {
    name: 'loreweave-lw-sidecar',
    configureServer(server) {
      server.middlewares.use('/lw/write', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('method not allowed');
          return;
        }
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', async () => {
          try {
            const { sagaRoot, relPath, content } = JSON.parse(body || '{}');
            if (
              typeof sagaRoot !== 'string' ||
              typeof relPath !== 'string' ||
              typeof content !== 'string'
            ) {
              throw new Error('sagaRoot, relPath, content required');
            }
            const safe = safeJoin(
              path.isAbsolute(sagaRoot)
                ? sagaRoot
                : path.join(REPO_ROOT, sagaRoot),
              relPath,
            );
            await fs.mkdir(path.dirname(safe), { recursive: true });
            await fs.writeFile(safe, content, 'utf8');
            res.statusCode = 204;
            res.end();
          } catch (e) {
            res.statusCode = 400;
            res.end(String(e));
          }
        });
      });
      server.middlewares.use('/lw', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('method not allowed');
          return;
        }
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          let args: string[] = [];
          try {
            const parsed = JSON.parse(body || '{}');
            if (!Array.isArray(parsed.args))
              throw new Error('args must be an array');
            args = parsed.args;
          } catch (e) {
            res.statusCode = 400;
            res.end(String(e));
            return;
          }
          const child = spawn('node', [CLI_BIN, ...args], {
            cwd: REPO_ROOT,
          });
          let stdout = '';
          let stderr = '';
          child.stdout.on('data', (c) => (stdout += c));
          child.stderr.on('data', (c) => (stderr += c));
          child.on('error', (err) => {
            res.statusCode = 500;
            res.end(String(err));
          });
          child.on('close', (code) => {
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ stdout, stderr, code: code ?? -1 }));
          });
        });
      });
    },
  };
}

function safeJoin(root: string, rel: string): string {
  if (rel.includes('..'))
    throw new Error("relative path must not contain '..'");
  const normalizedRoot = path.resolve(root);
  const joined = path.resolve(normalizedRoot, rel);
  if (
    !joined.startsWith(normalizedRoot + path.sep) &&
    joined !== normalizedRoot
  ) {
    throw new Error(
      `path escape detected: ${joined} is outside ${normalizedRoot}`,
    );
  }
  return joined;
}

export default defineConfig({
  plugins: [react(), lwSidecar()],
  resolve: {
    alias: {
      '@': path.resolve(HERE, './src'),
    },
  },
});

export default defineConfig({
  plugins: [react(), lwSidecar()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (
            id.includes('@codemirror') ||
            id.includes('@lezer') ||
            id.includes('codemirror')
          ) {
            return 'codemirror';
          }
          if (
            id.includes('react-dom') ||
            id.includes('/react/') ||
            id.includes('scheduler')
          ) {
            return 'react';
          }
          if (id.includes('yaml')) return 'yaml';
        },
      },
    },
  },
});
