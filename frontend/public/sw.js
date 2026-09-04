/* Service worker Logbook — PWA minimal.
 *
 * Tujuan: aplikasi tetap bisa DIBUKA saat offline (kerangka halaman + aset
 * statis), bukan menyimpan data. Strategi:
 *  - /_next/static/*  : cache-first (nama berkas ber-hash → aman selamanya)
 *  - ikon/manifest    : cache-first
 *  - navigasi HTML    : network-first; bila gagal → salinan terakhir di cache,
 *                       bila tidak ada → /offline.html
 *  - /api/*, berkas   : TIDAK PERNAH di-cache (data privat & selalu segar)
 *  - CDN ImageKit     : dilewatkan apa adanya
 */
const VERSI = "logbook-sw-v1";
const CACHE_SHELL = `${VERSI}-shell`;
const CACHE_STATIS = `${VERSI}-statis`;
const PRECACHE = ["/offline.html", "/icon.svg", "/icon-192.png", "/icon-512.png", "/manifest.webmanifest"];

self.addEventListener("install", (ev) => {
  ev.waitUntil(
    caches.open(CACHE_SHELL).then((c) => c.addAll(PRECACHE)).catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (ev) => {
  ev.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !k.startsWith(VERSI)).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

const asalSama = (url) => url.origin === self.location.origin;

self.addEventListener("fetch", (ev) => {
  const req = ev.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (!asalSama(url)) return;                       // CDN / pihak ketiga: biarkan
  if (url.pathname.startsWith("/api/")) return;     // data privat: jangan di-cache
  if (url.pathname === "/sw.js") return;

  // Aset statis ber-hash & ikon → cache-first
  if (url.pathname.startsWith("/_next/static/") || PRECACHE.includes(url.pathname)) {
    ev.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) caches.open(CACHE_STATIS).then((c) => c.put(req, res.clone())).catch(() => {});
        return res;
      }))
    );
    return;
  }

  // Navigasi halaman → network-first, fallback cache, lalu offline.html
  if (req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html")) {
    ev.respondWith(
      fetch(req).then((res) => {
        if (res.ok) caches.open(CACHE_SHELL).then((c) => c.put(req, res.clone())).catch(() => {});
        return res;
      }).catch(async () => (await caches.match(req)) || (await caches.match("/offline.html")))
    );
  }
});

