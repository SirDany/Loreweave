import {
  ChevronRight,
  Orbit,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DumpEntry, DumpPayload } from '../lib/lw.js';
import type { Jumper } from '../lib/saga-helpers.js';
import { playRadialTick, playSwitch } from '../lib/sound.js';
import { cn } from '../lib/utils.js';
import {
  getSectionCount,
  getSections,
  type SectionMeta,
} from '../state/sections.js';
import type { Section, Selection } from '../state/types.js';
import { SectionList } from '../views/SectionList.js';

interface GrimoireProps {
  section: Section;
  onSectionChange: (s: Section) => void;
  data: DumpPayload;
  visibleEntries: DumpEntry[];
  selection: Selection | null;
  onSelect: (s: Selection) => void;
  onRename: (entry: DumpEntry) => void;
  onJump?: Jumper;
  onNewCodex?: (type: string) => void;
  onNewTerm?: () => void;
  onNewSigil?: () => void;
  onNewChapter?: () => void;
  width?: number;
}

const COLLAPSED_STORAGE_KEY = 'lw.grimoire.collapsed';

function loadCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Radial Half-Circle Slide-Out Grimoire Dial + Full-Height Contextual Sidebar.
 *
 * The Grimoire lens selector rests as a glowing half-circle crescent along the left screen
 * edge and fans open on hover/click into an interactive orbital dial, freeing the entire
 * vertical height of the left sidebar for deep list browsing and actions.
 */
export function Grimoire({
  section,
  onSectionChange,
  data,
  visibleEntries,
  selection,
  onSelect,
  onRename,
  onJump,
  onNewCodex,
  onNewTerm,
  onNewSigil,
  onNewChapter,
  width,
}: GrimoireProps) {
  const sections = getSections();
  const [wheelOpen, setWheelOpen] = useState(false);
  const [hoveredSection, setHoveredSection] = useState<Section | null>(null);
  const [collapsed, setCollapsed] = useState<boolean>(() => loadCollapsed());
  const closeTimerRef = useRef<number | null>(null);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(COLLAPSED_STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  useEffect(() => {
    if (!wheelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setWheelOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [wheelOpen]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  const openWheel = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setWheelOpen(true);
  };

  const scheduleCloseWheel = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = window.setTimeout(() => {
      setWheelOpen(false);
      setHoveredSection(null);
    }, 160);
  };

  const activeMeta: SectionMeta = useMemo(
    () => sections.find((s) => s.id === section) ?? sections[0]!,
    [sections, section],
  );
  const inspectedMeta: SectionMeta = useMemo(
    () =>
      sections.find((s) => s.id === (hoveredSection ?? section)) ?? activeMeta,
    [sections, hoveredSection, section, activeMeta],
  );

  const ActiveIcon = activeMeta.icon;
  const activeCount = getSectionCount(activeMeta.id, data, visibleEntries);
  const inspectedCount = getSectionCount(inspectedMeta.id, data, visibleEntries);
  const InspectedIcon = inspectedMeta.icon;

  // Geometry constants for the 348x480 right-facing half-circle orbital wheel
  const HUB_X = 14;
  const HUB_Y = 240;
  const ORBIT_R = 154;

  const radialItems = useMemo(() => {
    const count = sections.length;
    return sections.map((s, idx) => {
      const deg = count <= 1 ? 0 : -68 + (idx / (count - 1)) * 136;
      const rad = (deg * Math.PI) / 180;
      const x = HUB_X + Math.cos(rad) * ORBIT_R;
      const y = HUB_Y + Math.sin(rad) * ORBIT_R;
      return { meta: s, idx, x, y };
    });
  }, [sections]);

  const radialDock = (
    <div
      className="fixed left-0 top-1/2 -translate-y-1/2 z-[60] select-none"
      onMouseEnter={openWheel}
      onMouseLeave={scheduleCloseWheel}
    >
      {!wheelOpen ? (
        <div className="flex flex-col items-start gap-2">
          <button
            type="button"
            onClick={openWheel}
            aria-label="Open Radial Grimoire Menu"
            title={`Grimoire: ${activeMeta.label} — hover or click to switch`}
            className="group relative flex h-28 w-8 flex-col items-center justify-center gap-1.5 rounded-r-full popover-glass border-l-0 shadow-xl transition-all duration-300 hover:w-10 hover:border-primary/60"
          >
            <span
              aria-hidden="true"
              className="absolute right-1 top-3 h-1.5 w-1.5 rounded-full bg-primary animate-pulse"
            />
            <ActiveIcon className="h-4 w-4 text-primary transition-transform duration-300 group-hover:scale-110" />
            <ChevronRight className="h-3 w-3 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
          </button>

          {collapsed && (
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label="Expand contextual sidebar"
              title="Show section directory sidebar"
              className="flex h-8 w-8 items-center justify-center rounded-r-xl popover-glass border-l-0 text-muted-foreground hover:text-primary interactive-lift"
            >
              <PanelLeftOpen className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ) : (
        <div
          role="menu"
          aria-label="Grimoire Radial Switcher"
          className="relative w-[348px] h-[480px] rounded-r-[240px] popover-glass border-l-0 shadow-2xl overflow-hidden animate-modal-pop"
        >
          {/* Orbital Rings & Radial Spokes Backdrop */}
          <svg
            viewBox="0 0 348 480"
            className="pointer-events-none absolute inset-0 h-full w-full"
            aria-hidden="true"
          >
            <circle
              cx={HUB_X}
              cy={HUB_Y}
              r={84}
              fill="none"
              stroke="hsl(var(--primary))"
              strokeOpacity="0.22"
              strokeWidth="1"
            />
            <circle
              cx={HUB_X}
              cy={HUB_Y}
              r={ORBIT_R}
              fill="none"
              stroke="hsl(var(--primary))"
              strokeOpacity="0.34"
              strokeWidth="1.25"
              strokeDasharray="4 6"
            />
            <circle
              cx={HUB_X}
              cy={HUB_Y}
              r={224}
              fill="none"
              stroke="hsl(var(--border))"
              strokeOpacity="0.45"
              strokeWidth="1"
              strokeDasharray="2 8"
            />

            {radialItems.map(({ meta, x, y }) => {
              const isInspected = meta.id === inspectedMeta.id;
              const isActive = meta.id === section;
              return (
                <line
                  key={`spoke:${meta.id}`}
                  x1={HUB_X}
                  y1={HUB_Y}
                  x2={x}
                  y2={y}
                  stroke={
                    isInspected || isActive
                      ? 'hsl(var(--primary))'
                      : 'hsl(var(--border))'
                  }
                  strokeOpacity={isInspected ? 0.85 : isActive ? 0.6 : 0.32}
                  strokeWidth={isInspected ? 1.8 : 1}
                  strokeDasharray={isInspected ? undefined : '3 4'}
                />
              );
            })}
          </svg>

          {/* Central Half-Disc Inspector Hub */}
          <div
            style={{ top: `${HUB_Y}px` }}
            className="pointer-events-none absolute left-0 -translate-y-1/2 w-[114px] h-[168px] rounded-r-full border border-l-0 border-border/75 bg-card/90 pl-3 pr-4 flex flex-col justify-center gap-1 shadow-lg"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary border border-primary/30">
              <InspectedIcon className="h-3.5 w-3.5" />
            </div>
            <div className="text-xs font-bold tracking-tight text-foreground truncate">
              {inspectedMeta.label}
            </div>
            <div className="text-[10px] leading-tight text-muted-foreground line-clamp-2">
              {inspectedMeta.hint}
            </div>
            {inspectedCount !== null && (
              <div className="mt-0.5 inline-flex w-fit items-center rounded-full border border-border/70 bg-background/60 px-1.5 py-0.5 font-mono text-[9px] text-primary font-semibold">
                {inspectedCount} items
              </div>
            )}
          </div>

          {/* Radial Arc Menu Items */}
          {radialItems.map(({ meta, idx, x, y }) => {
            const Icon = meta.icon;
            const isSelected = meta.id === section;
            const isHovered = meta.id === hoveredSection;
            const count = getSectionCount(meta.id, data, visibleEntries);

            return (
              <button
                key={meta.id}
                type="button"
                role="menuitem"
                data-sound="none"
                onMouseEnter={() => {
                  setHoveredSection(meta.id);
                  playRadialTick(idx, radialItems.length);
                }}
                onClick={() => {
                  playSwitch();
                  onSectionChange(meta.id);
                  setWheelOpen(false);
                  setHoveredSection(null);
                }}
                style={{
                  left: `${x - 14}px`,
                  top: `${y}px`,
                }}
                className={cn(
                  'group absolute -translate-y-1/2 flex items-center gap-2 rounded-full border pl-1.5 pr-2.5 py-1 text-left transition-all duration-150 shadow-md',
                  isSelected
                    ? 'active-theme-pill font-semibold scale-105 z-20'
                    : isHovered
                      ? 'border-primary/70 bg-card text-foreground scale-105 z-20'
                      : 'border-border/75 bg-card/85 text-foreground/85 hover:text-foreground',
                )}
              >
                <span
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors',
                    isSelected
                      ? 'border-current/30 bg-background/20'
                      : isHovered
                        ? 'border-primary/60 bg-primary/15 text-primary'
                        : 'border-border/70 bg-background/50 text-muted-foreground group-hover:text-primary',
                  )}
                >
                  <Icon className="h-3 w-3" />
                </span>
                <span className="text-[11px] font-medium whitespace-nowrap">
                  {meta.label}
                </span>
                {count !== null && (
                  <span className="font-mono text-[9px] opacity-70">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Left-Edge Half-Circle Radial Slide-Out Grimoire (portaled above panels & header) */}
      {typeof document !== 'undefined' ? createPortal(radialDock, document.body) : radialDock}

      {/* Full-Height Contextual Left Sidebar */}
      {!collapsed && (
        <nav
          style={{ width: width ? `${width}px` : undefined }}
          className="w-80 shrink-0 flex flex-col panel-glass overflow-hidden"
        >
          {/* Compact Top Section Switch Trigger + Collapse */}
          <div className="shrink-0 px-3 py-2 border-b border-border/60 flex items-center justify-between gap-2 bg-card/30">
            <button
              type="button"
              onClick={() => {
                if (wheelOpen) {
                  setWheelOpen(false);
                } else {
                  openWheel();
                }
              }}
              className="group flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border/60 bg-background/40 px-2.5 py-1.5 text-left hover:border-primary/50 hover:bg-muted/40 transition-all"
              title="Open Radial Grimoire Switcher"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
                <ActiveIcon className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-foreground truncate">
                    {activeMeta.label}
                  </span>
                  {activeCount !== null && (
                    <span className="font-mono text-[10px] text-primary font-medium">
                      {activeCount}
                    </span>
                  )}
                </div>
              </div>
              <Orbit className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-primary group-hover:rotate-45 transition-all" />
            </button>

            <button
              type="button"
              onClick={toggleCollapsed}
              className="p-1.5 rounded-lg border border-border/60 bg-background/40 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
              title="Collapse directory sidebar"
              aria-label="Collapse directory sidebar"
            >
              <PanelLeftClose className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* 100% Dedicated Section Directory & Actions */}
          <div className="flex-1 overflow-auto scrollbar-ember px-3 py-2.5">
            <SectionList
              section={section}
              data={data}
              visibleEntries={visibleEntries}
              selection={selection}
              onSelect={onSelect}
              onRename={onRename}
              onJump={onJump}
              onNewCodex={onNewCodex}
              onNewTerm={onNewTerm}
              onNewSigil={onNewSigil}
              onNewChapter={onNewChapter}
            />
          </div>
        </nav>
      )}
    </>
  );
}
