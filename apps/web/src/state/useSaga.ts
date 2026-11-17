import { useCallback, useEffect, useRef, useState } from "react";
import {
  dump,
  fetchDigest,
  kinds as fetchKinds,
  lenses as fetchLenses,
  type CanonDigestPayload,
  type DumpPayload,
  type KindInfo,
  type LensManifestPayload,
} from "../lib/lw.js";
import { registerLensManifest } from "../loom/registry.js";

export const DEFAULT_SAGA = "sagas/example-saga";
const STORAGE_KEY = "loreweave.sagaPath";

export interface SagaState {
  sagaPath: string;
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

function readInitialPath(initial: string): string {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && stored.trim()) return stored;
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
  const [data, setData] = useState<DumpPayload | null>(null);
  const [digest, setDigest] = useState<CanonDigestPayload | null>(null);
  const [kinds, setKinds] = useState<KindInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [tomeLens, setTomeLens] = useState<string | null>(null);

  const clearSwitchError = useCallback(() => setSwitchError(null), []);

  // Only update state here; localStorage is updated once `dump()` succeeds so
  // an invalid directory path can never lock the app across reloads.
  const setSagaPath = useCallback((p: string) => {
    const trimmed = p.trim();
    if (!trimmed) return;
    setSwitchError(null);
    setSagaPathState(trimmed);
    setTomeLens(null);
    setDigest(null);
    setKinds([]);
  }, []);

  const resetToDefaultSaga = useCallback(() => {
    setSwitchError(null);
    setError(null);
    lastValidPathRef.current = DEFAULT_SAGA;
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setSagaPathState(DEFAULT_SAGA);
    setTomeLens(null);
    setDigest(null);
    setKinds([]);
  }, []);

  const reload = useCallback(async () => {
    const targetPath = sagaPath;
    setLoading(true);
    setError(null);
    try {
      const payload = await dump(targetPath);
      setData(payload);
      lastValidPathRef.current = targetPath;
      try {
        window.localStorage.setItem(STORAGE_KEY, targetPath);
      } catch {
        // best effort
      }
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
            window.localStorage.removeItem(STORAGE_KEY);
          } else {
            window.localStorage.setItem(STORAGE_KEY, fallback);
          }
        } catch {
          /* ignore */
        }
        setSwitchError(
          `Could not open Saga at "${targetPath}" (${msg}). Kept "${fallback}".`,
        );
        setSagaPathState(fallback);
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
