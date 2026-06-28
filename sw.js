/**
 * BLOOM-SISMO — Service Worker
 * Cache-First para funcionamiento 100% offline
 * Terremoto Venezuela · Junio 2026
 */

const CACHE = 'bloom-sismo-v3';
const ASSETS = ['./', './index.html'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Cache-First: sirve desde cache, actualiza en background */
self.addEventListener('fetch', e => {
  /* Solo interceptar GET y same-origin / CDN fonts/scripts */
  if (e.request.method !== 'GET') return;

  /* No interceptar llamadas a Supabase — deben ir siempre a la red */
  const url = new URL(e.request.url);
  if (url.hostname.includes('supabase.co')) return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      const networkFetch = fetch(e.request)
        .then(res => {
          if (res && res.status === 200 && res.type !== 'opaque') {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => null);

      /* Si tenemos cache, devolvemos inmediatamente y actualizamos en background */
      return cached || networkFetch.then(res => res || caches.match('./index.html'));
    })
  );
});

/* Trigger de sincronización desde el cliente */
self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('sync', e => {
  if (e.tag === 'sync-reports') {
    e.waitUntil(
      self.clients.matchAll().then(clients =>
        clients.forEach(c => c.postMessage({ type: 'SYNC_NOW' }))
      )
    );
  }
});
