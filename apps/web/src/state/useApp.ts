import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LAST_NAV_STORAGE_KEY, useUrlState } from '../hooks/useUrlState.js';
import { buildCatalog } from '../lib/catalog.js';
import {
  fetchConfig,
  saveConfigPatch,
  type DumpEntry,
} from '../lib/lw.js';
import {
  applyTomeFilter,
  entryTypeToSection,
  findChapter,
  getUsagesCount,
  type Jumper,
  jumpToTarget,
  relatedTracesFor,
} from '../lib/saga-helpers.js';
import type { Section, Selection } from './types.js';
import type { ChatContextAttachment } from './useChat.js';
import { loadSagaMemory, saveSagaMemory, useSaga } from './useSaga.js';

export interface AssistantSeed {
  prompt?: string;
  context?: ChatContextAttachment;
}

export type DialogId =
  | 'exporting'
  | 'importing'
  | 'searching'
  | 'settings'
  | 'composing'
  | 'rules'
  | 'harvesting';

export interface PendingRename {
  type: DumpEntry['type'];
  id: string;
  name: string;
}

export type PendingNew =
  | {
      kind: 'codex';
      type: 'character' | 'location' | 'concept' | 'lore' | 'waypoint';
    }
  | { kind: 'term' }
  | { kind: 'sigil' }
  | { kind: 'chapter'; tome?: string };

const SCRIBE_OPEN_KEY = 'lw.scribe.open';
const INSPECTOR_OPEN_KEY = 'lw.inspector.open';

function loadBoolPref(key: string, fallback: boolean): boolean {
  try {
    const val = localStorage.getItem(key);
    if (val === '0' || val === 'false') return false;
    if (val === '1' || val === 'true') return true;
    return fallback;
  } catch {
    return fallback;
  }
}

/**
 * Consolidated app-level state. Owns the Saga loader, current
 * section + selection (synced with browser history/URL), dialog flags,
 * the Scribe and Inspector panel states (auto-persisted), and
 * derives the catalog/visibleEntries/currentEntry/currentChapter
 * convenience values used by the Shell.
 */
export function useApp() {
  const saga = useSaga();
  const {
    section,
    selection,
    setSection,
    setSelection,
    setNavLocation,
  } = useUrlState();

  const [dialogs, setDialogs] = useState<Record<DialogId, boolean>>({
    exporting: false,
    importing: false,
    searching: false,
    settings: false,
    composing: false,
    rules: false,
    harvesting: false,
  });

  // Scribe chat window open per default, persisted in user preferences
  const [assistantOpen, setAssistantOpen] = useState<boolean>(() =>
    loadBoolPref(SCRIBE_OPEN_KEY, true),
  );

  // Inspector panel open per default, persisted in user preferences
  const [inspectorOpen, setInspectorOpen] = useState<boolean>(() =>
    loadBoolPref(INSPECTOR_OPEN_KEY, true),
  );

  useEffect(() => {
    try {
      localStorage.setItem(SCRIBE_OPEN_KEY, assistantOpen ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [assistantOpen]);

  useEffect(() => {
    try {
      localStorage.setItem(INSPECTOR_OPEN_KEY, inspectorOpen ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [inspectorOpen]);

  const [assistantSeed, setAssistantSeed] = useState<AssistantSeed | null>(
    null,
  );
  const [pendingRename, setPendingRename] = useState<PendingRename | null>(
    null,
  );
  const [pendingNew, setPendingNew] = useState<PendingNew | null>(null);

  const openDialog = useCallback((id: DialogId) => {
    setDialogs((d) => ({ ...d, [id]: true }));
  }, []);
  const closeDialog = useCallback((id: DialogId) => {
    setDialogs((d) => ({ ...d, [id]: false }));
  }, []);

  const openAssistant = useCallback((seed: AssistantSeed) => {
    setAssistantSeed(seed);
    setAssistantOpen(true);
  }, []);
  const toggleAssistant = useCallback(() => {
    setAssistantOpen((v) => !v);
  }, []);
  const closeAssistant = useCallback(() => {
    setAssistantOpen(false);
    setAssistantSeed(null);
  }, []);

  const toggleInspector = useCallback(() => {
    setInspectorOpen((v) => !v);
  }, []);
  const closeInspector = useCallback(() => {
    setInspectorOpen(false);
  }, []);

  const prevSagaRef = useRef<string>(saga.sagaPath);
  const userNavigatedRef = useRef<boolean>(false);

  const changeSelection = useCallback(
    (
      sel:
        | Selection
        | null
        | ((prev: Selection | null) => Selection | null),
    ) => {
      userNavigatedRef.current = true;
      setSelection(sel);
    },
    [setSelection],
  );

  const selectSaga = useCallback(
    (nextPath: string) => {
      const trimmed = nextPath.trim();
      if (!trimmed) return;
      userNavigatedRef.current = true;
      prevSagaRef.current = trimmed;
      saga.setSagaPath(trimmed);
      const mem = loadSagaMemory(trimmed);
      setNavLocation({
        section: mem?.section ?? 'codex',
        selection: mem?.selection ?? null,
      });
    },
    [saga, setNavLocation],
  );

  // Hydrate initial section from user config when localStorage and URL both lack prior navigation.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.has('section') || params.has('key')) return;
      if (loadSagaMemory(saga.sagaPath)?.section) return;
      if (window.localStorage.getItem(LAST_NAV_STORAGE_KEY)) return;
    } catch {
      return;
    }
    let active = true;
    fetchConfig()
      .then((cfg) => {
        if (!active || userNavigatedRef.current) return;
        if (cfg.activeSection) {
          setNavLocation({ section: cfg.activeSection, selection: null });
        }
      })
      .catch(() => {
        /* ignore offline/demo */
      });
    return () => {
      active = false;
    };
    // Run once on initial mount for cold-start config restoration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist per-Saga memory & restore when sagaPath changes externally (e.g. server hydrate / reset).
  useEffect(() => {
    if (prevSagaRef.current !== saga.sagaPath) {
      prevSagaRef.current = saga.sagaPath;
      const mem = loadSagaMemory(saga.sagaPath);
      setNavLocation({
        section: mem?.section ?? 'codex',
        selection: mem?.selection ?? null,
      });
      return;
    }
    saveSagaMemory(saga.sagaPath, {
      tomeLens: saga.tomeLens,
      section,
      selection,
    });
    try {
      window.localStorage.setItem(
        LAST_NAV_STORAGE_KEY,
        JSON.stringify({ section, selection }),
      );
    } catch {
      /* ignore */
    }
    saveConfigPatch({ activeSection: section }).catch(() => {
      /* ignore */
    });
  }, [saga.sagaPath, saga.tomeLens, section, selection, setNavLocation]);

  // Clear stale selection only once dump() for the active sagaPath has landed.
  useEffect(() => {
    const data = saga.data;
    if (!data || saga.loadedPath !== saga.sagaPath || !selection) return;
    const valid =
      selection.kind === 'entry'
        ? data.entries.some((e) => `${e.type}/${e.id}` === selection.key)
        : !!findChapter(data, selection.key);
    if (!valid) {
      setSelection(null);
    }
  }, [saga.data, saga.loadedPath, saga.sagaPath, selection, setSelection]);

  const handleJump = useCallback<Jumper>((loc) => {
    userNavigatedRef.current = true;
    const targetSection =
      loc.kind === 'chapter' ? 'story' : entryTypeToSection(loc.key);
    setNavLocation({
      section: targetSection,
      selection: { kind: loc.kind, key: loc.key },
    });
  }, [setNavLocation]);

  const handleJumpToTarget = useCallback((target: string) => {
    userNavigatedRef.current = true;
    jumpToTarget(target, setSelection, setSection);
  }, [setSelection, setSection]);

  /**
   * User-driven section change (Grimoire nav). Clears the selection
   * if the currently-selected entry/chapter doesn't belong to the
   * new section.
   */
  const changeSection = useCallback(
    (s: Section) => {
      userNavigatedRef.current = true;
      setNavLocation({
        section: s,
        selection:
          selection &&
          ((selection.kind === 'chapter' && s === 'story') ||
            (selection.kind === 'entry' && entryTypeToSection(selection.key) === s))
            ? selection
            : null,
      });
    },
    [selection, setNavLocation],
  );

  // Derived values — only meaningful once `saga.data` is loaded.
  const data = saga.data;
  const catalog = useMemo(
    () => (data ? buildCatalog(data, saga.digest) : null),
    [data, saga.digest],
  );
  const visibleEntries = useMemo(
    () => (data ? applyTomeFilter(data.entries, saga.tomeLens) : []),
    [data, saga.tomeLens],
  );
  const currentEntry =
    selection?.kind === 'entry' && data
      ? (data.entries.find((e) => `${e.type}/${e.id}` === selection.key) ??
        null)
      : null;
  const currentChapter =
    selection?.kind === 'chapter' && data
      ? findChapter(data, selection.key)
      : null;
  const usagesCount =
    currentEntry && data ? getUsagesCount(currentEntry, data) : 0;
  const relatedTraces =
    currentEntry && data ? relatedTracesFor(currentEntry, data) : [];

  return {
    saga,
    selectSaga,
    section,
    setSection: changeSection,
    selection,
    setSelection: changeSelection,
    dialogs,
    openDialog,
    closeDialog,
    assistantOpen,
    assistantSeed,
    openAssistant,
    toggleAssistant,
    closeAssistant,
    inspectorOpen,
    toggleInspector,
    closeInspector,
    pendingRename,
    setPendingRename,
    pendingNew,
    setPendingNew,
    catalog,
    visibleEntries,
    currentEntry,
    currentChapter,
    usagesCount,
    relatedTraces,
    handleJump,
    handleJumpToTarget,
  };
}

export type AppState = ReturnType<typeof useApp>;
