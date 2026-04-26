/**
 * Build-time constants resolved from Vite env vars.
 */

/**
 * Set by the GitHub Pages workflow (VITE_LW_DEMO=1). When true the app
 * is running as a static preview without a sidecar — DemoBanner renders
 * a persistent warning and the failure splash short-circuits.
 */
export const IS_DEMO = import.meta.env.VITE_LW_DEMO === '1';

export const DEMO_SPLASH_DETAIL =
  "This is a static preview of the Loreweave UI hosted on GitHub Pages. The /lw sidecar that reads and writes your Sagas isn't available here — clone the repo and run `pnpm dev`, or open it in a GitHub Codespace, for the full editing experience.";
