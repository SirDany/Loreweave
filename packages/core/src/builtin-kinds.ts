// Built-in Kinds — virtual definitions equivalent to Loreweave's
// hardcoded entry types. Every loaded KindCatalog seeds with these,
// so existing Sagas keep working without authoring `kinds/*.md`.
//
// Sagas can override any of these by writing a `kinds/<id>.md` with the
// same id; the override wins (last write).

import type { KindFrontmatter } from './kinds.js';

export const BUILTIN_KIND_DEFS: KindFrontmatter[] = [
  {
    id: 'character',
    type: 'kind',
    name: 'Character',
    echoPrefix: 'character',
    storage: 'codex/characters',
    display: { icon: 'User', color: 'amber', sortBy: 'name' },
    description: 'A person, creature, or sapient being in the Saga.',
  },
  {
    id: 'location',
    type: 'kind',
    name: 'Location',
    echoPrefix: 'location',
    storage: 'codex/locations',
    display: { icon: 'MapPin', color: 'emerald', sortBy: 'name' },
    description: 'A place — city, region, building, world.',
  },
  {
    id: 'concept',
    type: 'kind',
    name: 'Concept',
    echoPrefix: 'concept',
    storage: 'codex/concepts',
    display: { icon: 'Lightbulb', color: 'sky', sortBy: 'name' },
    description: 'An idea, force, faction, or abstract canon element.',
  },
  {
    id: 'lore',
    type: 'kind',
    name: 'Lore',
    echoPrefix: 'lore',
    storage: 'codex/lore',
    display: { icon: 'ScrollText', color: 'violet', sortBy: 'name' },
    description: 'Background lore, history, or reference material.',
  },
  {
    id: 'waypoint',
    type: 'kind',
    name: 'Waypoint',
    echoPrefix: 'waypoint',
    storage: 'codex/waypoints',
    display: { icon: 'Waypoints', color: 'rose', sortBy: 'name' },
    description: 'An event entry — placed on Threads to form timelines.',
  },
  {
    id: 'term',
    type: 'kind',
    name: 'Term',
    echoPrefix: 'term',
    storage: 'lexicon',
    display: { icon: 'FileText', color: 'cyan', sortBy: 'name' },
    description: 'A glossary or fantasy-language term.',
  },
  {
    id: 'sigil',
    type: 'kind',
    name: 'Sigil',
    echoPrefix: 'sigil',
    storage: 'sigils',
    display: { icon: 'Tags', color: 'orange', sortBy: 'name' },
    description: 'A tag or grouping bundle. Other entries inherit Sigils.',
  },
];

export const BUILTIN_KIND_IDS: ReadonlySet<string> = new Set(
  BUILTIN_KIND_DEFS.map((k) => k.id),
);
