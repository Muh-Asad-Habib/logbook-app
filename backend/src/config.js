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

