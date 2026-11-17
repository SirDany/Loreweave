/**
 * Browser-native recent saga manager backed by localStorage.
 */

const RECENTS_KEY = 'loreweave_recent_sagas';

export interface RecentSaga {
  path: string;
  title?: string;
  /** Unix-millis. */
  opened_at: number;
}

export async function listRecentSagas(): Promise<RecentSaga[]> {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    return raw ? (JSON.parse(raw) as RecentSaga[]) : [];
  } catch {
    return [];
  }
}

export async function addRecentSaga(
  path: string,
  title?: string,
): Promise<RecentSaga[]> {
  if (typeof window === 'undefined') return [];
  const list = await listRecentSagas();
  const filtered = list.filter((item) => item.path !== path);
  const updated = [{ path, title, opened_at: Date.now() }, ...filtered].slice(0, 10);
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
  return updated;
}

export async function forgetRecentSaga(path: string): Promise<RecentSaga[]> {
  if (typeof window === 'undefined') return [];
  const list = await listRecentSagas();
  const updated = list.filter((item) => item.path !== path);
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
  return updated;
}
