/* СЛОВО — offline application shell. */
const CACHE = 'slovo-v5';
const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/fonts/golos-cyrillic.woff2',
  '/fonts/golos-latin.woff2',
  '/fonts/prata-cyrillic.woff2',
  '/fonts/prata-latin.woff2'
];

async function precacheShell() {
  const cache = await caches.open(CACHE);
  await cache.addAll(PRECACHE);
  // Hashed Vite assets are referenced by index.html but are not known until
  // build time. Parse the shell and cache its entry JS/CSS as well, otherwise
  // the first offline reload shows an HTML shell without the React app.
  const response = await fetch('/index.html', { cache: 'reload' });
  const html = await response.text();
  const assets = Array.from(html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g), (match) => match[1]);
  if (assets.length) await cache.addAll(Array.from(new Set(assets)));
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put('/index.html', copy));
          }
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request).then((response) => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
