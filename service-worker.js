const CACHE_VERSION = 'v1';
const CACHE_PREFIX = 'streambuddy-';
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`;
const APP_SHELL = [
  './',
  './index.html',
  './logo-sb.png',
  './manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request)
        .then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }

          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });

          return networkResponse;
        })
        .catch(() => {
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return caches.match(event.request);
        });
    })
  );
});

self.addEventListener('message', (event) => {
  if (!event.data || event.data.type !== 'SB_UPDATE') {
    return;
  }

  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX))
            .map((key) => caches.delete(key))
        );

        const cache = await caches.open(CACHE_NAME);
        await Promise.all(
          APP_SHELL.map((resource) =>
            cache.add(new Request(resource, { cache: 'reload' }))
          )
        );

        const clients = await self.clients.matchAll();
        clients.forEach((client) =>
          client.postMessage({ type: 'SB_UPDATE_COMPLETE' })
        );
      } catch (error) {
        const clients = await self.clients.matchAll();
        clients.forEach((client) =>
          client.postMessage({
            type: 'SB_UPDATE_ERROR',
            message: error && error.message ? error.message : 'Unknown error'
          })
        );
      }
    })()
  );
});
