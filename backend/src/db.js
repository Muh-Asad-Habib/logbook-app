/**
 * Koneksi database Neon Postgres (gratis, serverless).
 *
 * - Semua data aplikasi (akun, kegiatan, keuangan, pengaturan, log) disimpan
 *   di sini — menggantikan file lokal data/db.json.
 * - Driver: @neondatabase/serverless — bicara ke Postgres lewat HTTPS,
 *   ideal untuk fungsi serverless (Vercel) sekaligus tetap jalan di laptop.
 * - Skema tabel dibuat otomatis saat query pertama (CREATE TABLE IF NOT EXISTS).
 *
 * Konfigurasi lewat environment variable DATABASE_URL
 * (lokal: file .env di root proyek — lihat .env.example & DEPLOY.md).
 */
import { neon } from "@neondatabase/serverless";
import "./config.js"; // memuat .env lokal sebelum DATABASE_URL dibaca

let _sql = null;      // klien neon (dibuat sekali per proses)
let _schemaSiap = null; // promise pembuatan skema (sekali per proses)

function klien() {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL belum diisi. Buat file .env di root proyek (contoh di .env.example) " +
      "atau isi Environment Variables di Vercel. Panduan lengkap: DEPLOY.md"
    );
  }
  _sql = neon(url);
  return _sql;
}

/** Daftar perintah pembuatan skema — aman dijalankan berulang. */
const SKEMA = [
  `CREATE TABLE IF NOT EXISTS users (
     id             TEXT PRIMARY KEY,
     username       TEXT NOT NULL,
     username_lower TEXT NOT NULL UNIQUE,
     pass_hash      TEXT NOT NULL,
     created_at     TEXT NOT NULL,
     updated_at     TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS sessions (
     token      TEXT PRIMARY KEY,
     user_id    TEXT NOT NULL,
     created_at TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id)`,
  `CREATE TABLE IF NOT EXISTS kegiatan (
     id            TEXT PRIMARY KEY,
     user_id       TEXT NOT NULL,
     tanggal       TEXT NOT NULL,
     kegiatan      TEXT NOT NULL,
     capaian_delta INTEGER NOT NULL DEFAULT 0,
     waktu_menit   INTEGER NOT NULL DEFAULT 0,
     foto_keys     JSONB   NOT NULL DEFAULT '[]',
     created_at    TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS kegiatan_user_idx ON kegiatan (user_id, tanggal)`,
  `CREATE TABLE IF NOT EXISTS keuangan (
     id            TEXT PRIMARY KEY,
     user_id       TEXT NOT NULL,
     tanggal       TEXT NOT NULL,
     item          TEXT NOT NULL,
     harga_satuan  DOUBLE PRECISION NOT NULL DEFAULT 0,
     satuan_suffix TEXT NOT NULL DEFAULT '',
     jumlah        DOUBLE PRECISION NOT NULL DEFAULT 1,
     total         DOUBLE PRECISION NOT NULL DEFAULT 0,
     bukti_key     TEXT NOT NULL DEFAULT '',
     created_at    TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS keuangan_user_idx ON keuangan (user_id, tanggal)`,
  `CREATE TABLE IF NOT EXISTS pengaturan (
     user_id TEXT NOT NULL,
     kunci   TEXT NOT NULL,
     nilai   TEXT NOT NULL DEFAULT '',
     PRIMARY KEY (user_id, kunci)
   )`,
  `CREATE TABLE IF NOT EXISTS meta (
     kunci TEXT PRIMARY KEY,
     nilai TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS files (
     key     TEXT PRIMARY KEY,
     file_id TEXT NOT NULL,
     url     TEXT NOT NULL DEFAULT ''
   )`,
  `CREATE TABLE IF NOT EXISTS aktivitas (
     id      BIGSERIAL PRIMARY KEY,
     ts      TEXT NOT NULL,
     user_id TEXT NOT NULL,
     aksi    TEXT NOT NULL,
     detail  JSONB NOT NULL DEFAULT '{}'
   )`,
  `CREATE INDEX IF NOT EXISTS aktivitas_user_idx ON aktivitas (user_id, id DESC)`,
  `CREATE TABLE IF NOT EXISTS audit (
     id     BIGSERIAL PRIMARY KEY,
     ts     TEXT NOT NULL,
     aksi   TEXT NOT NULL,
     ip     TEXT NOT NULL DEFAULT '',
     detail JSONB NOT NULL DEFAULT '{}'
   )`,
  `CREATE TABLE IF NOT EXISTS admin_sessions (
     token   TEXT PRIMARY KEY,
     exp     BIGINT NOT NULL,
     ua_hash TEXT NOT NULL DEFAULT ''
   )`,
  `CREATE TABLE IF NOT EXISTS import_chunks (
     id         TEXT NOT NULL,
     idx        INTEGER NOT NULL,
     user_id    TEXT NOT NULL,
     data       TEXT NOT NULL,
     created_at TEXT NOT NULL,
     PRIMARY KEY (id, idx)
   )`,
  `CREATE TABLE IF NOT EXISTS laporan_docx (
     user_id    TEXT PRIMARY KEY,
     nama       TEXT NOT NULL DEFAULT 'laporan-kemajuan.docx',
     data       TEXT NOT NULL,
     ukuran     INTEGER NOT NULL DEFAULT 0,
     updated_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS laporan_links (
     kunci   TEXT PRIMARY KEY,
     user_id TEXT NOT NULL,
     exp     BIGINT NOT NULL
   )`,
];

/** Pastikan seluruh tabel ada (sekali per proses; satu round-trip HTTP). */
export function pastikanSkema() {
  if (!_schemaSiap) {
    const sql = klien();
    _schemaSiap = sql
      .transaction(SKEMA.map((s) => sql.query(s, [])))
      .catch((err) => {
        _schemaSiap = null; // biar dicoba lagi pada permintaan berikutnya
        throw err;
      });
  }
  return _schemaSiap;
}

/**
 * Jalankan satu query berparameter ($1, $2, …). Mengembalikan array baris.
 * Contoh: await q("SELECT * FROM users WHERE id = $1", [id])
 */
export async function q(text, params = []) {
  await pastikanSkema();
  return klien().query(text, params);
}

/** Angka dari hasil COUNT()/SUM() Postgres (bisa datang sebagai string). */
export const angka = (v) => Number(v ?? 0) || 0;

/** Objek dari kolom JSONB (bisa datang sebagai string tergantung driver). */
export const objek = (v) => {
  if (v == null) return {};
  if (typeof v === "string") {
    try { return JSON.parse(v); } catch { return {}; }
  }
  return v;
};

/** Array dari kolom JSONB. */
export const larik = (v) => {
  const o = typeof v === "string" ? (() => { try { return JSON.parse(v); } catch { return []; } })() : v;
  return Array.isArray(o) ? o : [];
};

