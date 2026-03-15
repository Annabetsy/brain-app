// sw.js — Service worker for offline app shell caching

const CACHE_NAME = 'brain-v1';
const APP_SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/storage.js',
  './js/github.js',
  './js/claude.js',
  './js/markdown.js',
  './js/app.js',
  './manifest.json',
];

// Install — cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch — app shell from cache, API calls from network
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API calls always go to network
  if (url.hostname === 'api.github.com' || url.hostname === 'api.anthropic.com') {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(cached => cached || fetch(event.request))
  );
});
