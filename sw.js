// CampusCare service worker.
// IMPORTANT: the app's OWN files (HTML/JS/CSS) are served NETWORK-FIRST so a
// new version always loads immediately — no stale code, no "need to refresh",
// no mixed old/new files. Only stable third-party libraries (Firebase SDK,
// Chart/Leaflet/Lucide, fonts) are cached for speed. Live data is never cached.
const CACHE = 'campuscare-v13';
const SHELL = [
  './', './index.html',
  './assets/css/tailwind.css', './assets/css/style.css',
  './assets/img/campuscare-mark.svg', './assets/img/icon-192.png',
];
const CDN_HOSTS = ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com', 'www.gstatic.com'];
const NEVER_CACHE = ['firestore.googleapis.com', 'identitytoolkit.googleapis.com', 'securetoken.googleapis.com', 'api.cloudinary.com', 'firebaseinstallations.googleapis.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
    // Existing tabs keep running without a forced page navigation. They pick
    // up the current assets on their next normal load, without losing form or
    // dashboard state during a background service-worker update.
  })());
});

function networkFirst(req) {
  return fetch(req).then(res => {
    if (res && res.ok) { const c = res.clone(); caches.open(CACHE).then(k => k.put(req, c)).catch(() => {}); }
    return res;
  }).catch(() => caches.match(req).then(r => r || (req.mode === 'navigate' ? caches.match('./index.html') : undefined)));
}

function staleWhileRevalidate(req) {
  return caches.open(CACHE).then(cache => cache.match(req).then(cached => {
    const network = fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()).catch(() => {});
      return res;
    }).catch(() => cached);
    return cached || network;
  }));
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (NEVER_CACHE.includes(url.hostname)) return;              // live data → network

  if (url.origin === location.origin) {                       // our own app → always fresh
    e.respondWith(networkFirst(req));
    return;
  }
  if (CDN_HOSTS.includes(url.hostname)) {                      // stable libraries → cached
    e.respondWith(staleWhileRevalidate(req));
  }
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || './index.html';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) { if ('focus' in c) { c.postMessage({ type: 'open', data: e.notification.data || {} }); return c.focus(); } }
    return self.clients.openWindow(target);
  }));
});
