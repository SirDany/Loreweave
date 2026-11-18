/**
 * Skins & Injectable Patterns — Loreweave's theming architecture.
 *
 * Each Skin defines a distinct design archetype (Cosmic Glass, Sci-Fi HUD,
 * Matte Pastel, Punk Brutalist, Art-Deco Noir) across color contrast, shadow
 * geometry, glass blur, active-pill contrast, SVG ambient pattern, and matched
 * audio synthesis profile.
 */
import { setSoundProfile, type SoundProfileId } from '../lib/sound.js';

export type AmbientMotionStyle =
  | 'aurora-stars'
  | 'cyber-scan'
  | 'pastel-breeze'
  | 'punk-shards'
  | 'deco-shimmer';

export interface BackgroundPatternSpec {
  id: string;
  name: string;
  svg: string;
  size: string;
  opacity: number;
  motion: AmbientMotionStyle;
  hudReticles: boolean;
}

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
  radius: string;
  panelGradient: string;
  headerGradient: string;
  accentGradient: string;
  borderGlow: string;
  panelShadow: string;
  panelBlur: string;
  panelBorderWidth: string;
  topHighlightOpacity: string;
  activePillBg: string;
  activePillFg: string;
  activePillBorder: string;
  /** `dark` or `light`. Sets the browser's color-scheme. */
  scheme: 'dark' | 'light';
}

export interface Skin {
  id: string;
  name: string;
  archetype: string;
  description: string;
  patternId: string;
  soundProfile: SoundProfileId;
  tokens: SkinTokens;
}

// ---------- Injectable Background Pattern Registry -------------------------

const CONSTELLATION_MESH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 56 56" fill="none"><path d="M28 0L56 28L28 56L0 28Z" stroke="currentColor" stroke-opacity="0.28" stroke-width="0.85"/><path d="M0 0L56 56M56 0L0 56" stroke="currentColor" stroke-opacity="0.12" stroke-width="0.6"/><circle cx="28" cy="28" r="1.6" fill="currentColor" fill-opacity="0.65"/><circle cx="0" cy="0" r="1.1" fill="currentColor" fill-opacity="0.5"/><circle cx="56" cy="0" r="1.1" fill="currentColor" fill-opacity="0.5"/><circle cx="0" cy="56" r="1.1" fill="currentColor" fill-opacity="0.5"/><circle cx="56" cy="56" r="1.1" fill="currentColor" fill-opacity="0.5"/></svg>`;

const CIRCUIT_GRID_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48" fill="none"><path d="M48 0H0v48" stroke="currentColor" stroke-opacity="0.28" stroke-width="0.85"/><path d="M24 0v7M24 41v7M0 24h7M41 24h7" stroke="currentColor" stroke-opacity="0.42" stroke-width="1"/><circle cx="24" cy="24" r="1.3" stroke="currentColor" stroke-opacity="0.26" stroke-width="0.8"/><rect x="45" y="45" width="3" height="3" fill="currentColor" fill-opacity="0.55"/></svg>`;

const PAPER_BOTANICAL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none"><path d="M0 32C16 16 16 48 32 32C48 16 48 48 64 32" stroke="currentColor" stroke-opacity="0.28" stroke-width="1.1"/><path d="M32 0C16 16 48 16 32 32C16 48 48 48 32 64" stroke="currentColor" stroke-opacity="0.2" stroke-width="0.9"/><circle cx="16" cy="16" r="1.4" fill="currentColor" fill-opacity="0.36"/><circle cx="48" cy="48" r="1.4" fill="currentColor" fill-opacity="0.36"/></svg>`;

const HALFTONE_PUNK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28" fill="none"><circle cx="7" cy="7" r="2" fill="currentColor" fill-opacity="0.44"/><circle cx="21" cy="21" r="1.5" fill="currentColor" fill-opacity="0.34"/><path d="M19 3L25 9M3 19L9 25" stroke="currentColor" stroke-opacity="0.36" stroke-width="1.5"/></svg>`;

const DECO_LATTICE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="52" height="52" viewBox="0 0 52 52" fill="none"><path d="M26 2L50 26L26 50L2 26Z" stroke="currentColor" stroke-opacity="0.34" stroke-width="0.9"/><path d="M26 11L41 26L26 41L11 26Z" stroke="currentColor" stroke-opacity="0.24" stroke-width="0.8"/><path d="M26 0V52M0 26H52" stroke="currentColor" stroke-opacity="0.16" stroke-width="0.7"/></svg>`;

export const BUILTIN_PATTERNS: readonly BackgroundPatternSpec[] = [
  {
    id: 'constellation-mesh',
    name: 'Sacred Mesh',
    svg: CONSTELLATION_MESH_SVG,
    size: '56px 56px',
    opacity: 0.48,
    motion: 'aurora-stars',
    hudReticles: false,
  },
  {
    id: 'circuit-grid',
    name: 'Telemetry Grid',
    svg: CIRCUIT_GRID_SVG,
    size: '48px 48px',
    opacity: 0.45,
    motion: 'cyber-scan',
    hudReticles: true,
  },
  {
    id: 'paper-botanical',
    name: 'Linen & Leaf',
    svg: PAPER_BOTANICAL_SVG,
    size: '64px 64px',
    opacity: 0.46,
    motion: 'pastel-breeze',
    hudReticles: false,
  },
  {
    id: 'halftone-punk',
    name: 'Zine Halftone',
    svg: HALFTONE_PUNK_SVG,
    size: '28px 28px',
    opacity: 0.44,
    motion: 'punk-shards',
    hudReticles: false,
  },
  {
    id: 'deco-lattice',
    name: 'Deco Filigree',
    svg: DECO_LATTICE_SVG,
    size: '52px 52px',
    opacity: 0.46,
    motion: 'deco-shimmer',
    hudReticles: false,
  },
];

const patternRegistry = new Map<string, BackgroundPatternSpec>(
  BUILTIN_PATTERNS.map((p) => [p.id, p]),
);

export function registerBackgroundPattern(spec: BackgroundPatternSpec): void {
  patternRegistry.set(spec.id, spec);
}

export function getBackgroundPatterns(): readonly BackgroundPatternSpec[] {
  return Array.from(patternRegistry.values());
}

export function getBackgroundPattern(id: string): BackgroundPatternSpec {
  return patternRegistry.get(id) ?? BUILTIN_PATTERNS[0]!;
}

export function buildPatternDataUrl(svg: string, hslTriplet: string): string {
  const parts = hslTriplet.trim().split(/\s+/);
  const color =
    parts.length >= 3
      ? `hsl(${parts[0]}, ${parts[1]}, ${parts[2]})`
      : `hsl(${hslTriplet})`;
  const coloredSvg = svg.replaceAll('currentColor', color);
  return `url("data:image/svg+xml,${encodeURIComponent(coloredSvg)}")`;
}

// ---------- Built-in Archetype Skins ---------------------------------------

/**
 * Ethereal Horizon (`avl-ethereal`) — Archetype: Cosmic Glass
 * Velvet midnight indigo, frosted blur, cyan-to-violet aurora & celestial harmonics.
 */
export const AVL_ETHEREAL: Skin = {
  id: 'avl-ethereal',
  name: 'Ethereal Horizon',
  archetype: 'Cosmic Glass',
  description: 'Frosted midnight glass with cosmic cyan-violet auroras.',
  patternId: 'constellation-mesh',
  soundProfile: 'ethereal',
  tokens: {
    background: '252 55% 6%',
    foreground: '255 60% 97%',
    card: '250 46% 12%',
    cardForeground: '255 60% 97%',
    popover: '250 48% 11%',
    popoverForeground: '255 60% 97%',
    primary: '265 92% 70%',
    primaryForeground: '252 60% 8%',
    secondary: '248 38% 18%',
    secondaryForeground: '255 50% 95%',
    muted: '250 36% 15%',
    mutedForeground: '252 32% 74%',
    accent: '195 85% 24%',
    accentForeground: '192 100% 94%',
    destructive: '348 82% 60%',
    destructiveForeground: '0 0% 98%',
    border: '258 45% 28%',
    input: '250 40% 18%',
    ring: '192 95% 56%',
    radius: '1.05rem',
    panelGradient:
      'linear-gradient(155deg, rgba(24, 15, 48, 0.62) 0%, rgba(11, 7, 24, 0.70) 100%)',
    headerGradient:
      'linear-gradient(180deg, rgba(20, 12, 42, 0.78) 0%, rgba(10, 6, 22, 0.68) 100%)',
    accentGradient:
      'linear-gradient(135deg, hsl(192 95% 52% / 0.28) 0%, hsl(265 92% 65% / 0.28) 55%, hsl(320 85% 60% / 0.2) 100%)',
    borderGlow: 'hsl(265 92% 68% / 0.35)',
    panelShadow:
      '0 20px 40px -15px rgb(0 0 0 / 0.38), 0 0 26px -6px hsl(265 92% 68% / 0.26)',
    panelBlur: '24px',
    panelBorderWidth: '1px',
    topHighlightOpacity: '0.55',
    activePillBg:
      'linear-gradient(135deg, hsl(192 95% 52% / 0.3) 0%, hsl(265 92% 65% / 0.34) 100%)',
    activePillFg: 'hsl(255 60% 98%)',
    activePillBorder: 'hsl(265 92% 72% / 0.72)',
    scheme: 'dark',
  },
};

/**
 * Neon Cyberdeck (`cyber-dark`) — Archetype: Sci-Fi HUD
 * Chamfered dark carbon decks, scanline grid, electric cyan & laser magenta glow.
 */
export const CYBER_DARK: Skin = {
  id: 'cyber-dark',
  name: 'Neon Cyberdeck',
  archetype: 'Sci-Fi HUD',
  description: 'Chamfered carbon decks with neon cyan scanlines and telemetry HUD.',
  patternId: 'circuit-grid',
  soundProfile: 'cyber',
  tokens: {
    background: '216 68% 5%',
    foreground: '195 60% 97%',
    card: '214 55% 10%',
    cardForeground: '195 60% 97%',
    popover: '214 55% 9%',
    popoverForeground: '195 60% 97%',
    primary: '186 100% 50%',
    primaryForeground: '216 65% 6%',
    secondary: '214 42% 16%',
    secondaryForeground: '195 50% 95%',
    muted: '214 40% 13%',
    mutedForeground: '196 38% 70%',
    accent: '310 78% 28%',
    accentForeground: '310 100% 94%',
    destructive: '0 84% 60%',
    destructiveForeground: '0 0% 98%',
    border: '192 85% 32%',
    input: '214 45% 16%',
    ring: '310 96% 62%',
    radius: '0.25rem',
    panelGradient:
      'linear-gradient(155deg, rgba(16, 20, 32, 0.64) 0%, rgba(8, 10, 18, 0.72) 100%)',
    headerGradient:
      'linear-gradient(180deg, rgba(14, 18, 28, 0.80) 0%, rgba(8, 10, 16, 0.70) 100%)',
    accentGradient:
      'linear-gradient(135deg, hsl(186 100% 50% / 0.25) 0%, hsl(310 96% 62% / 0.22) 100%)',
    borderGlow: 'hsl(186 100% 50% / 0.4)',
    panelShadow:
      '0 14px 32px -10px rgb(0 0 0 / 0.6), 0 0 22px -6px hsl(186 100% 50% / 0.35)',
    panelBlur: '14px',
    panelBorderWidth: '1px',
    topHighlightOpacity: '0.7',
    activePillBg: 'hsl(186 100% 48% / 0.24)',
    activePillFg: 'hsl(186 100% 94%)',
    activePillBorder: 'hsl(186 100% 52% / 0.85)',
    scheme: 'dark',
  },
};

/**
 * Botanical Atelier (`precision-light`) — Archetype: Matte Pastel
 * Warm alabaster daylight paper, zero blur/neon, deep forest-espresso ink & terracotta.
 */
export const PRECISION_LIGHT: Skin = {
  id: 'precision-light',
  name: 'Botanical Atelier',
  archetype: 'Matte Pastel',
  description: 'Matte warm ivory paper, deep sage ink, terracotta and acoustic taps.',
  patternId: 'paper-botanical',
  soundProfile: 'organic',
  tokens: {
    background: '40 34% 93%',
    foreground: '162 45% 13%',
    card: '42 45% 98%',
    cardForeground: '162 45% 13%',
    popover: '42 48% 99%',
    popoverForeground: '162 45% 13%',
    primary: '158 54% 28%',
    primaryForeground: '0 0% 100%',
    secondary: '38 26% 87%',
    secondaryForeground: '162 45% 16%',
    muted: '40 22% 86%',
    mutedForeground: '160 22% 33%',
    accent: '154 32% 84%',
    accentForeground: '158 54% 20%',
    destructive: '0 72% 45%',
    destructiveForeground: '0 0% 100%',
    border: '38 22% 76%',
    input: '40 24% 85%',
    ring: '16 68% 42%',
    radius: '0.85rem',
    panelGradient:
      'linear-gradient(160deg, rgba(255, 253, 247, 0.72) 0%, rgba(235, 243, 232, 0.64) 100%)',
    headerGradient:
      'linear-gradient(180deg, rgba(252, 250, 242, 0.82) 0%, rgba(238, 244, 234, 0.72) 100%)',
    accentGradient:
      'linear-gradient(135deg, hsl(158 54% 28% / 0.14) 0%, hsl(16 68% 42% / 0.12) 100%)',
    borderGlow: 'transparent',
    panelShadow:
      '0 10px 28px -12px hsl(32 30% 25% / 0.16), 0 1px 3px hsl(32 25% 25% / 0.08)',
    panelBlur: '0px',
    panelBorderWidth: '1px',
    topHighlightOpacity: '0',
    activePillBg: 'hsl(158 54% 28%)',
    activePillFg: 'hsl(0 0% 100%)',
    activePillBorder: 'hsl(158 58% 22%)',
    scheme: 'light',
  },
};

/**
 * Riot Zine (`ember`) — Archetype: Punk Brutalist
 * Asphalt charcoal, acid lime + hot punk magenta, crisp 2px borders & hard poster drop-shadows.
 */
export const EMBER: Skin = {
  id: 'ember',
  name: 'Riot Zine',
  archetype: 'Punk Brutalist',
  description: 'Stark charcoal poster stock, acid lime, punk magenta & hard block shadows.',
  patternId: 'halftone-punk',
  soundProfile: 'punk',
  tokens: {
    background: '275 18% 9%',
    foreground: '60 30% 96%',
    card: '276 20% 13%',
    cardForeground: '60 30% 96%',
    popover: '276 22% 11%',
    popoverForeground: '60 30% 96%',
    primary: '78 96% 52%',
    primaryForeground: '275 25% 8%',
    secondary: '276 18% 19%',
    secondaryForeground: '60 25% 95%',
    muted: '276 18% 16%',
    mutedForeground: '275 16% 72%',
    accent: '328 85% 30%',
    accentForeground: '328 100% 95%',
    destructive: '0 90% 58%',
    destructiveForeground: '0 0% 100%',
    border: '78 65% 44%',
    input: '276 20% 18%',
    ring: '328 96% 58%',
    radius: '0.15rem',
    panelGradient:
      'linear-gradient(145deg, rgba(36, 24, 44, 0.70) 0%, rgba(22, 14, 28, 0.78) 100%)',
    headerGradient:
      'linear-gradient(180deg, rgba(30, 18, 38, 0.84) 0%, rgba(20, 12, 26, 0.76) 100%)',
    accentGradient: 'linear-gradient(135deg, hsl(78 96% 52%) 0%, hsl(100 90% 50%) 100%)',
    borderGlow: 'transparent',
    panelShadow: '4px 4px 0px 0px hsl(328 96% 58% / 0.85)',
    panelBlur: '0px',
    panelBorderWidth: '2px',
    topHighlightOpacity: '0',
    activePillBg: 'hsl(78 96% 52%)',
    activePillFg: 'hsl(275 25% 8%)',
    activePillBorder: 'hsl(328 96% 58%)',
    scheme: 'dark',
  },
};

/**
 * Noir Velvet (`titanium`) — Archetype: Art-Deco Noir
 * Smoked espresso-onyx matte velvet paired with antique champagne gold & Bordeaux rose.
 */
export const TITANIUM: Skin = {
  id: 'titanium',
  name: 'Noir Velvet',
  archetype: 'Art-Deco Noir',
  description: 'Matte smoked onyx velvet with antique champagne gold & Bordeaux accents.',
  patternId: 'deco-lattice',
  soundProfile: 'noir',
  tokens: {
    background: '24 14% 7%',
    foreground: '40 38% 93%',
    card: '26 16% 11%',
    cardForeground: '40 38% 93%',
    popover: '26 16% 10%',
    popoverForeground: '40 38% 93%',
    primary: '40 62% 58%',
    primaryForeground: '24 20% 8%',
    secondary: '26 14% 17%',
    secondaryForeground: '40 32% 91%',
    muted: '26 14% 15%',
    mutedForeground: '36 18% 68%',
    accent: '348 45% 24%',
    accentForeground: '40 45% 94%',
    destructive: '0 72% 54%',
    destructiveForeground: '0 0% 98%',
    border: '40 34% 28%',
    input: '26 15% 18%',
    ring: '348 45% 54%',
    radius: '0.45rem',
    panelGradient:
      'linear-gradient(165deg, rgba(33, 27, 24, 0.64) 0%, rgba(18, 15, 13, 0.74) 100%)',
    headerGradient:
      'linear-gradient(180deg, rgba(33, 27, 24, 0.80) 0%, rgba(20, 16, 14, 0.72) 100%)',
    accentGradient:
      'linear-gradient(135deg, hsl(40 62% 58% / 0.24) 0%, hsl(348 45% 54% / 0.2) 100%)',
    borderGlow: 'hsl(40 62% 58% / 0.2)',
    panelShadow:
      '0 18px 36px -14px rgb(0 0 0 / 0.65), inset 0 0 0 1px hsl(40 50% 60% / 0.12)',
    panelBlur: '6px',
    panelBorderWidth: '1px',
    topHighlightOpacity: '0.22',
    activePillBg:
      'linear-gradient(135deg, hsl(40 62% 54% / 0.28) 0%, hsl(348 45% 50% / 0.22) 100%)',
    activePillFg: 'hsl(40 55% 94%)',
    activePillBorder: 'hsl(40 62% 58% / 0.72)',
    scheme: 'dark',
  },
};

export const BUILTIN_SKINS: readonly Skin[] = [
  AVL_ETHEREAL,
  CYBER_DARK,
  PRECISION_LIGHT,
  EMBER,
  TITANIUM,
];

const customSkins: Skin[] = [];

export function registerSkin(skin: Skin): void {
  const existing = customSkins.findIndex((s) => s.id === skin.id);
  if (existing >= 0) {
    customSkins[existing] = skin;
  } else {
    customSkins.push(skin);
  }
}

export function getAllSkins(): Skin[] {
  return [...BUILTIN_SKINS, ...customSkins];
}

export const DEFAULT_SKIN_ID = AVL_ETHEREAL.id;

function tokenEntries(t: SkinTokens): Array<[string, string]> {
  return [
    ['--background', t.background],
    ['--foreground', t.foreground],
    ['--card', t.card],
    ['--card-foreground', t.cardForeground],
    ['--popover', t.popover],
    ['--popover-foreground', t.popoverForeground],
    ['--primary', t.primary],
    ['--primary-foreground', t.primaryForeground],
    ['--secondary', t.secondary],
    ['--secondary-foreground', t.secondaryForeground],
    ['--muted', t.muted],
    ['--muted-foreground', t.mutedForeground],
    ['--accent', t.accent],
    ['--accent-foreground', t.accentForeground],
    ['--destructive', t.destructive],
    ['--destructive-foreground', t.destructiveForeground],
    ['--border', t.border],
    ['--input', t.input],
    ['--ring', t.ring],
    ['--radius', t.radius],
    ['--panel-gradient', t.panelGradient],
    ['--header-gradient', t.headerGradient],
    ['--accent-gradient', t.accentGradient],
    ['--border-glow', t.borderGlow],
    ['--panel-shadow', t.panelShadow],
    ['--panel-blur', t.panelBlur],
    ['--panel-border-width', t.panelBorderWidth],
    ['--top-highlight-opacity', t.topHighlightOpacity],
    ['--active-pill-bg', t.activePillBg],
    ['--active-pill-fg', t.activePillFg],
    ['--active-pill-border', t.activePillBorder],
  ];
}

/**
 * Returns a style map of all CSS custom properties + base colors for reactive React containers.
 */
export function getSkinCssVars(skin: Skin): Record<string, string> {
  const t = skin.tokens;
  const activePattern = getBackgroundPattern(skin.patternId);
  const vars: Record<string, string> = {};
  for (const [k, v] of tokenEntries(t)) {
    vars[k] = v;
  }
  vars['--skin-pattern-image'] = buildPatternDataUrl(activePattern.svg, t.primary);
  vars['--skin-pattern-size'] = activePattern.size;
  vars.backgroundColor = `hsl(${t.background})`;
  vars.color = `hsl(${t.foreground})`;
  vars.colorScheme = t.scheme;
  return vars;
}

const STYLE_ELEMENT_ID = 'lw-active-skin-css';

/**
 * Triple-enforces a Skin across `:root`, `body`, `#root`, and `[data-theme]`
 * via `!important` inline properties, sets archetype & pattern attributes, and switches audio profile.
 */
export function applySkin(skin: Skin) {
  setSoundProfile(skin.soundProfile);
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const body = document.body;
  const t = skin.tokens;
  const activePattern = getBackgroundPattern(skin.patternId);
  const entries: Array<[string, string]> = [
    ...tokenEntries(t),
    ['--skin-pattern-image', buildPatternDataUrl(activePattern.svg, t.primary)],
    ['--skin-pattern-size', activePattern.size],
  ];

  for (const [name, value] of entries) {
    root.style.setProperty(name, value, 'important');
    if (body) {
      body.style.setProperty(name, value, 'important');
    }
  }

  root.style.colorScheme = t.scheme;
  root.setAttribute('data-theme', skin.id);
  root.setAttribute('data-archetype', skin.archetype);
  root.setAttribute('data-pattern', activePattern.id);
  root.style.setProperty('background-color', `hsl(${t.background})`, 'important');
  root.style.setProperty('color', `hsl(${t.foreground})`, 'important');

  if (body) {
    body.setAttribute('data-theme', skin.id);
    body.setAttribute('data-archetype', skin.archetype);
    body.setAttribute('data-pattern', activePattern.id);
    body.style.colorScheme = t.scheme;
    body.style.setProperty('background-color', `hsl(${t.background})`, 'important');
    body.style.setProperty('color', `hsl(${t.foreground})`, 'important');
  }

  if (t.scheme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  if (document.head) {
    let styleEl = document.getElementById(STYLE_ELEMENT_ID) as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = STYLE_ELEMENT_ID;
      document.head.appendChild(styleEl);
    }
    const cssVars = entries.map(([k, v]) => `${k}: ${v} !important;`).join('\n  ');
    styleEl.textContent = `:root, html, body, #root, [data-theme] {\n  color-scheme: ${t.scheme} !important;\n  ${cssVars}\n  background-color: hsl(${t.background}) !important;\n  color: hsl(${t.foreground}) !important;\n}`;
  }
}
