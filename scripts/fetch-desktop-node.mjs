#!/usr/bin/env node
/**
 * Download a portable Node.js runtime for the current Tauri target triple
 * and place it as `apps/desktop/src-tauri/binaries/lw-node-<triple>[.exe]`.
 *
 * Tauri's externalBin convention requires that suffix; it ships only the
 * binary matching the host triple inside the bundle.
 *
 * Override TARGET_TRIPLE to cross-stage from CI matrix steps.
 */
import { promises as fs, createWriteStream } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import zlib from 'node:zlib';
import os from 'node:os';

const exec = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const binDir = path.join(
  repoRoot,
  'apps',
  'desktop',
  'src-tauri',
  'binaries',
);

const NODE_VERSION = process.env.LW_NODE_VERSION ?? 'v22.11.0';

function detectTriple() {
  if (process.env.TARGET_TRIPLE) return process.env.TARGET_TRIPLE;
  const plat = process.platform;
  const arch = process.arch;
  if (plat === 'win32' && arch === 'x64') return 'x86_64-pc-windows-msvc';
  if (plat === 'win32' && arch === 'arm64') return 'aarch64-pc-windows-msvc';
  if (plat === 'linux' && arch === 'x64') return 'x86_64-unknown-linux-gnu';
  if (plat === 'linux' && arch === 'arm64') return 'aarch64-unknown-linux-gnu';
  if (plat === 'darwin' && arch === 'x64') return 'x86_64-apple-darwin';
  if (plat === 'darwin' && arch === 'arm64') return 'aarch64-apple-darwin';
  throw new Error(`unsupported host: ${plat}/${arch}`);
}

function nodeAssetFor(triple) {
  // Map Tauri triple -> nodejs.org dist filename.
  switch (triple) {
    case 'x86_64-pc-windows-msvc':
      return { url: `win-x64/node.exe`, kind: 'exe' };
    case 'aarch64-pc-windows-msvc':
      return { url: `win-arm64/node.exe`, kind: 'exe' };
    case 'x86_64-unknown-linux-gnu':
      return {
        archive: `node-${NODE_VERSION}-linux-x64.tar.gz`,
        inner: `node-${NODE_VERSION}-linux-x64/bin/node`,
        kind: 'tar',
      };
    case 'aarch64-unknown-linux-gnu':
      return {
        archive: `node-${NODE_VERSION}-linux-arm64.tar.gz`,
        inner: `node-${NODE_VERSION}-linux-arm64/bin/node`,
        kind: 'tar',
      };
    case 'x86_64-apple-darwin':
      return {
        archive: `node-${NODE_VERSION}-darwin-x64.tar.gz`,
        inner: `node-${NODE_VERSION}-darwin-x64/bin/node`,
        kind: 'tar',
      };
    case 'aarch64-apple-darwin':
      return {
        archive: `node-${NODE_VERSION}-darwin-arm64.tar.gz`,
        inner: `node-${NODE_VERSION}-darwin-arm64/bin/node`,
        kind: 'tar',
      };
    default:
      throw new Error(`no node mapping for triple ${triple}`);
  }
}

async function fetchToFile(url, dest) {
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`fetch ${url}: ${res.status}`);
  }
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}

async function main() {
  const triple = detectTriple();
  const isWindows = triple.includes('windows');
  const targetName = `lw-node-${triple}${isWindows ? '.exe' : ''}`;
  const targetPath = path.join(binDir, targetName);

  await fs.mkdir(binDir, { recursive: true });
  const asset = nodeAssetFor(triple);
  const base = `https://nodejs.org/dist/${NODE_VERSION}`;

  if (asset.kind === 'exe') {
    console.log(`downloading ${base}/${asset.url}`);
    await fetchToFile(`${base}/${asset.url}`, targetPath);
  } else {
    const tmp = path.join(os.tmpdir(), asset.archive);
    console.log(`downloading ${base}/${asset.archive}`);
    await fetchToFile(`${base}/${asset.archive}`, tmp);
    const extractDir = path.join(os.tmpdir(), `lw-node-${triple}-extract`);
    await fs.rm(extractDir, { recursive: true, force: true });
    await fs.mkdir(extractDir, { recursive: true });
    // Use system tar (present on all CI runners we target).
    await exec('tar', ['-xzf', tmp, '-C', extractDir]);
    const innerPath = path.join(extractDir, asset.inner);
    await fs.copyFile(innerPath, targetPath);
    await fs.chmod(targetPath, 0o755);
  }

  console.log(`✓ wrote ${targetPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
