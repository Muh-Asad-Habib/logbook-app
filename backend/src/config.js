import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

/**
 * Muat file .env (untuk pengembangan lokal) TANPA dependensi tambahan.
 * Di Vercel bagian ini otomatis tidak melakukan apa-apa karena
 * environment variables sudah disuntikkan oleh platform.
 * Nilai yang sudah ada di process.env TIDAK ditimpa.
 */
function muatEnv(file) {
  try {
    if (!fs.existsSync(file)) return;
    for (const baris of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = baris.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m || baris.trim().startsWith("#")) continue;
      let nilai = m[2];
      if ((nilai.startsWith('"') && nilai.endsWith('"')) || (nilai.startsWith("'") && nilai.endsWith("'"))) {
        nilai = nilai.slice(1, -1);
      }
      if (process.env[m[1]] === undefined) process.env[m[1]] = nilai;
    }
  } catch {}
}
muatEnv(path.join(ROOT, ".env"));            // logbook-app/.env (utama)
muatEnv(path.join(ROOT, "backend", ".env")); // alternatif

export const config = {
  port: parseInt(process.env.PORT || "4000", 10),
  // Folder lokal — hanya dipakai mode lokal & skrip migrasi (di Vercel read-only)
  dataDir: path.resolve(ROOT, "data"),
  uploadsDir: path.resolve(ROOT, "uploads"),
  frontendDir: path.resolve(ROOT, "frontend/out"),
  // Template DOCX resmi — ikut ter-bundle ke serverless function (lihat vercel.json)
  templatePath: path.resolve(__dirname, "assets", "template-logbook.docx"),
  // true bila berjalan di Vercel (filesystem read-only, tanpa tunnel lokal)
  diVercel: !!process.env.VERCEL,
};

/**
 * Origin publik aplikasi (tanpa garis miring akhir) — dipakai untuk menyusun
 * URL absolut yang diberikan ke pihak ketiga (penampil Office Microsoft).
 *
 * Sebelumnya URL disusun dari header `X-Forwarded-Host` mentah — header itu
 * bisa diisi pemanggil (host-header injection) sehingga tautan berkas bisa
 * diarahkan ke domain lain. Kini urutan kepercayaannya:
 *   1. env APP_ORIGIN (ditetapkan pemilik, mis. https://logbook.vercel.app)
 *   2. domain produksi Vercel (VERCEL_PROJECT_PRODUCTION_URL)
 *   3. HANYA di luar Vercel (laptop/tunnel): header proxy, dibersihkan.
 */
export function asalPublik(req) {
  const rapikan = (s) => String(s || "").trim().replace(/\/+$/, "");
  if (process.env.APP_ORIGIN) return rapikan(process.env.APP_ORIGIN);
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${rapikan(process.env.VERCEL_PROJECT_PRODUCTION_URL)}`;
  }
  if (config.diVercel && process.env.VERCEL_URL) return `https://${rapikan(process.env.VERCEL_URL)}`;
  // Mode lokal / tunnel: header proxy dipakai, tapi hanya karakter host yang sah.
  const proto = String(req?.headers?.["x-forwarded-proto"] || req?.protocol || "http")
    .split(",")[0].trim() === "https" ? "https" : "http";
  const host = String(req?.headers?.["x-forwarded-host"] || req?.headers?.host || "")
    .split(",")[0].trim();
  if (!/^[a-z0-9.-]+(:\d{1,5})?$/i.test(host) && !/^\[[0-9a-f:]+](:\d{1,5})?$/i.test(host)) {
    return `http://localhost:${config.port}`;
  }
  return `${proto}://${host}`;
}

