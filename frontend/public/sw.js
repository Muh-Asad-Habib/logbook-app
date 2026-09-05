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
const VERSI = "logbook-sw-v2";
const CACHE_SHELL = `${VERSI}-shell`;
const CACHE_STATIS = `${VERSI}-statis`;
const PRECACHE = ["/offline.html", "/icon.svg", "/icon-192.png", "/icon-512.png", "/manifest.webmanifest"];
const HALAMAN = new Set(["/", "/login", "/kegiatan", "/keuangan", "/laporan", "/presentasi", "/galeri", "/ekspor", "/profil"]);

self.addEventListener("install", (ev) => {
  ev.waitUntil(
    caches.open(CACHE_SHELL).then((c) => c.addAll(PRECACHE)).catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (ev) => {
  ev.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith("logbook-sw-") && ![CACHE_SHELL, CACHE_STATIS].includes(k)).map((k) => caches.delete(k)))
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

  // Hanya kerangka frontend yang boleh offline, bukan panel admin (path dapat
  // diganti), health, docs, atau endpoint lain di origin yang sama.
  const halaman = url.pathname.replace(/\.html$/, "").replace(/\/$/, "") || "/";
  if (HALAMAN.has(halaman) && (req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html"))) {
    ev.respondWith(
      fetch(req).then((res) => {
        const html = (res.headers.get("content-type") || "").includes("text/html");
        const privat = /no-store|private/i.test(res.headers.get("cache-control") || "");
        if (res.ok && html && !privat && !res.redirected) caches.open(CACHE_SHELL).then((c) => c.put(req, res.clone())).catch(() => {});
        return res;
      }).catch(async () => (await caches.match(req)) || (await caches.match("/offline.html")) || new Response("Tidak ada koneksi. Coba lagi setelah tersambung.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }))
    );
  }
});

