import {
  Bookmark,
  Bot,
  ChevronDown,
  Inbox,
  Layers,
  Scale,
  Search,
  Settings,
  Upload,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../components/ui/button.js';
import { cn } from '../lib/utils.js';

interface ActionsMenuProps {
  onExport: () => void;
  onImport: () => void;
  onSearch: () => void;
  onBackups: () => void;
  onSettings: () => void;
  onComposeLens: () => void;
  onRules: () => void;
  onToggleAssistant: () => void;
  assistantOpen: boolean;
}

interface MenuItem {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  hint?: string;
}

/**
 * Compact "Actions" dropdown that replaces the old 6-button grid in
 * the Shelf. Keeps the Shelf calm and gives every action a uniform
 * keyboard-discoverable home.
 */
export function ActionsMenu({
  onExport,
  onImport,
  onSearch,
  onBackups,
  onSettings,
  onComposeLens,
  onRules,
  onToggleAssistant,
  assistantOpen,
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
    { icon: Search, label: 'Search…', onClick: onSearch, hint: 'Ctrl+P' },
    {
      icon: Bot,
      label: assistantOpen ? 'Hide assistant' : 'Assistant…',
      onClick: onToggleAssistant,
      hint: 'Ctrl+Shift+A',
    },
    { icon: Upload, label: 'Export…', onClick: onExport },
    { icon: Inbox, label: 'Import…', onClick: onImport },
    { icon: Layers, label: 'Compose lens…', onClick: onComposeLens },
    { icon: Scale, label: 'House rules…', onClick: onRules },
    { icon: Bookmark, label: 'Backups…', onClick: onBackups },
    { icon: Settings, label: 'Settings…', onClick: onSettings },
  ];

  return (
    <div ref={ref} className="relative">
      <Button
        variant="outline"
        size="sm"
        className="w-full justify-between gap-2"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span>Actions</span>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 transition-transform',
            open && 'rotate-180',
          )}
        />
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-lg"
        >
          {items.map((it) => {
            const Icon = it.icon;
            return (
              <button
                key={it.label}
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  it.onClick();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-accent hover:text-accent-foreground"
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="flex-1">{it.label}</span>
                {it.hint && (
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {it.hint}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
