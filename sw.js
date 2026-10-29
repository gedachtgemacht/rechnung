const VERSION = 'dev';
/* rechnung. Service Worker: Shell cachen, index.html zuerst aus dem Netz. */
const CACHE = 'rechnung-' + VERSION;
const SHELL = ['./', './index.html', './logik.js', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const namen = await caches.keys();
    await Promise.all(namen.filter((n) => n.startsWith('rechnung-') && n !== CACHE).map((n) => caches.delete(n)));
    await clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const istSeite = req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('/index.html');
  if (istSeite) {
    e.respondWith((async () => {
      try {
        const antwort = await fetch(req);
        const c = await caches.open(CACHE);
        c.put('./index.html', antwort.clone());
        return antwort;
      } catch (_) {
        return (await caches.match('./index.html')) || (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }
  e.respondWith((async () => {
    const treffer = await caches.match(req);
    if (treffer) return treffer;
    try {
      const antwort = await fetch(req);
      if (antwort.ok) (await caches.open(CACHE)).put(req, antwort.clone());
      return antwort;
    } catch (_) {
      return Response.error();
    }
  })());
});
