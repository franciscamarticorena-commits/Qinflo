const QINFLO_CACHE = 'qinflo-cache-v82';
const STATIC_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './supabase.js',
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
  './outings.js',
  './confirmations.js',
  './activity.js',
  './docutiles.js',
  './services.js',
  './today.js',
  './theme.js',
  './app-shell.js',
  './manifest.json',
  './favicon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-512-maskable.png',
  './assets/docs/modelo-autorizacion-viaje-menor.pdf',
  './assets/docs/modelo-autorizacion-viaje-menor-preview.jpg'
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
  // Never intercept Supabase auth calls or external API calls
  if (url.includes('/__/auth/') ||
      url.includes('supabase.co') ||
      url.includes('googleapis.com')) return;
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).catch(() => caches.match('./index.html')))
  );
});
