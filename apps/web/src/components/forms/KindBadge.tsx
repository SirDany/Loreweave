import {
  BookOpen,
  FileText,
  Library,
  Lightbulb,
  MapPin,
  ScrollText,
  Sparkles,
  Sword,
  Tags,
  User,
  UserCircle,
  Waypoints,
} from 'lucide-react';
import type { ComponentType } from 'react';
import type { KindInfo } from '../../lib/lw.js';

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  BookOpen,
  FileText,
  Library,
  Lightbulb,
  MapPin,
  ScrollText,
  Sparkles,
  Sword,
  Tags,
  User,
  UserCircle,
  Waypoints,
};

const COLORS: Record<string, string> = {
  amber: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  emerald: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  sky: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
  violet: 'bg-violet-500/15 text-violet-300 border-violet-500/40',
  rose: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
  cyan: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40',
  orange: 'bg-orange-500/15 text-orange-300 border-orange-500/40',
};

interface Props {
  kind: KindInfo;
  /** Override the default label with the entry id/name. */
  label?: string;
  className?: string;
}

/**
 * Small icon + label badge for a Kind. Falls back gracefully when the
 * Kind's icon or color hint isn't recognized.
 */
export function KindBadge({ kind, label, className = '' }: Props) {
  // Display fields aren't surfaced in KindInfo yet (Phase 1 lists them
  // server-side only); fall back to a sensible icon by id.
  const iconName = inferIcon(kind.id);
  const colorName = inferColor(kind.id);
  const Icon = ICONS[iconName] ?? Tags;
  const colorClass = COLORS[colorName] ?? COLORS.orange!;
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-xs ${colorClass} ${className}`}
      title={kind.description || kind.name}
    >
      <Icon className="w-3 h-3" />
      <span>{label ?? kind.name}</span>
    </span>
  );
}

function inferIcon(id: string): string {
  switch (id) {
    case 'character':
      return 'User';
    case 'location':
      return 'MapPin';
    case 'concept':
      return 'Lightbulb';
    case 'lore':
      return 'ScrollText';
    case 'waypoint':
      return 'Waypoints';
    case 'term':
      return 'FileText';
    case 'sigil':
      return 'Tags';
    default:
      return 'Library';
  }
}

function inferColor(id: string): string {
  switch (id) {
    case 'character':
      return 'amber';
    case 'location':
      return 'emerald';
    case 'concept':
      return 'sky';
    case 'lore':
      return 'violet';
    case 'waypoint':
      return 'rose';
    case 'term':
      return 'cyan';
    case 'sigil':
      return 'orange';
    default:
      return 'orange';
  }
}
