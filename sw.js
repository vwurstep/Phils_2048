/* Service worker: caches the app shell so the game works offline and launches instantly.
   Bump CACHE whenever files change; old caches are deleted on activate. */
var CACHE = 'phils2048-v1';
var FILES = ['./', './index.html', './src/style.css', './src/engine.js', './src/presets.js',
             './src/ui.js', './src/panel.js', './manifest.webmanifest',
             './icons/icon-192.png', './icons/icon-512.png', './icons/icon-180.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
// Network first (so updates arrive when online), cache as fallback (offline).
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(function (res) {
    var copy = res.clone();
    caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
    return res;
  }).catch(function () { return caches.match(e.request); }));
});
