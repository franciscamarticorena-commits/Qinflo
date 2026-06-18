const QINFLO_CACHE = 'qinflo-cache-v2';
const STATIC_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './firebase.js',
  './state.js',
  './auth.js',
  './connect.js',
  './calendar.js',
  './expenses.js',
  './messages.js',
  './children.js',
  './agreements.js',
  './reminders.js',
  './resources.js',
  './observability.js',
  './app-shell.js',
  './manifest.json'
  // favicon.svg y assets/icons/qinflo-icon.svg no existen en el repositorio actual — agregar cuando se incorporen
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
