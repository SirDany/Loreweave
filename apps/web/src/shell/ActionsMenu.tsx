import {
  ChevronDown,
  Inbox,
  Layers,
  RefreshCw,
  Scale,
  Sprout,
  Upload,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '../lib/utils.js';

interface ActionsMenuProps {
  onExport: () => void;
  onImport: () => void;
  onHarvest: () => void;
  onComposeLens: () => void;
  onRules: () => void;
  onReload: () => void;
  loading?: boolean;
}

interface MenuItem {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  spin?: boolean;
}

/**
 * Compact header "Actions" dropdown hosting project-level operations
 * (Export, Import, Harvest, Compose Lens, House Rules, Reload Saga)
 * without duplicating search, Scribe, or Settings buttons.
 */
export function ActionsMenu({
  onExport,
  onImport,
  onHarvest,
  onComposeLens,
  onRules,
  onReload,
  loading,
}: ActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onDocClick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDocClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const items: MenuItem[] = [
    { icon: Upload, label: 'Export…', onClick: onExport },
    { icon: Inbox, label: 'Import…', onClick: onImport },
    { icon: Sprout, label: 'Harvest…', onClick: onHarvest },
    { icon: Layers, label: 'Compose lens…', onClick: onComposeLens },
    { icon: Scale, label: 'House rules…', onClick: onRules },
    {
      icon: RefreshCw,
      label: loading ? 'Reloading…' : 'Reload Saga',
      onClick: onReload,
      spin: loading,
    },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          'rounded-xl border border-border/70 bg-background/50 px-3 py-1.5 text-xs font-medium interactive-lift flex items-center gap-1.5 text-foreground/90 hover:text-foreground',
          open && 'active-theme-pill text-primary',
        )}
      >
        <span>Actions</span>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-52 rounded-xl panel-glass p-1.5 shadow-2xl z-50 animate-modal-pop"
        >
          {items.map((it) => {
            const Icon = it.icon;
            return (
              <button
                key={it.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  it.onClick();
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs text-foreground/90 hover:bg-primary/15 hover:text-primary transition-colors"
              >
                <Icon
                  className={cn(
                    'h-3.5 w-3.5 shrink-0',
                    it.spin && 'animate-spin',
                  )}
                />
                <span className="flex-1 font-medium">{it.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
