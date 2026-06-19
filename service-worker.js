const QINFLO_CACHE = 'qinflo-cache-v18';
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
  './onboarding.js',
  './events.js',
  './documents.js',
  './today.js',
  './theme.js',
  './app-shell.js',
  './manifest.json',
  './favicon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-512-maskable.png'
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
  const url = event.request.url;
  // Never intercept Firebase auth redirect handler or Firebase API calls —
  // doing so breaks signInWithRedirect by returning index.html instead of
  // the auth response, causing an infinite redirect loop.
  if (url.includes('/__/auth/') ||
      url.includes('firestore.googleapis.com') ||
      url.includes('identitytoolkit.googleapis.com') ||
      url.includes('securetoken.googleapis.com')) return;
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).catch(() => caches.match('./index.html')))
  );
});
