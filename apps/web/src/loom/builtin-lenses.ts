/**
 * Built-in Lens manifests. Each one is functionally equivalent to a
 * pre-Phase-3 hardcoded section. Sagas can override any of these by
 * dropping a YAML at `<root>/.loreweave/lenses/<id>.yaml`.
 */
import type { LensManifest } from './manifest.js';

export const BUILTIN_LENSES: LensManifest[] = [
  {
    id: 'story',
    name: 'Story',
    icon: 'BookOpen',
    renderer: 'prose',
    description: 'Tome chapters and prose editor.',
    builtin: true,
  },
  {
    id: 'codex',
    name: 'Codex',
    icon: 'Library',
    renderer: 'codex',
    description: 'Characters, locations, lore.',
    kinds: ['character', 'location', 'concept', 'lore', 'waypoint'],
    builtin: true,
  },
  {
    id: 'lexicon',
    name: 'Lexicon',
    icon: 'FileText',
    renderer: 'list',
    description: 'Terms & slang.',
    kinds: ['term'],
    builtin: true,
  },
  {
    id: 'sigils',
    name: 'Sigils',
    icon: 'Tags',
    renderer: 'list',
    description: 'Tags & inheritance groups.',
    kinds: ['sigil'],
    builtin: true,
  },
  {
    id: 'threads',
    name: 'Threads',
    icon: 'Waypoints',
    renderer: 'thread',
    description: 'Timelines & waypoints.',
    builtin: true,
  },
  {
    id: 'traces',
    name: 'Traces',
    icon: 'Sparkles',
    renderer: 'traces',
    description: 'Ideas, todos, sticky notes.',
    builtin: true,
  },
  {
    id: 'constellation',
    name: 'Constellation',
    icon: 'Network',
    renderer: 'graph',
    description: 'Graph of echoes between entries.',
    builtin: true,
  },
  {
    id: 'versions',
    name: 'Versions',
    icon: 'GitBranch',
    renderer: 'versions',
    description: 'Git: branches, commits, restore points.',
    builtin: true,
  },
];
