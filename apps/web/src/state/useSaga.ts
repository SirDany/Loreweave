import { useCallback, useEffect, useState } from "react";
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

const DEFAULT_SAGA = "sagas/example-saga";
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
  tomeLens: string | null;
  setTomeLens: (t: string | null) => void;
  reload: () => Promise<void>;
  setSagaPath: (p: string) => void;
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
  const [data, setData] = useState<DumpPayload | null>(null);
  const [digest, setDigest] = useState<CanonDigestPayload | null>(null);
  const [kinds, setKinds] = useState<KindInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tomeLens, setTomeLens] = useState<string | null>(null);

  const setSagaPath = useCallback((p: string) => {
    setSagaPathState(p);
    try {
      window.localStorage.setItem(STORAGE_KEY, p);
    } catch {
      // best effort
    }
    setTomeLens(null);
    setDigest(null);
    setKinds([]);
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await dump(sagaPath);
      setData(payload);
      // Digest + kinds are optimizations — never block the reload on them.
      fetchDigest(sagaPath).then(
        (d) => setDigest(d),
        () => {
          /* endpoint unavailable (e.g. Tauri build w/o sidecar); ignore. */
        },
      );
      fetchKinds(sagaPath).then(
        (k) => setKinds(k),
        () => {
          /* CLI unavailable; ignore. */
        },
      );
      fetchLenses(sagaPath).then(
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
      setError((e as Error).message);
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
  useEffect(() => {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
      return;
    }
    const url = `/lw/events?sagaRoot=${encodeURIComponent(sagaPath)}`;
    let cancelled = false;
    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let scheduled: ReturnType<typeof setTimeout> | null = null;

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
      source.addEventListener('change', scheduleReload);
      source.onerror = () => {
        source?.close();
        source = null;
        // Retry with backoff; the dev server may still be warming up.
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
    tomeLens,
    setTomeLens,
    reload,
    setSagaPath,
  };
}
