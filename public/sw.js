// Kairos offline support: keeps the app's files so it opens with no connection.
// Your data isn't stored here: the app keeps it in this browser and saves it once you're online.
//
// - Pages: from the network when online (so you always get the latest version), else the saved copy.
// - Built files (/assets/*, named by content so they never change): saved the first time, then reused.
// - Anything else on another site (Supabase, fonts, routing) is left alone.
const CACHE = 'kairos-app-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(saveApp().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Save the page and the files it uses, dropping old versions' files. */
async function saveApp(page) {
  const cache = await caches.open(CACHE);
  const res = page ?? (await fetch('/', { cache: 'no-store' }));
  if (!res.ok) return;
  const html = await res.clone().text();
  await cache.put('/', res);
  const files = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
  await Promise.all(files.map((f) => cache.match(f).then((hit) => hit || cache.add(f))));
  // Built files from older versions that the current page no longer uses.
  for (const req of await cache.keys()) {
    const path = new URL(req.url).pathname;
    if (path.startsWith('/assets/') && !files.includes(path)) await cache.delete(req);
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && url.pathname === '/') event.waitUntil(saveApp(res.clone()));
          return res;
        })
        .catch(async () => (await caches.match('/')) ?? Response.error()),
    );
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ??
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              event.waitUntil(caches.open(CACHE).then((c) => c.put(req, copy)));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Icon, manifest, sw.js itself: network first, saved copy when offline.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          event.waitUntil(caches.open(CACHE).then((c) => c.put(req, copy)));
        }
        return res;
      })
      .catch(async () => (await caches.match(req)) ?? Response.error()),
  );
});
