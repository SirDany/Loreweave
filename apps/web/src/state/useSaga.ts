import { useCallback, useEffect, useState } from "react";
import { dump, type DumpPayload } from "../lib/lw.js";

const DEFAULT_SAGA = "sagas/example-saga";
const STORAGE_KEY = "loreweave.sagaPath";

export interface SagaState {
  sagaPath: string;
  data: DumpPayload | null;
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
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await dump(sagaPath);
      setData(payload);
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
    loading,
    error,
    tomeLens,
    setTomeLens,
    reload,
    setSagaPath,
  };
}
