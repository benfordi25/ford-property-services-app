/* FPS Dashboard Service Worker
   Network-first for HTML so updates always load (no data wipe)
*/

const CACHE_NAME = "fps-dashboard-v3"; // <- bump this number any time you update apps
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest"
];

// Install: cache core shell
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).catch(() => {})
  );
});

// Activate: remove old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve())));
      await self.clients.claim();
    })()
  );
});

// Fetch:
// 1) HTML navigations = NETWORK FIRST (so you always get latest)
// 2) Everything else = cache-first
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Always fetch newest HTML (this fixes your "old version in installed app" problem)
  if (req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Cache-first for assets (fast)
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req))
  );
});
