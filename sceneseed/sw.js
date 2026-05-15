// SceneSeed — minimal service worker.
//
// Goal: make the app PWA-installable + give a tiny offline fallback for
// already-visited pages. We are intentionally *not* trying to cache
// Firebase responses, Google Analytics, or the QR library — those need
// to be live for the app to work.
//
// Cache key includes a version stamp; bumping it on a release wipes the
// old cache and forces a fresh fetch of the shell.
const VERSION = 'v1.1.0';
const CACHE = `sceneseed-${VERSION}`;

// Static assets to pre-cache on install. Keep this list short — anything
// listed here must successfully fetch or the install fails entirely.
const PRECACHE = [
  './',
  './index.html',
  './styles.css',
  './favicon.svg',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png',
  './site.webmanifest'
];

// Domains we should NEVER intercept — let the network handle these so
// auth tokens, live Firestore data, analytics pings, etc. stay current.
const BYPASS_HOSTS = [
  'googleapis.com',
  'gstatic.com',
  'googletagmanager.com',
  'google-analytics.com',
  'firebaseapp.com',
  'esm.run',
  'cdn.jsdelivr.net'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Skip cross-origin requests we shouldn't intercept.
  if (BYPASS_HOSTS.some((h) => url.host.endsWith(h))) return;

  // Cache-first for same-origin GETs.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((res) => {
          // Stash successful same-origin responses for next time.
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          }
          return res;
        })
        .catch(() => {
          // Offline fallback for navigations: return the cached landing page.
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return new Response('', { status: 504, statusText: 'Offline' });
        });
    })
  );
});
