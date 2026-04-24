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
