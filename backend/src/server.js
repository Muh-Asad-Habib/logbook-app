import express from "express";
import cors from "cors";
import compression from "compression";
import helmet from "helmet";
import fs from "node:fs";
import path from "node:path";
import swaggerUi from "swagger-ui-express";

import { config } from "./config.js";
import { load } from "./storage.js";
import { swaggerSpec } from "./swagger.js";
import authRouter from "./routes/auth.js";
import kegiatanRouter from "./routes/kegiatan.js";
import keuanganRouter from "./routes/keuangan.js";
import pengaturanRouter, { statistikRouter } from "./routes/pengaturan.js";
import filesRouter from "./routes/files.js";
import exportRouter from "./routes/export.js";
import importRouter from "./routes/import.js";
import laporanRouter from "./routes/laporan.js";
import presentasiRouter from "./routes/presentasi.js";
import fasilitatorRouter from "./routes/fasilitator.js";
import komentarRouter from "./routes/komentar.js";
import persetujuanRouter from "./routes/persetujuan.js";
import timRouter from "./routes/tim.js";
import tunnelRouter from "./routes/tunnel.js";
import adminRouter from "./admin/routes.js";
import { loadAdmin, panelPath } from "./admin/store.js";

const app = express();

/**
 * Content-Security-Policy.
 *
 * Sebelumnya CSP dimatikan total (contentSecurityPolicy: false). Padahal token
 * sesi tersimpan di localStorage, sehingga SATU celah XSS cukup untuk mencuri
 * seluruh akun. CSP di bawah menutup vektor paling berbahaya (skrip dari
 * domain asing) sambil tetap mengizinkan yang memang dibutuhkan aplikasi:
 *  - 'unsafe-inline' script : skrip tema anti-kedip di <head> Next.js
 *  - img-src blob:/data:    : pratinjau foto sebelum diunggah + lightbox
 *  - img-src https:         : foto disajikan dari CDN ImageKit
 *  - frame-src canva.com    : sematan pratinjau presentasi Canva
 *  - frame-ancestors 'none' : aplikasi tidak boleh dibingkai situs lain
 *                             (anti clickjacking)
 */
const CSP = {
  useDefaults: false,
  directives: {
    defaultSrc: ["'self'"],
    baseUri: ["'self'"],
    objectSrc: ["'none'"],
    frameAncestors: ["'none'"],
    formAction: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'"],
    styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
    imgSrc: ["'self'", "data:", "blob:", "https:"],
    connectSrc: ["'self'"],
    mediaSrc: ["'self'", "blob:"],
    workerSrc: ["'self'", "blob:"],
    frameSrc: ["'self'", "https://www.canva.com", "https://view.officeapps.live.com"],
    upgradeInsecureRequests: process.env.VERCEL ? [] : null,
  },
};
// Hapus direktif bernilai null (upgrade-insecure-requests hanya di produksi)
for (const [k, v] of Object.entries(CSP.directives)) {
  if (v === null) delete CSP.directives[k];
}

app.use(
  helmet({
    contentSecurityPolicy: CSP,
    // Nonaktif: foto dimuat lintas-origin dari CDN ImageKit
    crossOriginEmbedderPolicy: false,
    // Rujukan tidak pernah dibocorkan ke pihak ketiga (termasuk CDN)
    referrerPolicy: { policy: "same-origin" },
    hsts: process.env.VERCEL ? { maxAge: 31536000, includeSubDomains: true } : false,
  })
);

// Matikan fitur browser yang sama sekali tidak dipakai aplikasi ini
app.use((_req, res, next) => {
  res.setHeader(
    "Permissions-Policy",
    "geolocation=(), microphone=(), camera=(), payment=(), usb=(), interest-cohort=()"
  );
  next();
});

/**
 * CORS dibatasi ke origin milik aplikasi sendiri.
 *
 * Dulu `cors()` tanpa argumen mengizinkan SEMUA situs memanggil API ini.
 * Sekarang hanya origin aplikasi (domain Vercel + localhost saat dev) yang
 * diizinkan, dan `credentials: true` diperlukan agar cookie sesi ikut terkirim.
 * Permintaan tanpa header Origin (mis. <img>, unduhan, curl, health check)
 * tetap dilayani seperti biasa.
 */
const ORIGIN_SAH = new Set(
  [
    process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`,
    process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`,
    process.env.APP_ORIGIN,
  ].filter(Boolean)
);
app.use(
  cors({
    credentials: true,
    origin(origin, cb) {
      if (!origin) return cb(null, true); // bukan permintaan lintas-origin
      if (ORIGIN_SAH.has(origin)) return cb(null, true);
      // Pengembangan lokal: localhost / IP LAN / tunnel cloudflared
      if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1]|192\.168\.|10\.)/.test(origin)) {
        return cb(null, true);
      }
      if (/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(origin)) return cb(null, true);
      return cb(null, false); // ditolak diam-diam (tanpa header CORS)
    },
  })
);
app.use(compression()); // gzip — payload JSON/HTML/JS jauh lebih kecil
// limit 4mb: potongan impor .docx (base64 ±2,7 MB per request) tetap di bawah
// batas keras Vercel ±4,5 MB per request
app.use(express.json({ limit: "4mb" }));


/**
 * Inisialisasi asinkron SEKALI per proses:
 * - pastikan skema database Neon siap (storage.load)
 * - muat kredensial panel admin (dibuat otomatis bila belum ada)
 * Middleware di bawah menunggu inisialisasi selesai sebelum melayani request —
 * pola yang aman untuk serverless (cold start) maupun server lokal.
 */
let _siap = null;
function pastikanSiap() {
  if (!_siap) {
    _siap = Promise.all([load(), loadAdmin()]).catch((err) => {
      _siap = null; // coba lagi di request berikutnya
      throw err;
    });
  }
  return _siap;
}
app.use(async (_req, _res, next) => {
  try {
    await pastikanSiap();
    next();
  } catch (err) {
    next(err);
  }
});

// Swagger UI + spec mentah — HANYA saat dijalankan lokal.
// Di produksi spec ditutup (404) agar daftar lengkap endpoint tidak bisa
// dienumerasi pengunjung; dokumentasi tetap tersedia bagi pengembang yang
// menjalankan aplikasi di komputernya sendiri.
if (!config.diVercel) {
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, { customSiteTitle: "Logbook API" }));
  app.get("/openapi.json", (_req, res) => res.json(swaggerSpec));
}

// Health check + penanda build.
// Sengaja MINIM informasi internal: cukup `commit` (7 karakter hash git) untuk
// memastikan versi mana yang sedang online, dan `boot` untuk mengetahui kapan
// instance serverless ini pertama kali dijalankan. URL deploy unik Vercel
// (mengandung nama project & tim) tidak lagi dibagikan ke publik.
const BOOT_TS = new Date().toISOString();
app.get("/health", (_req, res) => {
  // Jangan pernah di-cache CDN: kalau tidak, hasil pengecekan bisa
  // menampilkan commit LAMA dan mengesankan deploy gagal.
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.json({
    ok: true,
    ts: new Date().toISOString(),
    boot: BOOT_TS,
    commit: (process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 7),
    region: process.env.VERCEL_REGION || "",
  });
});

// REST API
app.use("/api/auth", authRouter);
app.use("/api/kegiatan", kegiatanRouter);
app.use("/api/keuangan", keuanganRouter);
app.use("/api/pengaturan", pengaturanRouter);
app.use("/api/statistik", statistikRouter);
app.use("/api/files", filesRouter);
app.use("/api/export", exportRouter);
app.use("/api/import", importRouter);
app.use("/api/laporan", laporanRouter);
app.use("/api/presentasi", presentasiRouter);
app.use("/api/fasilitator", fasilitatorRouter);
app.use("/api/komentar", komentarRouter);
app.use("/api/persetujuan", persetujuanRouter);
app.use("/api/tim", timRouter);
app.use("/api/tunnel", tunnelRouter);

// panel admin — path diambil dari database saat request masuk,
// jadi bisa diganti tanpa restart. Tidak ada referensi apa pun di frontend.
app.use((req, res, next) => {
  const base = panelPath();
  if (req.path === base || req.path.startsWith(base + "/")) {
    // Potong prefix panel TANPA merusak query string.
    // (Rewrite Vercel menambahkan "?path=..." — "/pusat-kendali?path=x"
    //  harus menjadi "/?path=x", bukan "?path=x")
    const sisa = req.url.slice(base.length);
    req.url = sisa.startsWith("?") ? "/" + sisa : (sisa || "/");
    return adminRouter(req, res, next);
  }
  next();
});

// Frontend statis (hasil `next build` di frontend/out) — satu port untuk semuanya
if (fs.existsSync(config.frontendDir)) {
  app.use(express.static(config.frontendDir, {
    extensions: ["html"],
    redirect: false,
    setHeaders: (res, filePath) => {
      // Chunk _next/static punya hash di nama file — aman di-cache selamanya
      if (filePath.includes(`${path.sep}_next${path.sep}static${path.sep}`)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      } else if (filePath.endsWith(".html") || filePath.endsWith(".txt")) {
        // HTML & payload navigasi: selalu validasi ulang (ETag → 304, tetap cepat)
        res.setHeader("Cache-Control", "no-cache");
      } else {
        res.setHeader("Cache-Control", "public, max-age=3600");
      }
    },
  }));
  app.use((req, res, next) => {
    // Router Next memakai GET *dan* HEAD (HEAD dipakai saat prefetch halaman).
    // Bila HEAD dibalas 404, prefetch gagal dan navigasi terasa lambat.
    if ((req.method !== "GET" && req.method !== "HEAD") || req.path.startsWith("/api")) return next();
    // /kegiatan → kegiatan.html (Next export membuat folder & file .html sekaligus)
    const bersih = path.normalize(req.path).replace(/^([\\/.])+/, "").replace(/[\\/]+$/, "");
    const htmlFile = path.resolve(config.frontendDir, bersih + ".html");
    if (htmlFile.startsWith(path.resolve(config.frontendDir)) && fs.existsSync(htmlFile)) {
      res.setHeader("Cache-Control", "no-cache");
      return res.sendFile(htmlFile);
    }
    const notFound = path.join(config.frontendDir, "404.html");
    if (fs.existsSync(notFound)) return res.status(404).sendFile(notFound);
    next();
  });
} else {
  app.get("/", (_req, res) =>
    res.send("Frontend belum di-build. Jalankan: cd frontend && npm run build — lalu restart server.")
  );
}

// Error handler terpusat
app.use((err, _req, res, _next) => {
  console.error("[error]", err);
  res.status(err.status || 500).json({ error: err.message || "internal server error" });
});

// Di Vercel: aplikasi diekspor sebagai serverless function (lihat api/index.js) —
// TIDAK memanggil listen(). Di laptop: jalankan server seperti biasa.
if (!config.diVercel) {
  app.listen(config.port, () => {
    console.log(`[server] Berjalan di http://localhost:${config.port}`);
    console.log(`[server] Dokumentasi API: http://localhost:${config.port}/docs`);
    console.log(`[server] Data: Neon Postgres (DATABASE_URL)`);
    console.log(`[server] Gambar: ${process.env.IMAGEKIT_PRIVATE_KEY ? "ImageKit (cloud)" : `folder lokal ${config.uploadsDir}`}`);
  });
}

export default app;

