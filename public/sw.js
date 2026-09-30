/* NOVA · Service Worker
 * - Precachea TODA la aplicación (los archivos con hash de sw-manifest.json) para abrirla sin conexión.
 * - Navegación: red primero con respaldo en la app cacheada. Recursos con hash: caché primero (son inmutables).
 * - Background Sync (Chrome/Android): al volver la red avisa a la app para que envíe su cola (Outbox).
 *   Safari/iOS no lo soporta: allí el envío lo dispara el evento "online" y la visibilidad de la pestaña.
 * Los datos (pedidos, catálogo) NO pasan por aquí: viven en IndexedDB y se sincronizan con Supabase.
 */
const VERSION = 'nova-v3-2';
const ACTUAL = `${VERSION}-app`;
const RAIZ = new URL('./', self.location).href;

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    (async () => {
      const cache = await caches.open(ACTUAL);
      let archivos = [];
      try {
        const r = await fetch(new URL('sw-manifest.json', RAIZ), { cache: 'no-store' });
        archivos = (await r.json()).map((f) => new URL(f, RAIZ).href);
      } catch {
        /* sin manifiesto (modo desarrollo): se cachea al vuelo */
      }
      await cache.addAll([RAIZ, new URL('manifest.webmanifest', RAIZ).href, ...archivos]);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    (async () => {
      const claves = await caches.keys();
      await Promise.all(claves.filter((k) => k.startsWith('nova-') && k !== ACTUAL).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (evento) => {
  const req = evento.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Supabase y cualquier API: nunca se cachean aquí.
  if (url.origin !== self.location.origin && !/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) return;

  if (req.mode === 'navigate') {
    evento.respondWith(
      fetch(req).catch(async () => (await caches.match(RAIZ)) || (await caches.match(new URL('index.html', RAIZ).href)) || Response.error())
    );
    return;
  }

  // Fuentes de Google y archivos con hash: caché primero; se actualiza en segundo plano si no había copia.
  evento.respondWith(
    caches.match(req).then(
      (guardado) =>
        guardado ||
        fetch(req).then((res) => {
          if (res.ok || res.type === 'opaque') {
            const copia = res.clone();
            caches.open(ACTUAL).then((c) => c.put(req, copia));
          }
          return res;
        })
    )
  );
});

self.addEventListener('sync', (evento) => {
  if (evento.tag !== 'nova-outbox') return;
  evento.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
      ventanas.forEach((v) => v.postMessage({ tipo: 'nova-sync' }));
    })
  );
});

self.addEventListener('message', (evento) => {
  if (evento.data === 'saltar-espera') self.skipWaiting();
});
