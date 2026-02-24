const CACHE_NAME = 'family-tree-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/fetch-family-data.js',
  'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600&family=Jost:wght@300;400;500;600&display=swap',
  'https://cdn.jsdelivr.net/gh/fperucic/treant-js/Treant.css',
  'https://ajax.googleapis.com/ajax/libs/jquery/3.6.0/jquery.min.js',
  'https://cdn.jsdelivr.net/gh/fperucic/treant-js/vendor/raphael.js',
  'https://cdn.jsdelivr.net/gh/fperucic/treant-js/Treant.js',
  'https://cdn.jsdelivr.net/npm/papaparse@5.3.2/papaparse.min.js'
];

// Install: cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: stale-while-revalidate for CSV data, cache-first for static assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // CSV data: stale-while-revalidate
  if (url.hostname === 'docs.google.com') {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(event.request).then((cached) => {
          const networkFetch = fetch(event.request).then((response) => {
            if (response.ok) {
              cache.put(event.request, response.clone());
            }
            return response;
          });
          return cached || networkFetch;
        })
      )
    );
    return;
  }

  // Static assets: cache-first
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
