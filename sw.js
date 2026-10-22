const CACHE_NAME = 'cascadia-pwa-cache-v5';
// Precache only the PWA manifest. The HTML shell and app code are deliberately
// NOT precached: v2 precached '/' and '/index.html' and served them cache-first
// under a cache name that never changed, so returning visitors (notably the
// installed home-screen app) could be stranded on a stale page shell after a
// layout deploy. Navigations are network-first below.
const urlsToCache = [
  '/manifest.json'
];

// Install the service worker and cache assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .catch(err => console.log('Cache install failed:', err))
  );
  self.skipWaiting();
});

// Serve cached content when offline, but always try network first for data files
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // Documents republished at stable URLs (research note PDFs under /notes/,
  // memo visuals under /memo-images/) must never be served cache-first: the
  // v3 static branch cached the first fetched copy of a note and served it
  // indefinitely, so updated reports never reached returning visitors.
  // Network-first, like data.
  if (url.pathname.startsWith('/notes/') || url.pathname.startsWith('/memo-images/') || url.pathname.endsWith('.pdf')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }
  // For data.js and API calls, use network-first (always get fresh data)
  if (url.pathname.endsWith('data.js') || url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Update cache with fresh response
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }
  // Page navigations and the HTML shell: network-first so code and layout
  // updates land on the next visit; the cache is only an offline fallback.
  if (event.request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('/index.html')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put('/index.html', responseClone));
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }
  // Static assets (app.js is versioned by query string, so each version is an
  // immutable URL): cache-first per exact URL, populated on first fetch.
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) return response;
        return fetch(event.request).then(netResponse => {
          const responseClone = netResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
          return netResponse;
        });
      })
  );
});

// Clean up old caches (activating a new version purges every older cache,
// including any stale note PDFs cached by v3) and take control of open
// pages immediately so the fix applies without a restart.
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});
