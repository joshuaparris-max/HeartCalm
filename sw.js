/* Calm — service worker
   Cache-first for the app shell so it works fully offline once loaded.
   Bump CACHE when you change any file to force an update. */
const CACHE = 'calm-v4';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './pure.js',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      // cache same-origin successful responses for offline use
      if (res.ok && new URL(e.request.url).origin === location.origin) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});

/* Best-effort background reminders (upgrade #4). Periodic Background Sync is
   only supported on some Chromium browsers and needs an installed PWA; the
   in-page ticker remains the reliable fallback. */
self.addEventListener('periodicsync', event => {
  if (event.tag === 'calm-reminders') {
    event.waitUntil(self.registration.showNotification('Calm', {
      body: 'Time for a breathing round — and a sip of water.',
      tag: 'calm-reminder',
    }));
  }
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: 'window' }).then(list => {
    for (const c of list) { if ('focus' in c) return c.focus(); }
    if (self.clients.openWindow) return self.clients.openWindow('./index.html');
  }));
});
