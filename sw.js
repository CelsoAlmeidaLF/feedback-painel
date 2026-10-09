// Painel de feedback: instalável e com a tela abrindo offline. Os dados (Firestore) e o Firebase vêm sempre da rede.
const CACHE_NAME = 'feedback-painel-v1.5.1';
const APP_SHELL = [
  './index.html',
  './painel.css',
  './painel-core.js',
  './app.js',
  './stk-pkg-secure-vault.js',
  './stk-pkg-secure-ui.js',
  './stk-pkg-secure-ui.css',
  './stk-pkg-financ-icons.js',
  './fonts/fonts.css',
  './fonts/open-sans.woff2',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  './favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(APP_SHELL.map((url) => cache.add(url).catch((err) => console.warn('SW: falhou ao cachear', url, err))))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Outros domínios (Firebase, Google) e envios (POST) vão direto para a rede, sem cache.
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  // Rede primeiro: atualização vale na hora; o cache só entra sem internet.
  event.respondWith(
    fetch(event.request).then((response) => {
      if (response && response.status === 200) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
      }
      return response;
    }).catch(() => caches.match(event.request, { ignoreSearch: true }))
  );
});
