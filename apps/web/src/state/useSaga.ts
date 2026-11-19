import { useCallback, useEffect, useRef, useState } from "react";
import { IS_DEMO } from "../lib/env.js";
import {
  dump,
  fetchConfig,
  fetchDigest,
  isSameSagaPath,
  kinds as fetchKinds,
  lenses as fetchLenses,
  listSagas,
  saveConfigPatch,
  type CanonDigestPayload,
  type DiscoveredSaga,
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

const DISCOVERY_ROOT_STORAGE_KEY = 'lw.sagaDiscoveryRoot';

function isMissingSagaError(msg: string): boolean {
  return /saga\.yaml not found|ENOENT|does not exist|no such file/i.test(msg);
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
  /** True when no usable Saga exists yet (empty discovery folder or last Saga deleted). */
  noSagas: boolean;
  error: string | null;
  /** Non-fatal error when attempting to switch to an invalid saga path. */
  switchError: string | null;
  clearSwitchError: () => void;
  tomeLens: string | null;
  setTomeLens: (t: string | null) => void;
  reload: () => Promise<void>;
  setSagaPath: (p: string) => void;
  resetToDefaultSaga: () => void;
  clearSaga: () => void;
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
  const [noSagas, setNoSagas] = useState(false);
  const noSagasRef = useRef(false);
  const hasDataRef = useRef(false);
  hasDataRef.current = data !== null;
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
        if (!active || userChangedSagaRef.current || noSagasRef.current) return;
        if (cfg.activeSaga && !isSameSagaPath(cfg.activeSaga, sagaPath)) {
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

  const enterEmptyWorkspace = useCallback(() => {
    noSagasRef.current = true;
    setNoSagas(true);
    setError(null);
    setData(null);
    setLoadedPath(null);
    setDigest(null);
    setKinds([]);
    setTomeLensState(null);
    try {
      window.localStorage.removeItem(SAGA_PATH_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    saveConfigPatch({ activeSaga: null, activeTomeLens: null }).catch(() => {
      /* ignore */
    });
  }, []);

  const clearSaga = useCallback(() => {
    userChangedSagaRef.current = true;
    setSwitchError(null);
    enterEmptyWorkspace();
  }, [enterEmptyWorkspace]);

  // Only update state here; localStorage + config.json are updated once `dump()` succeeds so
  // an invalid directory path can never lock the app across reloads.
  const setSagaPath = useCallback((p: string) => {
    const trimmed = p.trim();
    if (!trimmed) return;
    userChangedSagaRef.current = true;
    noSagasRef.current = false;
    setNoSagas(false);
    setError(null);
    const mem = loadSagaMemory(trimmed);
    setSwitchError(null);
    setSagaPathState(trimmed);
    setTomeLensState(mem?.tomeLens ?? null);
    setDigest(null);
    setKinds([]);
  }, []);

  const resetToDefaultSaga = useCallback(async () => {
    userChangedSagaRef.current = true;
    noSagasRef.current = false;
    setNoSagas(false);
    setSwitchError(null);
    setError(null);
    try {
      window.localStorage.removeItem(SAGA_PATH_STORAGE_KEY);
    } catch {
      /* ignore */
    }

    try {
      const cfg = await fetchConfig().catch(() => null);
      let storedRoot = 'sagas';
      try {
        const raw = window.localStorage.getItem(DISCOVERY_ROOT_STORAGE_KEY);
        if (raw && raw.trim()) storedRoot = raw.trim();
      } catch {
        /* ignore */
      }
      const root = cfg?.sagaRoot?.trim() || storedRoot;
      const discovered = await listSagas(root);
      if (discovered.length > 0) {
        const first = discovered[0]!;
        lastValidPathRef.current = first.path;
        setSagaPathState(first.path);
        const mem = loadSagaMemory(first.path);
        setTomeLensState(mem?.tomeLens ?? null);
        setDigest(null);
        setKinds([]);
        saveConfigPatch({
          activeSaga: first.path,
          activeTomeLens: mem?.tomeLens ?? null,
        }).catch(() => {});
        return;
      }
    } catch {
      /* ignore */
    }

    enterEmptyWorkspace();
  }, [enterEmptyWorkspace]);

  const reload = useCallback(async () => {
    const targetPath = sagaPath.trim();
    if (!targetPath) {
      enterEmptyWorkspace();
      return;
    }
    noSagasRef.current = false;
    setNoSagas(false);
    setLoading(true);
    setError(null);
    try {
      const payload = await dump(targetPath);
      noSagasRef.current = false;
      setNoSagas(false);
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
      const missing = !IS_DEMO && isMissingSagaError(msg);
      if (missing) {
        let discovered: DiscoveredSaga[] = [];
        try {
          const cfg = await fetchConfig().catch(() => null);
          let storedRoot = 'sagas';
          try {
            const raw = window.localStorage.getItem(DISCOVERY_ROOT_STORAGE_KEY);
            if (raw && raw.trim()) storedRoot = raw.trim();
          } catch {
            /* ignore */
          }
          const root = cfg?.sagaRoot?.trim() || storedRoot;
          discovered = await listSagas(root);
        } catch {
          discovered = [];
        }
        const candidates = discovered.filter(
          (s) => !isSameSagaPath(s.path, targetPath),
        );
        const preferred =
          candidates.find((s) =>
            isSameSagaPath(s.path, lastValidPathRef.current),
          ) ?? candidates[0];
        if (preferred) {
          if (hasDataRef.current) {
            setSwitchError(
              `Could not open Saga at "${targetPath}" (${msg}). Switched to "${preferred.title || preferred.id}".`,
            );
          }
          try {
            window.localStorage.setItem(SAGA_PATH_STORAGE_KEY, preferred.path);
          } catch {
            /* ignore */
          }
          saveConfigPatch({ activeSaga: preferred.path }).catch(() => {
            /* ignore */
          });
          const fallbackMem = loadSagaMemory(preferred.path);
          setSagaPathState(preferred.path);
          setTomeLensState(fallbackMem?.tomeLens ?? null);
        } else {
          setSwitchError(null);
          enterEmptyWorkspace();
        }
      } else if (
        targetPath !== DEFAULT_SAGA &&
        lastValidPathRef.current &&
        !isSameSagaPath(lastValidPathRef.current, targetPath)
      ) {
        const fallback = lastValidPathRef.current;
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
  }, [sagaPath, enterEmptyWorkspace]);

  useEffect(() => {
    if (!noSagas) void reload();
  }, [reload, noSagas]);

  // Auto-reload on filesystem changes (dev server SSE).
  // Debounced inside the sidecar; this listener just schedules a reload
  // whenever an external edit lands on the Saga root we're viewing.
  // Skipped entirely in demo mode (static GitHub Pages build, no sidecar)
  // or when no Saga is active so we don't spam the console.
  useEffect(() => {
    if (
      noSagas ||
      IS_DEMO ||
      typeof window === 'undefined' ||
      typeof EventSource === 'undefined'
    ) {
      return;
    }
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
  }, [sagaPath, reload, noSagas]);

  return {
    sagaPath,
    loadedPath,
    data,
    digest,
    kinds,
    loading,
    noSagas,
    error,
    switchError,
    clearSwitchError,
    tomeLens,
    setTomeLens,
    reload,
    setSagaPath,
    resetToDefaultSaga,
    clearSaga,
  };
}
