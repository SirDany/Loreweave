#!/usr/bin/env node
/**
 * Stage everything the desktop bundle needs into
 * `apps/desktop/src-tauri/resources/`. Tauri ships the contents of that
 * directory verbatim; the launcher (`scripts/launch.mjs`) is invoked at
 * runtime with `--root <resources-dir>` and expects this layout:
 *
 *   resources/
 *     scripts/launch.mjs
 *     apps/web/dist/           (already there if this script ran after build)
 *     packages/cli/dist/
 *     packages/sidecar/dist/
 *     packages/core/dist/      (sidecar resolves it via node_modules)
 *     node_modules/            (production-only deps for sidecar/cli/core)
 *     web/splash.html          (Tauri frontendDist)
 *     package.json             (synthetic, drives `npm install`)
 *
 * This is intentionally rsync-style copies, not symlinks — Tauri's bundler
 * dereferences resources at package time.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const resourcesRoot = path.join(
  repoRoot,
  'apps',
  'desktop',
  'src-tauri',
  'resources',
);

async function copyDir(src, dest) {
  await fs.rm(dest, { recursive: true, force: true });
  await fs.cp(src, dest, { recursive: true, dereference: true });
}

async function copyFile(src, dest) {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(src, dest);
}

async function readJson(p) {
  return JSON.parse(await fs.readFile(p, 'utf8'));
}

async function main() {
  const tasks = [
    ['apps/web/dist', 'apps/web/dist'],
    ['packages/cli/dist', 'packages/cli/dist'],
    ['packages/cli/package.json', 'packages/cli/package.json'],
    ['packages/sidecar/dist', 'packages/sidecar/dist'],
    ['packages/sidecar/package.json', 'packages/sidecar/package.json'],
    ['packages/core/dist', 'packages/core/dist'],
    ['packages/core/package.json', 'packages/core/package.json'],
    ['scripts/launch.mjs', 'scripts/launch.mjs'],
  ];

  for (const [from, to] of tasks) {
    const src = path.join(repoRoot, from);
    const dest = path.join(resourcesRoot, to);
    const stat = await fs.stat(src).catch(() => null);
    if (!stat) {
      throw new Error(
        `staging source missing: ${from} — run \`pnpm build:all\` first.`,
      );
    }
    if (stat.isDirectory()) {
      await copyDir(src, dest);
    } else {
      await copyFile(src, dest);
    }
    console.log(`staged ${from}`);
  }

  // Rewrite workspace:* refs inside the staged package.jsons so npm can
  // resolve the file: links we set up below.
  for (const pkg of ['core', 'cli', 'sidecar']) {
    const pj = path.join(resourcesRoot, 'packages', pkg, 'package.json');
    const data = await readJson(pj);
    for (const block of ['dependencies', 'optionalDependencies']) {
      if (!data[block]) continue;
      for (const [name, range] of Object.entries(data[block])) {
        if (typeof range === 'string' && range.startsWith('workspace:')) {
          // workspace:* / workspace:^ / workspace:~  →  file: link
          const target = name.startsWith('@loreweave/')
            ? `file:../${name.slice('@loreweave/'.length)}`
            : range;
          data[block][name] = target;
        }
      }
    }
    await fs.writeFile(pj, JSON.stringify(data, null, 2));
  }

  // Build a synthetic package.json that pulls in production deps from
  // core/cli/sidecar plus file: pointers for the workspace packages, then
  // run `npm install` against it. Yields a flat node_modules under
  // resources/ that resolves zod / yaml / ai / @ai-sdk/* / @loreweave/*
  // for the launcher.
  const corePkg = await readJson(
    path.join(resourcesRoot, 'packages/core/package.json'),
  );
  const cliPkg = await readJson(
    path.join(resourcesRoot, 'packages/cli/package.json'),
  );
  const sidecarPkg = await readJson(
    path.join(resourcesRoot, 'packages/sidecar/package.json'),
  );

  const mergedDeps = {};
  for (const pkg of [corePkg, cliPkg, sidecarPkg]) {
    for (const [name, range] of Object.entries(pkg.dependencies ?? {})) {
      if (range.startsWith('workspace:')) continue;
      mergedDeps[name] = range;
    }
  }
  // Workspace packages -> file: links so npm hoists them into node_modules.
  for (const pkg of ['core', 'cli', 'sidecar']) {
    mergedDeps[`@loreweave/${pkg}`] = `file:./packages/${pkg}`;
  }

  // Optional deps: include from sidecar so ollama-ai-provider lands in the
  // bundle (npm respects optionalDependencies).
  const optionalDeps = { ...(sidecarPkg.optionalDependencies ?? {}) };

  const synthetic = {
    name: 'loreweave-desktop-bundle',
    version: '0.0.0',
    private: true,
    type: 'module',
    dependencies: mergedDeps,
    optionalDependencies: optionalDeps,
  };

  await fs.writeFile(
    path.join(resourcesRoot, 'package.json'),
    JSON.stringify(synthetic, null, 2),
  );

  // Wipe any prior install before re-running.
  await fs.rm(path.join(resourcesRoot, 'node_modules'), {
    recursive: true,
    force: true,
  });
  await fs.rm(path.join(resourcesRoot, 'package-lock.json'), {
    force: true,
  });

  console.log('\ninstalling production dependencies (npm)…');
  // `--legacy-peer-deps` is required because the optional
  // `ollama-ai-provider-v2` peer-depends on `zod@^4`, while the rest of the
  // workspace pins `zod@^3.25`. The runtime does not actually need zod 4 —
  // npm 7+'s strict peer resolution is the only blocker.
  execFileSync(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    [
      'install',
      '--omit=dev',
      '--no-audit',
      '--no-fund',
      '--ignore-scripts',
      '--legacy-peer-deps',
      '--loglevel=error',
    ],
    { cwd: resourcesRoot, stdio: 'inherit', shell: process.platform === 'win32' },
  );

  console.log(`\n✓ staged desktop resources at ${resourcesRoot}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
