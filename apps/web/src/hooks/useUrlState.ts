import { useCallback, useEffect, useRef, useState } from 'react';
import type { Section, Selection } from '../state/types.js';
import {
  DEFAULT_SAGA,
  SAGA_PATH_STORAGE_KEY,
  loadSagaMemory,
} from '../state/useSaga.js';

export const LAST_NAV_STORAGE_KEY = 'loreweave.lastNav.v1';

export interface NavLocation {
  section: Section;
  selection: Selection | null;
}

function readStoredNavFallback(): NavLocation | null {
  try {
    const sagaPath =
      window.localStorage.getItem(SAGA_PATH_STORAGE_KEY)?.trim() || DEFAULT_SAGA;
    const mem = loadSagaMemory(sagaPath);
    if (mem && (mem.section || mem.selection !== undefined)) {
      return {
        section: mem.section ?? 'codex',
        selection: mem.selection ?? null,
      };
    }
    const raw = window.localStorage.getItem(LAST_NAV_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<NavLocation>;
      if (parsed && typeof parsed.section === 'string' && parsed.section) {
        return {
          section: parsed.section,
          selection: parsed.selection ?? null,
        };
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

function parseUrl(): NavLocation {
  try {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('section') && !params.has('key')) {
      const restored = readStoredNavFallback();
      if (restored) return restored;
    }

    const section = (params.get('section') as Section) || 'codex';
    const key = params.get('key');
    const kind = params.get('kind') as 'entry' | 'chapter' | null;

    let selection: Selection | null = null;
    if (key) {
      selection = {
        kind: kind || (key.includes('/') ? 'entry' : 'chapter'),
        key,
      };
    }
    return { section, selection };
  } catch {
    return { section: 'codex', selection: null };
  }
}

function updateBrowserUrl(loc: NavLocation, replace = false) {
  try {
    const params = new URLSearchParams();
    if (loc.section) params.set('section', loc.section);
    if (loc.selection) {
      params.set('kind', loc.selection.kind);
      params.set('key', loc.selection.key);
    }
    const query = params.toString();
    const newUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
    
    // Avoid duplicate push for same state
    const currentQuery = window.location.search.replace(/^\?/, '');
    if (currentQuery === query) return;

    if (replace) {
      window.history.replaceState(loc, '', newUrl);
    } else {
      window.history.pushState(loc, '', newUrl);
    }
  } catch {
    /* ignore in non-browser env */
  }
}

/**
 * Manages section + selection synced to browser URL search params,
 * fully supporting Browser Back and Forward navigation buttons.
 */
export function useUrlState() {
  const [nav, setNav] = useState<NavLocation>(() => parseUrl());
  const isNavigatingFromPopState = useRef(false);
  const isFirstSync = useRef(true);

  // Sync state to URL on change, replacing on initial mount and pushing thereafter
  useEffect(() => {
    if (isNavigatingFromPopState.current) {
      isNavigatingFromPopState.current = false;
      return;
    }
    const replace = isFirstSync.current;
    isFirstSync.current = false;
    updateBrowserUrl(nav, replace);
  }, [nav]);

  // Listen to popstate (browser back/forward)
  useEffect(() => {
    const onPopState = (e: PopStateEvent) => {
      isNavigatingFromPopState.current = true;
      if (e.state && e.state.section) {
        setNav({
          section: e.state.section,
          selection: e.state.selection ?? null,
        });
      } else {
        setNav(parseUrl());
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const setSection = useCallback((s: Section) => {
    setNav((curr) => ({ ...curr, section: s }));
  }, []);

  const setSelection = useCallback((sel: Selection | null | ((prev: Selection | null) => Selection | null)) => {
    setNav((curr) => {
      const nextSel = typeof sel === 'function' ? sel(curr.selection) : sel;
      return { ...curr, selection: nextSel };
    });
  }, []);

  const setNavLocation = useCallback((newLoc: Partial<NavLocation>) => {
    setNav((curr) => ({
      section: newLoc.section ?? curr.section,
      selection: newLoc.selection !== undefined ? newLoc.selection : curr.selection,
    }));
  }, []);

  return {
    section: nav.section,
    selection: nav.selection,
    setSection,
    setSelection,
    setNavLocation,
  };
}
