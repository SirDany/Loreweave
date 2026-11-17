import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { fetchConfig, saveConfigPatch } from '../lib/lw.js';
import { playSwitch, playThemeMorph } from '../lib/sound.js';
import {
  applySkin,
  BUILTIN_SKINS,
  DEFAULT_SKIN_ID,
  getAllSkins,
  getBackgroundPattern,
  getBackgroundPatterns,
  getSkinCssVars,
  type BackgroundPatternSpec,
  type Skin,
} from './skins.js';

export interface SkinContextValue {
  skin: Skin;
  available: Skin[];
  setSkinId: (id: string) => void;
  pattern: BackgroundPatternSpec;
  patterns: readonly BackgroundPatternSpec[];
  patternOverride: string | null;
  setPatternOverride: (patternId: string | null) => void;
}

const STORAGE_KEY = 'loreweave.skin';
const PATTERN_STORAGE_KEY = 'loreweave.patternOverride';

function normalizeSkinId(raw: string): string {
  if (raw === 'avl-dark' || raw === 'ink') return 'cyber-dark';
  if (raw === 'avl-light' || raw === 'parchment') return 'precision-light';
  const all = getAllSkins();
  if (all.some((s) => s.id === raw)) return raw;
  return DEFAULT_SKIN_ID;
}

function loadStoredId(): string {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SKIN_ID;
    return normalizeSkinId(raw);
  } catch {
    return DEFAULT_SKIN_ID;
  }
}

function loadStoredPatternOverride(): string | null {
  try {
    const raw = window.localStorage.getItem(PATTERN_STORAGE_KEY);
    if (!raw || raw === 'auto') return null;
    return raw;
  } catch {
    return null;
  }
}

function getActiveSkin(id: string): Skin {
  const all = getAllSkins();
  return all.find((s) => s.id === id) ?? BUILTIN_SKINS[0]!;
}

let currentSkinId = typeof window !== 'undefined' ? loadStoredId() : DEFAULT_SKIN_ID;
let currentPatternOverride: string | null =
  typeof window !== 'undefined' ? loadStoredPatternOverride() : null;
let hasExplicitUserChange = false;
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      /* ignore */
    }
  });
}

if (typeof document !== 'undefined') {
  applySkin(getActiveSkin(currentSkinId), currentPatternOverride);
}

function commitSkinLocally(normalized: string) {
  currentSkinId = normalized;
  const skin = getActiveSkin(normalized);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, normalized);
    } catch {
      /* ignore */
    }
  }
  applySkin(skin, currentPatternOverride);
  notifyListeners();
}

export const skinStore = {
  getSkinId(): string {
    return currentSkinId;
  },
  getPatternOverride(): string | null {
    return currentPatternOverride;
  },
  getSkin(): Skin {
    return getActiveSkin(currentSkinId);
  },
  setSkinId(id: string) {
    const normalized = normalizeSkinId(id);
    hasExplicitUserChange = true;
    commitSkinLocally(normalized);
    playThemeMorph();
    saveConfigPatch({ skin: normalized }).catch(() => {
      /* offline or demo mode — localStorage remains active */
    });
  },
  setPatternOverride(patternId: string | null) {
    const clean = patternId && patternId !== 'auto' ? patternId : null;
    currentPatternOverride = clean;
    if (typeof window !== 'undefined') {
      try {
        if (clean) {
          window.localStorage.setItem(PATTERN_STORAGE_KEY, clean);
        } else {
          window.localStorage.removeItem(PATTERN_STORAGE_KEY);
        }
      } catch {
        /* ignore */
      }
    }
    applySkin(getActiveSkin(currentSkinId), clean);
    playSwitch();
    notifyListeners();
  },
  hydrateFromServer(id: string) {
    if (hasExplicitUserChange) return;
    const normalized = normalizeSkinId(id);
    if (normalized !== currentSkinId) {
      commitSkinLocally(normalized);
    }
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
  const skinId = useSyncExternalStore(
    skinStore.subscribe,
    skinStore.getSkinId,
    () => DEFAULT_SKIN_ID,
  );
  const patternOverride = useSyncExternalStore(
    skinStore.subscribe,
    skinStore.getPatternOverride,
    () => null,
  );
  const skin = getActiveSkin(skinId);
  const pattern = getBackgroundPattern(patternOverride || skin.patternId);
  const patterns = getBackgroundPatterns();
  const userChangedRef = useRef(false);

  useEffect(() => {
    applySkin(skin, patternOverride);
  }, [skin, patternOverride]);

  useEffect(() => {
    fetchConfig()
      .then((cfg) => {
        if (cfg.skin && !userChangedRef.current) {
          skinStore.hydrateFromServer(cfg.skin);
        }
      })
      .catch(() => {
        /* ignore if sidecar config is unavailable (e.g., demo mode) */
      });
  }, []);

  const value: SkinContextValue = {
    skin,
    available: getAllSkins(),
    setSkinId: (id: string) => {
      userChangedRef.current = true;
      skinStore.setSkinId(id);
    },
    pattern,
    patterns,
    patternOverride,
    setPatternOverride: (id: string | null) => skinStore.setPatternOverride(id),
  };

  return (
    <SkinContext.Provider value={value}>
      <div
        data-theme={skin.id}
        data-archetype={skin.archetype}
        data-pattern={pattern.id}
        style={getSkinCssVars(skin) as CSSProperties}
        className="h-full w-full bg-background text-foreground transition-colors duration-500 overflow-hidden"
      >
        {children}
      </div>
    </SkinContext.Provider>
  );
}

export function useSkin(): SkinContextValue {
  const ctx = useContext(SkinContext);
  const skinId = useSyncExternalStore(
    skinStore.subscribe,
    skinStore.getSkinId,
    () => DEFAULT_SKIN_ID,
  );
  const patternOverride = useSyncExternalStore(
    skinStore.subscribe,
    skinStore.getPatternOverride,
    () => null,
  );
  const skin = getActiveSkin(skinId);
  const pattern = getBackgroundPattern(patternOverride || skin.patternId);
  const patterns = getBackgroundPatterns();

  if (ctx) {
    return {
      ...ctx,
      skin,
      pattern,
      patterns,
      patternOverride,
    };
  }
  return {
    skin,
    available: getAllSkins(),
    setSkinId: (id: string) => skinStore.setSkinId(id),
    pattern,
    patterns,
    patternOverride,
    setPatternOverride: (id: string | null) => skinStore.setPatternOverride(id),
  };
}
