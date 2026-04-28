// Thin shim around the Tauri 2 invoke surface so the web app can call the
// desktop-only Rust commands (recents, log, updater) when running inside
// the Tauri shell, and gracefully no-op in plain browser / Pages mode.
//
// We talk to the global `window.__TAURI_INTERNALS__.invoke(...)` directly
// so the web bundle stays free of `@tauri-apps/api` (and the bundle stays
// small for the GitHub Pages demo).

export interface RecentSaga {
  path: string;
  title?: string;
  /** Unix-millis. */
  opened_at: number;
}

interface TauriBridge {
  invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>;
}

function bridge(): TauriBridge | null {
  if (typeof window === 'undefined') return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const internals = (window as any).__TAURI_INTERNALS__;
  if (internals && typeof internals.invoke === 'function') {
    return { invoke: internals.invoke.bind(internals) };
  }
  return null;
}

/** True when running inside the Loreweave desktop shell. */
export function isDesktop(): boolean {
  return bridge() !== null;
}

export async function listRecentSagas(): Promise<RecentSaga[]> {
  const b = bridge();
  if (!b) return [];
  try {
    return await b.invoke<RecentSaga[]>('list_recent_sagas');
  } catch {
    return [];
  }
}

export async function addRecentSaga(
  path: string,
  title?: string,
): Promise<RecentSaga[]> {
  const b = bridge();
  if (!b) return [];
  try {
    return await b.invoke<RecentSaga[]>('add_recent_saga', { path, title });
  } catch {
    return [];
  }
}

export async function forgetRecentSaga(path: string): Promise<RecentSaga[]> {
  const b = bridge();
  if (!b) return [];
  try {
    return await b.invoke<RecentSaga[]>('forget_recent_saga', { path });
  } catch {
    return [];
  }
}

export async function checkForUpdates(): Promise<string | null> {
  const b = bridge();
  if (!b) return null;
  try {
    return await b.invoke<string | null>('check_for_updates');
  } catch {
    return null;
  }
}

export async function openLogFile(): Promise<string | null> {
  const b = bridge();
  if (!b) return null;
  try {
    return await b.invoke<string>('open_log_file');
  } catch {
    return null;
  }
}
