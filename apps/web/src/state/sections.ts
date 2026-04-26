import {
  BookOpen,
  FileText,
  GitBranch,
  Library,
  Network,
  Sparkles,
  Tags,
  Waypoints,
} from 'lucide-react';
import type { ComponentType } from 'react';
import type { LensManifest } from '../loom/manifest.js';
import { listLensManifests } from '../loom/registry.js';
import type { Section } from './types.js';

export interface SectionMeta {
  id: Section;
  label: string;
  hint: string;
  icon: ComponentType<{ className?: string }>;
}

const ICON_MAP: Record<string, ComponentType<{ className?: string }>> = {
  BookOpen,
  FileText,
  GitBranch,
  Library,
  Network,
  Sparkles,
  Tags,
  Waypoints,
};

/**
 * Hardcoded fallback ordering for built-in lenses. Saga-defined lenses
 * append after built-ins in registration order.
 */
const BUILTIN_ORDER = [
  'story',
  'codex',
  'lexicon',
  'sigils',
  'threads',
  'traces',
  'constellation',
  'versions',
];

function manifestToSection(m: LensManifest): SectionMeta {
  const icon =
    (m.icon ? ICON_MAP[m.icon] : undefined) ?? Library;
  return {
    id: m.id,
    label: m.name,
    hint: m.description ?? '',
    icon,
  };
}

/**
 * Active Grimoire sections — derived from the Loom's Lens manifest
 * registry. Built-in lenses come first in their canonical order;
 * saga-defined lenses follow in registration order.
 */
export function getSections(): SectionMeta[] {
  const all = listLensManifests();
  const byId = new Map(all.map((m) => [m.id, m]));
  const out: SectionMeta[] = [];
  const seen = new Set<string>();
  for (const id of BUILTIN_ORDER) {
    const m = byId.get(id);
    if (m) {
      out.push(manifestToSection(m));
      seen.add(id);
    }
  }
  for (const m of all) {
    if (!seen.has(m.id)) out.push(manifestToSection(m));
  }
  return out;
}

/**
 * Backwards-compat: a synchronous snapshot of the current sections,
 * computed once at module evaluation. Most callers should prefer
 * `getSections()` so newly-registered Lenses are reflected.
 */
export const SECTIONS: SectionMeta[] = getSections();
