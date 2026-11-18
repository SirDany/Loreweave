import { useCallback, useEffect, useRef, useState } from "react";
import {
  dump,
  fetchConfig,
  fetchDigest,
  kinds as fetchKinds,
  lenses as fetchLenses,
  saveConfigPatch,
  type CanonDigestPayload,
  type DumpPayload,
  type KindInfo,
  type LensManifestPayload,
} from "../lib/lw.js";
import { registerLensManifest } from "../loom/registry.js";
import type { Section, Selection } from "./types.js";

export const DEFAULT_SAGA = "sagas/example-saga";
export const SAGA_PATH_STORAGE_KEY = "loreweave.sagaPath";
const SAGA_MEMORY_STORAGE_KEY = "loreweave.sagaMemory.v1";

export interface SagaWorkspaceMemory {
  tomeLens: string | null;
  section?: Section;
  selection?: Selection | null;
  updatedAt: number;
}

function readAllSagaMemory(): Record<string, SagaWorkspaceMemory> {
  try {
    const raw = window.localStorage.getItem(SAGA_MEMORY_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, SagaWorkspaceMemory>)
      : {};
  } catch {
    return {};
  }
}

function writeAllSagaMemory(map: Record<string, SagaWorkspaceMemory>): void {
  try {
    window.localStorage.setItem(SAGA_MEMORY_STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function loadSagaMemory(sagaPath: string): SagaWorkspaceMemory | null {
  const key = sagaPath.trim();
  if (!key) return null;
  return readAllSagaMemory()[key] ?? null;
}

export function saveSagaMemory(
  sagaPath: string,
  patch: Partial<SagaWorkspaceMemory>,
): void {
  const key = sagaPath.trim();
  if (!key) return;
  const all = readAllSagaMemory();
  const prev = all[key] ?? { tomeLens: null, updatedAt: Date.now() };
  all[key] = {
    ...prev,
    ...patch,
    updatedAt: Date.now(),
  };
  writeAllSagaMemory(all);
}

export function removeSagaMemory(sagaPath: string): void {
  const key = sagaPath.trim();
  if (!key) return;
  const all = readAllSagaMemory();
  if (key in all) {
    delete all[key];
    writeAllSagaMemory(all);
  }
}

export interface SagaState {
  sagaPath: string;
  loadedPath: string | null;
  data: DumpPayload | null;
  /**
   * Canon digest (phone book + resolved weaves + thread summaries). Lags
   * `data` by one request; null until the first successful fetch.
   */
  digest: CanonDigestPayload | null;
  /**
   * Resolved Kind catalog (built-ins + saga overrides). Empty array
   * before the first successful fetch.
   */
  kinds: KindInfo[];
  loading: boolean;
  error: string | null;
  /** Non-fatal error when attempting to switch to an invalid saga path. */
  switchError: string | null;
  clearSwitchError: () => void;
  tomeLens: string | null;
  setTomeLens: (t: string | null) => void;
  reload: () => Promise<void>;
  setSagaPath: (p: string) => void;
  resetToDefaultSaga: () => void;
}

function hasStoredSagaPath(): boolean {
  try {
    const stored = window.localStorage.getItem(SAGA_PATH_STORAGE_KEY);
    return !!(stored && stored.trim());
  } catch {
    return false;
  }
}

function readInitialPath(initial: string): string {
  try {
    const stored = window.localStorage.getItem(SAGA_PATH_STORAGE_KEY);
    if (stored && stored.trim()) return stored.trim();
  } catch {
    // localStorage unavailable (SSR / privacy mode) — fall through.
  }
  return initial;
}

export function useSaga(initialPath: string = DEFAULT_SAGA): SagaState {
  const [sagaPath, setSagaPathState] = useState<string>(() =>
    readInitialPath(initialPath),
  );
  const lastValidPathRef = useRef<string>(DEFAULT_SAGA);
  const userChangedSagaRef = useRef<boolean>(false);
  const [loadedPath, setLoadedPath] = useState<string | null>(null);
  const [data, setData] = useState<DumpPayload | null>(null);
  const [digest, setDigest] = useState<CanonDigestPayload | null>(null);
  const [kinds, setKinds] = useState<KindInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [tomeLens, setTomeLensState] = useState<string | null>(
    () => loadSagaMemory(readInitialPath(initialPath))?.tomeLens ?? null,
  );

  const clearSwitchError = useCallback(() => setSwitchError(null), []);

  const setTomeLens = useCallback(
    (next: string | null) => {
      setTomeLensState(next);
      saveSagaMemory(sagaPath, { tomeLens: next });
      saveConfigPatch({ activeTomeLens: next }).catch(() => {
        /* ignore offline/demo */
      });
    },
    [sagaPath],
  );

  // Restore last active Saga from user config when localStorage has no saved path yet.
  useEffect(() => {
    if (hasStoredSagaPath()) return;
    let active = true;
    fetchConfig()
      .then((cfg) => {
        if (!active || userChangedSagaRef.current) return;
        if (cfg.activeSaga && cfg.activeSaga !== sagaPath) {
          const restored = cfg.activeSaga;
          const mem = loadSagaMemory(restored);
          setSagaPathState(restored);
          setTomeLensState(mem?.tomeLens ?? cfg.activeTomeLens ?? null);
        } else if (cfg.activeTomeLens) {
          setTomeLensState((curr) => curr ?? cfg.activeTomeLens ?? null);
        }
      })
      .catch(() => {
        /* demo mode or offline sidecar */
      });
    return () => {
      active = false;
    };
    // Run once on initial mount when localStorage is unseeded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Only update state here; localStorage + config.json are updated once `dump()` succeeds so
  // an invalid directory path can never lock the app across reloads.
  const setSagaPath = useCallback((p: string) => {
    const trimmed = p.trim();
    if (!trimmed) return;
    userChangedSagaRef.current = true;
    const mem = loadSagaMemory(trimmed);
    setSwitchError(null);
    setSagaPathState(trimmed);
    setTomeLensState(mem?.tomeLens ?? null);
    setDigest(null);
    setKinds([]);
  }, []);

  const resetToDefaultSaga = useCallback(() => {
    userChangedSagaRef.current = true;
    setSwitchError(null);
    setError(null);
    lastValidPathRef.current = DEFAULT_SAGA;
    try {
      window.localStorage.removeItem(SAGA_PATH_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    const mem = loadSagaMemory(DEFAULT_SAGA);
    setSagaPathState(DEFAULT_SAGA);
    setTomeLensState(mem?.tomeLens ?? null);
    setDigest(null);
    setKinds([]);
    saveConfigPatch({ activeSaga: DEFAULT_SAGA, activeTomeLens: mem?.tomeLens ?? null }).catch(() => {
      /* ignore */
    });
  }, []);

  const reload = useCallback(async () => {
    const targetPath = sagaPath;
    setLoading(true);
    setError(null);
    try {
      const payload = await dump(targetPath);
      setData(payload);
      setLoadedPath(targetPath);
      lastValidPathRef.current = targetPath;
      setTomeLensState((curr) => {
        if (curr && !payload.tomes.some((t) => t.id === curr)) {
          saveSagaMemory(targetPath, { tomeLens: null });
          saveConfigPatch({ activeTomeLens: null }).catch(() => {});
          return null;
        }
        return curr;
      });
      try {
        window.localStorage.setItem(SAGA_PATH_STORAGE_KEY, targetPath);
      } catch {
        // best effort
      }
      saveConfigPatch({ activeSaga: targetPath }).catch(() => {
        /* demo/offline */
      });
      // Digest + kinds are optimizations — never block the reload on them.
      fetchDigest(targetPath).then(
        (d) => setDigest(d),
        () => {
          /* endpoint unavailable (e.g. Tauri build w/o sidecar); ignore. */
        },
      );
      fetchKinds(targetPath).then(
        (k) => setKinds(k),
        () => {
          /* CLI unavailable; ignore. */
        },
      );
      fetchLenses(targetPath).then(
        (list: LensManifestPayload[]) => {
          for (const m of list) {
            registerLensManifest({
              ...m,
              builtin: false,
            });
          }
        },
        () => {
          /* CLI unavailable; ignore. */
        },
      );
    } catch (e) {
      const msg = (e as Error).message;
      if (targetPath !== DEFAULT_SAGA) {
        const fallback =
          lastValidPathRef.current && lastValidPathRef.current !== targetPath
            ? lastValidPathRef.current
            : DEFAULT_SAGA;
        try {
          if (fallback === DEFAULT_SAGA) {
            window.localStorage.removeItem(SAGA_PATH_STORAGE_KEY);
          } else {
            window.localStorage.setItem(SAGA_PATH_STORAGE_KEY, fallback);
          }
        } catch {
          /* ignore */
        }
        setSwitchError(
          `Could not open Saga at "${targetPath}" (${msg}). Kept "${fallback}".`,
        );
        const fallbackMem = loadSagaMemory(fallback);
        setSagaPathState(fallback);
        setTomeLensState(fallbackMem?.tomeLens ?? null);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [sagaPath]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Auto-reload on filesystem changes (dev server SSE).
  // Debounced inside the sidecar; this listener just schedules a reload
  // whenever an external edit lands on the Saga root we're viewing.
  // Skipped entirely in demo mode (static GitHub Pages build, no sidecar)
  // so we don't spam the console with /lw/events 404s.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
      return;
    }
    const env = (import.meta as unknown as { env?: Record<string, string> })
      .env;
    if (env?.VITE_LW_DEMO === '1') return;
    const url = `/lw/events?sagaRoot=${encodeURIComponent(sagaPath)}`;
    let cancelled = false;
    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let scheduled: ReturnType<typeof setTimeout> | null = null;
    // If the endpoint never opens (no sidecar), stop retrying after a few
    // attempts so we don't loop forever in `vite preview` or static hosts.
    let consecutiveFailures = 0;
    const MAX_FAILURES = 3;

    const scheduleReload = () => {
      if (scheduled) clearTimeout(scheduled);
      scheduled = setTimeout(() => {
        scheduled = null;
        void reload();
      }, 200);
    };

    const connect = () => {
      if (cancelled) return;
      source = new EventSource(url);
      source.addEventListener('open', () => {
        consecutiveFailures = 0;
      });
      source.addEventListener('change', scheduleReload);
      source.onerror = () => {
        source?.close();
        source = null;
        consecutiveFailures += 1;
        if (consecutiveFailures >= MAX_FAILURES) return;
        retryTimer = setTimeout(connect, 2000);
      };
    };
    connect();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (scheduled) clearTimeout(scheduled);
      source?.close();
    };
  }, [sagaPath, reload]);

  return {
    sagaPath,
    loadedPath,
    data,
    digest,
    kinds,
    loading,
    error,
    switchError,
    clearSwitchError,
    tomeLens,
    setTomeLens,
    reload,
    setSagaPath,
    resetToDefaultSaga,
  };
}
