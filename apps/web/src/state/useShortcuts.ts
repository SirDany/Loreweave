import { useEffect } from 'react';

interface ShortcutsOptions {
  onSearch: () => void;
  onToggleAssistant: () => void;
}

/**
 * Global keyboard handlers. Currently:
 * - Ctrl/Cmd+P or Ctrl/Cmd+K → open Search
 * - Ctrl/Cmd+Shift+A → toggle Assistant panel
 *
 * Future shortcuts get added here so they're easy to discover.
 */
export function useShortcuts({
  onSearch,
  onToggleAssistant,
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
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSearch, onToggleAssistant]);
}
