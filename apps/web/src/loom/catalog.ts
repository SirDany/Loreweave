/**
 * Lens catalog: built-in manifests + any saga-defined ones. The catalog
 * lives in the registry; this module exposes a `bootLensCatalog()`
 * helper called once at app start.
 *
 * Saga-defined Lenses are loaded by reading
 * `<saga>/.loreweave/lenses/*.yaml` via the dev-server middleware. In
 * Phase 4 contributed renderers register themselves via the same Loom
 * APIs.
 */
import { BUILTIN_LENSES } from './builtin-lenses.js';
import type { LensManifest } from './manifest.js';
import {
  listLensManifests,
  registerLensManifest,
} from './registry.js';

let booted = false;

/**
 * Register the built-in Lens manifests. Idempotent — safe to call from
 * `main.tsx` once and from individual tests via `_resetLoom`.
 */
export function bootLensCatalog(): void {
  if (booted) return;
  for (const m of BUILTIN_LENSES) {
    registerLensManifest(m);
  }
  booted = true;
}

/** Test-only flag reset paired with `registry._resetLoom`. */
export function _resetCatalogBoot(): void {
  booted = false;
}

/**
 * Resolve the active lens list as currently registered. Returns
 * built-ins + any sage-defined manifests that were registered later.
 */
export function activeLenses(): LensManifest[] {
  return listLensManifests();
}
