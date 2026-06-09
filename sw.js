// MiroBike Ultra Planner — service worker (offline app shell)
const CACHE = "mirobike-v2";
const ASSETS = [
  "./", "index.html", "data.js", "logo.svg", "manifest.webmanifest",
  "icon-192.png", "icon-512.png", "apple-touch-icon.png",
  "leaflet/leaflet.js", "leaflet/leaflet.css",
  "leaflet/images/marker-icon.png", "leaflet/images/marker-icon-2x.png",
  "leaflet/images/marker-shadow.png", "leaflet/images/layers.png", "leaflet/images/layers-2x.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  // tylko zasoby aplikacji (ten sam origin) serwujemy z cache; kafelki map OSM idą normalnie do sieci
  if (url.origin === location.origin) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
  }
});
