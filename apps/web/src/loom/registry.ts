/**
 * Loom — the renderer registry for Lenses.
 *
 * Phase 3: also tracks Lens manifests (built-in + saga-defined) so the
 * Shelf can list them. Built-in lenses are registered eagerly at
 * startup in `builtin-lenses.ts`.
 *
 * Each renderer is a plain React component. Phase 3 introduces a
 * `LensProps` interface that all renderers should accept (config +
 * data + selection). Existing renderers stay where they are; the
 * adapters in `builtin-lenses.ts` shim them onto LensProps.
 */
import type { ComponentType } from 'react';
import type { LensManifest } from './manifest.js';

export interface LoomEntry {
  id: string;
  /** Display name shown in the composer ("List", "Constellation", …). */
  name: string;
  /** Free-form one-liner used in the picker tooltip. */
  description: string;
  /** The React component the registry hands to the Workbench. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: ComponentType<any>;
}

const REGISTRY = new Map<string, LoomEntry>();
const LENSES = new Map<string, LensManifest>();

/**
 * Register a renderer. Last write wins, so saga-defined renderers can
 * shadow built-ins.
 */
export function registerLens(entry: LoomEntry): void {
  REGISTRY.set(entry.id, entry);
}

export function getLens(id: string): LoomEntry | undefined {
  return REGISTRY.get(id);
}

export function listLenses(): LoomEntry[] {
  return Array.from(REGISTRY.values());
}

/** Register a Lens manifest. Last write wins (saga overrides built-in). */
export function registerLensManifest(manifest: LensManifest): void {
  LENSES.set(manifest.id, manifest);
}

export function getLensManifest(id: string): LensManifest | undefined {
  return LENSES.get(id);
}

export function listLensManifests(): LensManifest[] {
  return Array.from(LENSES.values());
}

/** Test-only: clear the registry between cases. */
export function _resetLoom(): void {
  REGISTRY.clear();
  LENSES.clear();
}
