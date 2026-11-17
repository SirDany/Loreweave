import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.js";
import { bootLensCatalog } from "./loom/catalog.js";
import { bootContribLenses } from "./loom/contrib/index.js";
import { initGlobalSoundEffects } from "./lib/sound.js";
import { SkinProvider } from "./theme/SkinProvider.js";
import "./index.css";

bootLensCatalog();
bootContribLenses();
initGlobalSoundEffects();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SkinProvider>
      <App />
    </SkinProvider>
  </React.StrictMode>,
);
