import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  applySkin,
  BUILTIN_SKINS,
  DEFAULT_SKIN_ID,
  type Skin,
} from './skins.js';

interface SkinContextValue {
  skin: Skin;
  available: Skin[];
  setSkinId: (id: string) => void;
}

const SkinContext = createContext<SkinContextValue | null>(null);

const STORAGE_KEY = 'loreweave.skin';

function loadStoredId(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? DEFAULT_SKIN_ID;
  } catch {
    return DEFAULT_SKIN_ID;
  }
}

function storeId(id: string) {
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* private mode etc. — ignore */
  }
}

/**
 * Wraps the app, applies the selected Skin to `:root`, and exposes a
 * setter for switching. Future custom user-Skins (loaded from
 * `~/.loreweave/skins/`) get merged into `available` here.
 */
export function SkinProvider({ children }: { children: ReactNode }) {
  const [skinId, setSkinId] = useState<string>(() => loadStoredId());

  const available = useMemo(() => [...BUILTIN_SKINS], []);

  const skin = useMemo(
    () => available.find((s) => s.id === skinId) ?? available[0]!,
    [available, skinId],
  );

  useEffect(() => {
    applySkin(skin);
    storeId(skin.id);
  }, [skin]);

  const value = useMemo<SkinContextValue>(
    () => ({ skin, available, setSkinId }),
    [skin, available],
  );

  return <SkinContext.Provider value={value}>{children}</SkinContext.Provider>;
}

export function useSkin(): SkinContextValue {
  const v = useContext(SkinContext);
  if (!v) throw new Error('useSkin must be used inside <SkinProvider>');
  return v;
}
