import { useCallback, useMemo, useState } from 'react';
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
import { useSaga } from './useSaga.js';
import type { Section, Selection } from './types.js';
import type { ChatContextAttachment } from './useChat.js';

export interface AssistantSeed {
  agent?: string;
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
  | 'composing';

export interface PendingRename {
  type: DumpEntry['type'];
  id: string;
  name: string;
}

/**
 * Consolidated app-level state. Owns the Saga loader, current
 * section + selection, dialog flags, the Assistant panel state, and
 * derives the catalog/visibleEntries/currentEntry/currentChapter
 * convenience values used by the Shell.
 *
 * Returns a single big object — verbose by design so the Shell
 * destructure stays explicit.
 */
export function useApp() {
  const saga = useSaga();
  const [section, setSection] = useState<Section>('codex');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [dialogs, setDialogs] = useState<Record<DialogId, boolean>>({
    picking: false,
    exporting: false,
    importing: false,
    searching: false,
    backups: false,
    settings: false,
    composing: false,
  });
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantSeed, setAssistantSeed] = useState<AssistantSeed | null>(
    null,
  );
  const [pendingRename, setPendingRename] = useState<PendingRename | null>(
    null,
  );

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
    setSelection({ kind: loc.kind, key: loc.key });
    if (loc.kind === 'chapter') setSection('story');
    else setSection(entryTypeToSection(loc.key));
  }, []);

  const handleJumpToTarget = useCallback((target: string) => {
    jumpToTarget(target, setSelection, setSection);
  }, []);

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
    setSection,
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
