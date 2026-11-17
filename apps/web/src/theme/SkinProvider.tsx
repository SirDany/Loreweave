import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  applySkin,
  BUILTIN_SKINS,
  DEFAULT_SKIN_ID,
  type Skin,
} from './skins.js';

export interface SkinContextValue {
  skin: Skin;
  available: Skin[];
  setSkinId: (id: string) => void;
}

const STORAGE_KEY = 'loreweave.skin';

function loadStoredId(): string {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SKIN_ID;
    // Migrate legacy ids
    if (raw === 'avl-dark') return 'cyber-dark';
    if (raw === 'avl-light') return 'precision-light';
    if (BUILTIN_SKINS.some((s) => s.id === raw)) return raw;
    return DEFAULT_SKIN_ID;
  } catch {
    return DEFAULT_SKIN_ID;
  }
}

function getActiveSkin(id: string): Skin {
  return BUILTIN_SKINS.find((s) => s.id === id) ?? BUILTIN_SKINS[0]!;
}

// Global skin store for immediate, zero-latency reactive updates
let currentSkinId = typeof window !== 'undefined' ? loadStoredId() : DEFAULT_SKIN_ID;
const listeners = new Set<() => void>();

// Apply default/stored skin immediately on script load
if (typeof document !== 'undefined') {
  applySkin(getActiveSkin(currentSkinId));
}

export const skinStore = {
  getSkinId(): string {
    return currentSkinId;
  },
  getSkin(): Skin {
    return getActiveSkin(currentSkinId);
  },
  setSkinId(id: string) {
    // Normalise any legacy ID
    const normalized = id === 'avl-dark' ? 'cyber-dark' : id === 'avl-light' ? 'precision-light' : id;
    currentSkinId = normalized;
    const skin = getActiveSkin(normalized);
    try {
      window.localStorage.setItem(STORAGE_KEY, normalized);
    } catch {
      /* ignore */
    }
    applySkin(skin);
    listeners.forEach((listener) => {
      try {
        listener();
      } catch {
        /* ignore */
      }
    });
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

const SkinContext = createContext<SkinContextValue | null>(null);

export function SkinProvider({ children }: { children: ReactNode }) {
  const skinId = useSyncExternalStore(skinStore.subscribe, skinStore.getSkinId, () => DEFAULT_SKIN_ID);
  const skin = getActiveSkin(skinId);

  useEffect(() => {
    applySkin(skin);
  }, [skin]);

  const value: SkinContextValue = {
    skin,
    available: [...BUILTIN_SKINS],
    setSkinId: (id: string) => skinStore.setSkinId(id),
  };

  return <SkinContext.Provider value={value}>{children}</SkinContext.Provider>;
}

export function useSkin(): SkinContextValue {
  const ctx = useContext(SkinContext);
  const skinId = useSyncExternalStore(skinStore.subscribe, skinStore.getSkinId, () => DEFAULT_SKIN_ID);
  const skin = getActiveSkin(skinId);

  if (ctx) {
    return {
      ...ctx,
      skin,
    };
  }
  return {
    skin,
    available: [...BUILTIN_SKINS],
    setSkinId: (id: string) => skinStore.setSkinId(id),
  };
}
