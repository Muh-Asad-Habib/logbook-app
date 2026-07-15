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
import tunnelRouter from "./routes/tunnel.js";
import adminRouter from "./admin/routes.js";
import { loadAdmin, panelPath } from "./admin/store.js";

const app = express();
app.use(
  helmet({
    // Frontend Next inline script/style + gambar blob → CSP longgar tapi tetap aman dasar
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);
app.use(cors()); // API terbuka — bisa dipanggil dari mana saja
app.use(compression()); // gzip — payload JSON/HTML/JS jauh lebih kecil
app.use(express.json());

/**
 * Inisialisasi asinkron SEKALI per proses:
 * - pastikan skema database Neon siap (storage.load)
 * - muat kredensial panel pemeliharaan (dibuat otomatis bila belum ada)
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

// Swagger UI + spec mentah
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, { customSiteTitle: "Logbook API" }));
app.get("/openapi.json", (_req, res) => res.json(swaggerSpec));

// Health check
app.get("/health", (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// REST API
app.use("/api/auth", authRouter);
app.use("/api/kegiatan", kegiatanRouter);
app.use("/api/keuangan", keuanganRouter);
app.use("/api/pengaturan", pengaturanRouter);
app.use("/api/statistik", statistikRouter);
app.use("/api/files", filesRouter);
app.use("/api/export", exportRouter);
app.use("/api/import", importRouter);
app.use("/api/tunnel", tunnelRouter);

// Panel pemeliharaan — path diambil dari database saat request masuk,
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

