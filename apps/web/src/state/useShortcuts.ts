import { useEffect } from 'react';

interface ShortcutsOptions {
  onSearch: () => void;
  onToggleAssistant: () => void;
  onToggleSidebar?: () => void;
}

/**
 * Global keyboard handlers. Currently:
 * - Ctrl/Cmd+P or Ctrl/Cmd+K → open Search
 * - Ctrl/Cmd+Shift+A → toggle Assistant panel
 * - Ctrl/Cmd+B → toggle directory sidebar
 *
 * Future shortcuts get added here so they're easy to discover.
 */
export function useShortcuts({
  onSearch,
  onToggleAssistant,
  onToggleSidebar,
}: ShortcutsOptions): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'k')) {
        e.preventDefault();
        onSearch();
        return;
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        (e.key === 'A' || e.key === 'a')
      ) {
        e.preventDefault();
        onToggleAssistant();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
        const target = e.target as HTMLElement | null;
        if (
          target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.isContentEditable)
        ) {
          return;
        }
        e.preventDefault();
        onToggleSidebar?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSearch, onToggleAssistant, onToggleSidebar]);
}
