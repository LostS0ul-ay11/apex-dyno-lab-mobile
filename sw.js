const CACHE_NAME = 'apex-dyno-mobile-v1';
const ASSETS_TO_CACHE = [
  './',
  'index.html',
  'manifest.json',
  'css/mobile.css?v=4',
  'js/engine-data.js?v=4',
  'js/engine-audio.js?v=4',
  'js/physics.js?v=4',
  'js/mobile-gauges.js?v=4',
  'js/mobile-app.js?v=4',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching shell assets');
      return cache.addAll(ASSETS_TO_CACHE).catch(err => {
        console.warn('[SW] Cache addAll warning (some assets may be fetched on demand):', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Removing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Network first with fallback to cache for offline support
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clone and save response to cache
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
