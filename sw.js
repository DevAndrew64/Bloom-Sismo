/**
 * BLOOM-SISMO — Service Worker v4
 * Optimizado para miles de usuarios concurrentes.
 *
 * Estrategia:
 *  - index.html  → Cache-first + revalidación en background (Stale-While-Revalidate)
 *  - Fonts/CDN   → Cache-first permanente (immutable)
 *  - Supabase    → NUNCA interceptado (peticiones de datos van siempre a la red)
 *  - Background Sync → un solo intento al recuperar red (sin polling)
 */
'use strict';

const V       = 'bs-v4';
const STATIC  = ['./', './index.html'];
const IMMUTABLE = /fonts\.googleapis|fonts\.gstatic|cdnjs\.cloudflare/;
const BYPASS    = /supabase\.co/;   // nunca cachear llamadas REST

/* ── INSTALL: pre-cachear solo lo esencial ── */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(V)
      .then(c => c.addAll(STATIC))
      .then(() => self.skipWaiting())
  );
});

/* ── ACTIVATE: borrar versiones viejas y tomar control inmediato ── */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* ── FETCH: estrategia diferenciada por tipo de recurso ── */
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const url = e.request.url;

  /* 1. Supabase y otras APIs → siempre red, nunca cache */
  if (BYPASS.test(url)) return;

  /* 2. Fonts y CDN → cache permanente (son immutables por versión) */
  if (IMMUTABLE.test(url)) {
    e.respondWith(
      caches.match(e.request).then(hit => hit || fetch(e.request).then(r => {
        if (r.ok) caches.open(V).then(c => c.put(e.request, r.clone()));
        return r;
      }))
    );
    return;
  }

  /* 3. App shell (index.html, sw.js) → Stale-While-Revalidate
        Sirve desde cache inmediatamente y actualiza en background.
        El usuario nunca espera, y la próxima carga tendrá la versión fresca. */
  e.respondWith(
    caches.open(V).then(cache =>
      cache.match(e.request).then(cached => {
        const fresh = fetch(e.request).then(r => {
          if (r.ok && r.type === 'basic') cache.put(e.request, r.clone());
          return r;
        }).catch(() => null);

        return cached || fresh.then(r => r || cache.match('./index.html'));
      })
    )
  );
});

/* ── BACKGROUND SYNC: se dispara UNA VEZ al recuperar red ── */
self.addEventListener('sync', e => {
  if (e.tag !== 'sync-reports') return;
  /* Notificar a todos los clientes abiertos para que vacíen su cola.
     El cliente hace el trabajo — el SW solo avisa. Sin lógica de red aquí. */
  e.waitUntil(
    self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
      .then(cs => cs.forEach(c => c.postMessage({ type: 'SYNC_NOW' })))
  );
});

/* ── MENSAJE desde el cliente (forzar actualización) ── */
self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
