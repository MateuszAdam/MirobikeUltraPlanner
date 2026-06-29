import React from "react";
import ReactDOM from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { ensurePersistence } from "./lib/db";
import Root from "./Root";
import "maplibre-gl/dist/maplibre-gl.css";
import "./styles/app.css";
import "./styles/auth.css";

// Trwałe przechowywanie (krytyczne na iOS — patrz research: 7-dniowa eksmisja).
ensurePersistence();

// Service worker (vite-plugin-pwa). 'prompt' — pokaż toast i odśwież po kliknięciu.
const updateSW = registerSW({
  onNeedRefresh() {
    const bar = document.createElement("button");
    bar.textContent = "✨ Nowa wersja — odśwież";
    bar.style.cssText =
      "position:fixed;left:50%;bottom:calc(80px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);" +
      "z-index:2000;background:#19e0d6;color:#04201e;font-weight:800;font-size:14px;border:none;padding:13px 20px;" +
      "border-radius:999px;box-shadow:0 6px 20px #0008;font-family:system-ui;cursor:pointer";
    bar.onclick = () => updateSW(true);
    document.body.appendChild(bar);
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
