import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Offline-first PWA. App-shell jest precache'owany; kafelki mapy (MapLibre/PMTiles
// lub raster) cache'owane runtime ze strategią CacheFirst.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "MiroBike Ultra Planner",
        short_name: "MiroBike",
        description: "Planer postojów i noclegów na trasie ultra — offline.",
        theme_color: "#14161b",
        background_color: "#14161b",
        display: "standalone",
        orientation: "portrait",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        // PMTiles są pobierane przez byte-range — cache'ujemy zakresy.
        runtimeCaching: [
          {
            urlPattern: /\.pmtiles$/,
            handler: "CacheFirst",
            options: {
              cacheName: "map-pmtiles",
              cacheableResponse: { statuses: [0, 200, 206] },
              rangeRequests: true,
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 60 },
            },
          },
          {
            // fallback rastrowy (np. MapTiler) gdyby ktoś go użył
            urlPattern: /\/tiles\/.*\.(png|webp|jpg)$/,
            handler: "CacheFirst",
            options: {
              cacheName: "map-raster",
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 3000, maxAgeSeconds: 60 * 60 * 24 * 60 },
            },
          },
        ],
      },
    }),
  ],
});
