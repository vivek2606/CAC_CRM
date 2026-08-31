// Deliberately minimal: this app is a live CRM, so pages and data must
// always come from the network - never served stale from a cache. This
// service worker exists only to make the app installable and to cache the
// truly static icon assets, not to enable offline use of live data.
const STATIC_CACHE = "sakuragi-static-v1";
const STATIC_PATHS = ["/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_PATHS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || !STATIC_PATHS.includes(url.pathname)) return;

  event.respondWith(
    caches.match(event.request).then((cached) => cached ?? fetch(event.request))
  );
});
