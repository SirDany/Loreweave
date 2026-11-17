/**
 * Skins — Loreweave's theming system.
 *
 * A Skin is a flat map of HSL tokens that get written to `:root` as
 * CSS variables. Tailwind config + index.css consume those variables.
 *
 * Designed with contemporary, high-precision engineering aesthetics:
 * - Cyber Dark: High-tech carbon navy with neon electric cyan telemetry.
 * - Precision Light: Architectural daylight canvas with precision cobalt accents.
 * - Ember Obsidian: Warm volcanic espresso obsidian with radiant molten amber.
 * - Aero Titanium: Industrial aerospace steel slate with laser emerald telemetry.
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
 * Cyber Dark — High-tech carbon with electric precision cyan.
 */
export const CYBER_DARK: Skin = {
  id: 'cyber-dark',
  name: 'Cyber Dark',
  description: 'Deep obsidian carbon navy with glowing electric cyan telemetry.',
  tokens: {
    background: '222 47% 6%',           // #080c14 deep carbon navy
    foreground: '210 40% 98%',          // crisp pure white/ice
    card: '222 40% 11%',                // #111827 elevated carbon panel
    cardForeground: '210 40% 98%',
    popover: '222 40% 9%',              // #0d1422
    popoverForeground: '210 40% 98%',
    primary: '186 100% 48%',            // #00f0ff electric cyan
    primaryForeground: '222 47% 6%',
    secondary: '222 30% 16%',
    secondaryForeground: '210 40% 96%',
    muted: '222 30% 14%',
    mutedForeground: '215 20% 68%',
    accent: '186 100% 16%',
    accentForeground: '186 100% 90%',
    destructive: '0 84% 60%',
    destructiveForeground: '0 0% 98%',
    border: '222 28% 22%',              // #283448 refined carbon border
    input: '222 28% 18%',
    ring: '186 100% 48%',
    scheme: 'dark',
  },
};

/**
 * Precision Light — Ultra-crisp architectural daylight white and cool slate with deep cobalt.
 */
export const PRECISION_LIGHT: Skin = {
  id: 'precision-light',
  name: 'Precision Light',
  description: 'Architectural daylight canvas with technical cobalt accents.',
  tokens: {
    background: '210 25% 95%',          // #eff2f6 clean cool architectural canvas
    foreground: '222 47% 11%',          // #0f1728 deep midnight slate text
    card: '0 0% 100%',                  // #ffffff pure crisp white
    cardForeground: '222 47% 11%',
    popover: '0 0% 100%',
    popoverForeground: '222 47% 11%',
    primary: '221 83% 53%',             // #2563eb precision cobalt
    primaryForeground: '0 0% 100%',
    secondary: '214 30% 90%',
    secondaryForeground: '222 47% 15%',
    muted: '214 25% 91%',
    mutedForeground: '215 20% 40%',
    accent: '217 90% 94%',
    accentForeground: '221 83% 53%',
    destructive: '0 72% 51%',
    destructiveForeground: '0 0% 98%',
    border: '214 30% 82%',              // #cbd5e1 defined crisp borders
    input: '214 30% 84%',
    ring: '221 83% 53%',
    scheme: 'light',
  },
};

/**
 * Ember Obsidian — Volcanic warm espresso graphite with radiant molten amber.
 */
export const EMBER: Skin = {
  id: 'ember',
  name: 'Ember Obsidian',
  description: 'Volcanic espresso obsidian with radiant molten amber and copper accents.',
  tokens: {
    background: '24 24% 9%',            // #1c1411 distinct warm espresso charcoal
    foreground: '35 40% 95%',           // #fdf8f0 warm ivory
    card: '24 20% 15%',                 // #2e201b rich warm espresso card
    cardForeground: '35 40% 95%',
    popover: '24 20% 12%',
    popoverForeground: '35 40% 95%',
    primary: '36 100% 50%',             // #ff9900 radiant molten amber
    primaryForeground: '24 25% 8%',
    secondary: '24 16% 20%',
    secondaryForeground: '35 40% 92%',
    muted: '24 16% 18%',
    mutedForeground: '30 20% 68%',
    accent: '36 80% 22%',
    accentForeground: '36 100% 90%',
    destructive: '0 70% 52%',
    destructiveForeground: '0 0% 98%',
    border: '24 28% 28%',               // #5c3d2e warm copper border
    input: '24 24% 22%',
    ring: '36 100% 50%',
    scheme: 'dark',
  },
};

/**
 * Aero Titanium — Industrial aerospace steel slate with laser emerald telemetry.
 */
export const TITANIUM: Skin = {
  id: 'titanium',
  name: 'Aero Titanium',
  description: 'Industrial aerospace steel slate with laser emerald telemetry accents.',
  tokens: {
    background: '215 24% 13%',          // #19212d industrial cool steel slate
    foreground: '210 25% 96%',          // #f1f5f9 titanium silver
    card: '215 20% 20%',                // #283445 elevated machined titanium panel
    cardForeground: '210 25% 96%',
    popover: '215 20% 17%',
    popoverForeground: '210 25% 96%',
    primary: '156 86% 45%',             // #10b981 laser emerald
    primaryForeground: '215 25% 8%',
    secondary: '215 16% 25%',
    secondaryForeground: '210 25% 96%',
    muted: '215 16% 22%',
    mutedForeground: '215 15% 68%',
    accent: '156 75% 20%',
    accentForeground: '156 86% 92%',
    destructive: '0 75% 55%',
    destructiveForeground: '0 0% 98%',
    border: '215 18% 32%',              // #43546c technical aerospace steel border
    input: '215 18% 26%',
    ring: '156 86% 45%',
    scheme: 'dark',
  },
};

export const BUILTIN_SKINS: readonly Skin[] = [
  CYBER_DARK,
  PRECISION_LIGHT,
  EMBER,
  TITANIUM,
];

export const DEFAULT_SKIN_ID = CYBER_DARK.id;

/**
 * Apply a Skin to `:root` by writing each token as a CSS variable
 * and updating the classList and explicit styles for instant reactivity.
 */
export function applySkin(skin: Skin) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const body = document.body;
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

  // Set data-theme on html for explicit theme selectors and CSS inspection
  root.setAttribute('data-theme', skin.id);

  // Directly set inline background and color on root and body
  root.style.backgroundColor = `hsl(${t.background})`;
  root.style.color = `hsl(${t.foreground})`;
  if (body) {
    body.style.backgroundColor = `hsl(${t.background})`;
    body.style.color = `hsl(${t.foreground})`;
  }

  if (t.scheme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}
