import { Shell } from './shell/Shell.js';
import { useApp } from './state/useApp.js';

/**
 * Thin entry point. All meaningful work lives in `useApp` (state +
 * derivations) and `Shell` (layout). Wrap with `<SkinProvider>` in
 * `main.tsx`.
 */
export default function App() {
  const app = useApp();
  return <Shell app={app} />;
}
