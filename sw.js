const CACHE_NAME = 'cascadia-pwa-cache-v6';
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
  // API calls (notably /api/pro-data, the Pro payload): network-first, and
  // the offline cache fallback is AGE-BOUNDED. Before v6 the fallback served
  // whatever response happened to be cached, however old: a client whose
  // last cached payload predated a ticker's Pro data (e.g. LITE, added
  // 2026-10-20) rendered that ticker's Pro sections as "not available"
  // while a fresh data.js gave the ticker a page. A cached API response
  // older than 24h is worse than an error the app can recover from, so it
  // is not served. Only successful GET responses are cached.
  if (url.pathname.startsWith('/api/') && event.request.method === 'GET') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          if (cached) {
            const servedAt = Date.parse(cached.headers.get('date') || '');
            if (!isNaN(servedAt) && (Date.now() - servedAt) < 24 * 60 * 60 * 1000) {
              return cached;
            }
          }
          return new Response(JSON.stringify({ error: 'offline' }), {
            status: 504,
            headers: { 'Content-Type': 'application/json' }
          });
        })
    );
    return;
  }
  // For data.js, use network-first (always get fresh data)
  if (url.pathname.endsWith('data.js')) {
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
