/* Painel de feedback · service worker (mesmo modelo do Finanças da Casa). Troque CACHE_NAME a cada versão (igual ao data-vault-version). */
const CACHE_NAME = 'feedback-painel-v1.6.1';
const APP_SHELL = [
  './', './index.html', './painel.css', './painel-core.js', './app.js', './manifest.json',
  './stk-pkg-secure-vault.js', './stk-pkg-secure-ui.js', './stk-pkg-secure-ui.css', './stk-pkg-financ-icons.js',
  './fonts/fonts.css', './fonts/open-sans.woff2',
  './icon-192.png?v=2', './icon-512.png?v=2', './icon-maskable-192.png?v=2', './icon-maskable-512.png?v=2',
  './apple-touch-icon.png?v=2', './favicon.ico?v=2', './favicon-16.png?v=2', './favicon-32.png?v=2', './favicon-48.png?v=2'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => Promise.allSettled(APP_SHELL.map(url => cache.add(url)))));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // Firebase (gstatic, googleapis) e envios vão direto para a rede: nada de dado é guardado aqui.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Rede primeiro: atualização vale na hora; o cache só entra offline (e sempre abre a tela do painel).
  event.respondWith(fetch(event.request).then(resp => {
    if (resp && resp.status === 200 && resp.type === 'basic') { const copia = resp.clone(); caches.open(CACHE_NAME).then(c => c.put(event.request, copia)); }
    return resp;
  }).catch(() => caches.match(event.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html'))));
});
