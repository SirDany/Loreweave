import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { registerSidecar } from '@loreweave/sidecar';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');
const CLI_BIN = path.join(REPO_ROOT, 'packages/cli/dist/bin.js');

/**
 * Dev-only Vite plugin that mounts the Loreweave HTTP sidecar onto Vite's
 * connect middleware stack. All routes live in `@loreweave/sidecar` so the
 * same module can back a Tauri desktop bundle or a standalone launcher.
 */
function lwSidecar(): Plugin {
  return {
    name: 'loreweave-lw-sidecar',
    configureServer(server) {
      const handle = registerSidecar(server.middlewares, {
        repoRoot: REPO_ROOT,
        cliBin: CLI_BIN,
      });
      server.httpServer?.on('close', () => handle.close());
    },
  };
}

export default defineConfig({
  base: process.env.LW_WEB_BASE ?? '/',
  plugins: [react(), lwSidecar()],
  resolve: {
    alias: {
      '@': path.resolve(HERE, './src'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: false,
    fs: {
      allow: [REPO_ROOT],
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
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