import React from "react";
import ReactDOM from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { ensurePersistence } from "./lib/db";
import App from "./App";
import "maplibre-gl/dist/maplibre-gl.css";
import "./styles/app.css";

// Trwałe przechowywanie (krytyczne na iOS — patrz research: 7-dniowa eksmisja).
ensurePersistence();

// Service worker (vite-plugin-pwa). 'prompt' — odświeżenie po akceptacji.
registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
