/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set to "1" by the GitHub Pages deploy workflow for the static demo build. */
  readonly VITE_LW_DEMO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
