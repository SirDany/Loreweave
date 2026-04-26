/**
 * Auto-registration entry point for contributed Lens renderers.
 *
 * Each contribution registers itself with the Loom via `registerLens`.
 * `bootContribLenses()` is called once at app startup (after the
 * built-in lens catalog has booted) so contrib renderers are picked
 * up uniformly with built-ins.
 *
 * To contribute a new renderer:
 *   1. Add `apps/web/src/loom/contrib/<name>Lens.tsx`.
 *   2. Import it here and call `registerLens` for it inside
 *      `bootContribLenses()`.
 *   3. Document the manifest contract in `docs/loom.md`.
 */
import { registerLens } from '../registry.js';
import { KanbanLens } from './KanbanLens.js';

let booted = false;

export function bootContribLenses(): void {
  if (booted) return;
  registerLens({
    id: 'kanban',
    name: 'Kanban',
    description:
      'Buckets entries into columns based on a property value (e.g. status).',
    component: KanbanLens,
  });
  booted = true;
}

/** Test-only. */
export function _resetContribBoot(): void {
  booted = false;
}
