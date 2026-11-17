import { useCallback, useEffect, useMemo, useState } from 'react';
import { useUrlState } from '../hooks/useUrlState.js';
import { buildCatalog } from '../lib/catalog.js';
import type { DumpEntry } from '../lib/lw.js';
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
import { useSaga } from './useSaga.js';

export interface AssistantSeed {
  prompt?: string;
  context?: ChatContextAttachment;
}

export type DialogId =
  | 'picking'
  | 'exporting'
  | 'importing'
  | 'searching'
  | 'backups'
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

function loadScribeOpen(): boolean {
  try {
    const val = localStorage.getItem(SCRIBE_OPEN_KEY);
    // Default: open (true)
    if (val === '0' || val === 'false') return false;
    return true;
  } catch {
    return true;
  }
}

/**
 * Consolidated app-level state. Owns the Saga loader, current
 * section + selection (synced with browser history/URL), dialog flags,
 * the Scribe panel state (open by default, auto-persisted), and
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
    picking: false,
    exporting: false,
    importing: false,
    searching: false,
    backups: false,
    settings: false,
    composing: false,
    rules: false,
    harvesting: false,
  });

  // Scribe chat window open per default, persisted in user preferences
  const [assistantOpen, setAssistantOpen] = useState<boolean>(() =>
    loadScribeOpen(),
  );

  useEffect(() => {
    try {
      localStorage.setItem(SCRIBE_OPEN_KEY, assistantOpen ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [assistantOpen]);

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

  const handleJump = useCallback<Jumper>((loc) => {
    const targetSection =
      loc.kind === 'chapter' ? 'story' : entryTypeToSection(loc.key);
    setNavLocation({
      section: targetSection,
      selection: { kind: loc.kind, key: loc.key },
    });
  }, [setNavLocation]);

  const handleJumpToTarget = useCallback((target: string) => {
    jumpToTarget(target, setSelection, setSection);
  }, [setSelection, setSection]);

  /**
   * User-driven section change (Grimoire nav). Clears the selection
   * if the currently-selected entry/chapter doesn't belong to the
   * new section.
   */
  const changeSection = useCallback(
    (s: Section) => {
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
    section,
    setSection: changeSection,
    selection,
    setSelection,
    dialogs,
    openDialog,
    closeDialog,
    assistantOpen,
    assistantSeed,
    openAssistant,
    toggleAssistant,
    closeAssistant,
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
