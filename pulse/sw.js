// Pulse service worker: minimal, network-first. Its only jobs are to make the
// app installable (A2HS) and to serve the shell when offline. It never caches
// API traffic: the dashboard's data comes from the cross-origin pulse-worker,
// which this SW ignores entirely, so nothing stale is ever served.
const CACHE = 'pulse-v0.3.0';
const SHELL = ['./', './index.html', './site.webmanifest',
  './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Only handle same-origin GETs. API calls go to the cross-origin worker and
  // are left untouched so they always hit the network live.
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Network-first: fresh when online, cached shell as the offline fallback.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then((m) => m || caches.match('./index.html')))
  );
});
