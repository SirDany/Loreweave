/**
 * Skins — Loreweave's theming system.
 *
 * A Skin is a flat map of HSL tokens that get written to `:root` as
 * CSS variables. Tailwind config + index.css consume those variables, so
 * swapping a Skin restyles the entire app without re-rendering React.
 *
 * Tokens follow shadcn's contract (background, foreground, primary, …)
 * plus a small set of Loreweave-specific accents.
 *
 * Built-in Skins ship with the app. Writers can drop their own JSON
 * files into `~/.loreweave/skins/*.json` and they appear in the picker
 * (loaded by SkinProvider via the sidecar config).
 */

export interface SkinTokens {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
  ring: string;
  /** `dark` or `light`. Sets the browser's color-scheme. */
  scheme: 'dark' | 'light';
}

export interface Skin {
  id: string;
  name: string;
  description: string;
  tokens: SkinTokens;
}

/**
 * Ember — the original mythic stone+amber Skin. Default.
 */
export const EMBER: Skin = {
  id: 'ember',
  name: 'Ember',
  description: 'Stone and amber. The default Loreweave look.',
  tokens: {
    background: '24 10% 6%',
    foreground: '30 20% 92%',
    card: '24 10% 8%',
    cardForeground: '30 20% 92%',
    popover: '24 10% 7%',
    popoverForeground: '30 20% 92%',
    primary: '32 86% 52%',
    primaryForeground: '30 25% 12%',
    secondary: '24 8% 15%',
    secondaryForeground: '30 20% 92%',
    muted: '24 8% 13%',
    mutedForeground: '30 10% 62%',
    accent: '32 60% 24%',
    accentForeground: '36 90% 88%',
    destructive: '0 70% 52%',
    destructiveForeground: '0 0% 98%',
    border: '24 8% 18%',
    input: '24 8% 18%',
    ring: '32 86% 52%',
    scheme: 'dark',
  },
};

/**
 * Parchment — light-mode counterpart. Cream paper, walnut ink, copper highlights.
 */
export const PARCHMENT: Skin = {
  id: 'parchment',
  name: 'Parchment',
  description: 'Cream paper and walnut ink. A daylight reading desk.',
  tokens: {
    background: '38 30% 94%',
    foreground: '24 25% 18%',
    card: '38 30% 97%',
    cardForeground: '24 25% 18%',
    popover: '38 30% 96%',
    popoverForeground: '24 25% 18%',
    primary: '24 65% 38%',
    primaryForeground: '38 40% 96%',
    secondary: '38 20% 86%',
    secondaryForeground: '24 25% 22%',
    muted: '38 20% 88%',
    mutedForeground: '24 15% 38%',
    accent: '32 60% 78%',
    accentForeground: '24 30% 22%',
    destructive: '0 65% 45%',
    destructiveForeground: '0 0% 98%',
    border: '38 18% 78%',
    input: '38 18% 80%',
    ring: '24 65% 38%',
    scheme: 'light',
  },
};

/**
 * Ink — high-contrast pure dark with cyan accents. Easy on tired eyes.
 */
export const INK: Skin = {
  id: 'ink',
  name: 'Ink',
  description: 'High-contrast pitch with cool cyan accents.',
  tokens: {
    background: '220 18% 4%',
    foreground: '210 25% 96%',
    card: '220 18% 7%',
    cardForeground: '210 25% 96%',
    popover: '220 18% 6%',
    popoverForeground: '210 25% 96%',
    primary: '192 90% 55%',
    primaryForeground: '220 30% 8%',
    secondary: '220 15% 14%',
    secondaryForeground: '210 25% 96%',
    muted: '220 15% 12%',
    mutedForeground: '210 15% 70%',
    accent: '192 70% 22%',
    accentForeground: '210 90% 96%',
    destructive: '0 75% 55%',
    destructiveForeground: '0 0% 98%',
    border: '220 15% 18%',
    input: '220 15% 18%',
    ring: '192 90% 55%',
    scheme: 'dark',
  },
};

export const BUILTIN_SKINS: readonly Skin[] = [EMBER, PARCHMENT, INK];

export const DEFAULT_SKIN_ID = EMBER.id;

/**
 * Apply a Skin to `:root` by writing each token as a CSS variable.
 * Idempotent — calling repeatedly with the same Skin is a no-op.
 */
export function applySkin(skin: Skin) {
  const root = document.documentElement;
  const t = skin.tokens;
  root.style.setProperty('--background', t.background);
  root.style.setProperty('--foreground', t.foreground);
  root.style.setProperty('--card', t.card);
  root.style.setProperty('--card-foreground', t.cardForeground);
  root.style.setProperty('--popover', t.popover);
  root.style.setProperty('--popover-foreground', t.popoverForeground);
  root.style.setProperty('--primary', t.primary);
  root.style.setProperty('--primary-foreground', t.primaryForeground);
  root.style.setProperty('--secondary', t.secondary);
  root.style.setProperty('--secondary-foreground', t.secondaryForeground);
  root.style.setProperty('--muted', t.muted);
  root.style.setProperty('--muted-foreground', t.mutedForeground);
  root.style.setProperty('--accent', t.accent);
  root.style.setProperty('--accent-foreground', t.accentForeground);
  root.style.setProperty('--destructive', t.destructive);
  root.style.setProperty(
    '--destructive-foreground',
    t.destructiveForeground,
  );
  root.style.setProperty('--border', t.border);
  root.style.setProperty('--input', t.input);
  root.style.setProperty('--ring', t.ring);
  root.style.colorScheme = t.scheme;
}

/**
 * Validate a JSON-loaded Skin payload. Returns the Skin or null.
 * Used when reading custom Skins from the user config dir.
 */
export function parseSkin(raw: unknown): Skin | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !r.id) return null;
  if (typeof r.name !== 'string' || !r.name) return null;
  if (!r.tokens || typeof r.tokens !== 'object') return null;
  const t = r.tokens as Record<string, unknown>;
  const required: (keyof SkinTokens)[] = [
    'background',
    'foreground',
    'card',
    'cardForeground',
    'popover',
    'popoverForeground',
    'primary',
    'primaryForeground',
    'secondary',
    'secondaryForeground',
    'muted',
    'mutedForeground',
    'accent',
    'accentForeground',
    'destructive',
    'destructiveForeground',
    'border',
    'input',
    'ring',
  ];
  const tokens: Partial<SkinTokens> = {};
  for (const k of required) {
    const v = t[k];
    if (typeof v !== 'string' || !v) return null;
    (tokens as Record<string, unknown>)[k] = v;
  }
  tokens.scheme = t.scheme === 'light' ? 'light' : 'dark';
  return {
    id: r.id,
    name: r.name,
    description: typeof r.description === 'string' ? r.description : '',
    tokens: tokens as SkinTokens,
  };
}
