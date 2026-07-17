/* Project Board — minimal offline shell service worker (base-path aware) */
const CACHE = 'project-board-shell-v2';
const SCOPE = self.registration.scope; // e.g. https://user.github.io/project-board/

self.addEventListener('install', (event) => {
  const shell = [
    SCOPE,
    SCOPE + 'index.html',
    SCOPE + 'manifest.webmanifest',
    SCOPE + 'favicon.svg',
  ];
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(shell).catch(() => undefined)));
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

      return network.then((res) => res || cached).catch(() => cached);
    }),
  );
});
