const QINFLO_CACHE = 'qinflo-cache-v1';
const STATIC_ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/firebase.js',
  './js/state.js',
  './js/auth.js',
  './js/connect.js',
  './js/calendar.js',
  './js/expenses.js',
  './js/messages.js',
  './js/children.js',
  './js/agreements.js',
  './js/reminders.js',
  './js/resources.js',
  './js/observability.js',
  './js/app-shell.js',
  './manifest.json',
  './favicon.svg',
  './assets/icons/qinflo-icon.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(QINFLO_CACHE).then(cache => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== QINFLO_CACHE).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).catch(() => caches.match('./index.html')))
  );
});
