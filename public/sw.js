/* Project Board — minimal offline shell service worker */
const CACHE = 'project-board-shell-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(['/', '/index.html', '/manifest.webmanifest', '/favicon.svg']),
    ),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          // Cache successful same-origin navigations and static assets
          if (
            response &&
            response.ok &&
            (request.mode === 'navigate' ||
              request.url.includes('/assets/') ||
              request.url.endsWith('.svg') ||
              request.url.endsWith('.png') ||
              request.url.endsWith('.webmanifest'))
          ) {
            const clone = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);

      // Prefer network; fall back to cache for offline
      return network.then((res) => res || cached).catch(() => cached);
    }),
  );
});
