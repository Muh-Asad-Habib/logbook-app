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
  // Kolom `token` kini menyimpan SHA-256 dari token asli (lihat storage.js).
  // Baris lama (token mentah) tetap sah dan di-upgrade otomatis saat dipakai.
  `CREATE TABLE IF NOT EXISTS sessions (
     token      TEXT PRIMARY KEY,
     user_id    TEXT NOT NULL,
     created_at TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id)`,
  // Kedaluwarsa dihitung dari PEMAKAIAN TERAKHIR, bukan tanggal dibuat:
  // akun yang aktif tidak pernah terlempar keluar, sedangkan sesi yang
  // menganggur 30 hari otomatis dicabut.
  `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_used_at TEXT NOT NULL DEFAULT ''`,
  // Label perangkat & IP tersamar untuk halaman "Perangkat & Sesi Aktif".
  // Sengaja RINGKAS, bukan User-Agent/IP mentah — lihat perangkat.js.
  // Baris lama bernilai '' dan ditampilkan sebagai "Perangkat tidak dikenal".
  `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS perangkat TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ip_samar  TEXT NOT NULL DEFAULT ''`,
  // IP PENUH — hanya pernah ditampilkan di pusat kendali (admin) untuk
  // menyelidiki login asing; pemilik akun tetap melihat ip_samar. Ikut
  // terhapus bersama sesinya, jadi tidak ada jejak IP yang berumur panjang.
  `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ip_penuh  TEXT NOT NULL DEFAULT ''`,
  // Pembersihan sesi menganggur menyaring pada kolom ini.
  `CREATE INDEX IF NOT EXISTS sessions_last_used_idx ON sessions (last_used_at)`,
  // Penghitung brute-force login APLIKASI (bukan panel) — di database supaya
  // lockout tetap berlaku walau Vercel menjalankan banyak instance serverless.
  `CREATE TABLE IF NOT EXISTS login_fails (
     kunci        TEXT PRIMARY KEY,
     n            INTEGER NOT NULL DEFAULT 0,
     locked_until BIGINT NOT NULL DEFAULT 0
   )`,
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
  // Bukti belanja kini boleh LEBIH DARI SATU — array JSONB seperti foto_keys
  // kegiatan. Kolom bukti_key lama dipertahankan (selalu = elemen pertama)
  // demi kompatibilitas skrip/ekspor lama; baris lama di-backfill otomatis.
  `ALTER TABLE keuangan ADD COLUMN IF NOT EXISTS bukti_keys JSONB NOT NULL DEFAULT '[]'`,
  `UPDATE keuangan SET bukti_keys = jsonb_build_array(bukti_key)
    WHERE bukti_key <> '' AND bukti_keys = '[]'::jsonb`,
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
  // Penghitung brute-force login panel — DI DATABASE (bukan memori proses)
  // supaya lockout tetap berlaku sekalipun Vercel menjalankan banyak instance
  // serverless bersamaan (memori proses tidak dibagi antar-instance).
  `CREATE TABLE IF NOT EXISTS admin_login_fails (
     ip_key       TEXT PRIMARY KEY,
     n            INTEGER NOT NULL DEFAULT 0,
     locked_until BIGINT NOT NULL DEFAULT 0
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
  // Tautan publik sementara dipakai bersama oleh laporan (.docx) & presentasi
  // (.pptx) — kolom `jenis` memisahkan keduanya (baris lama = 'laporan').
  `ALTER TABLE laporan_links ADD COLUMN IF NOT EXISTS jenis TEXT NOT NULL DEFAULT 'laporan'`,
  // ---- Presentasi tim: SATU berkas .pptx + SATU tautan Canva per akun ----
  // Keduanya boleh ada bersamaan dan bisa dihapus sendiri-sendiri.
  // Berkas fisik .pptx disimpan di ImageKit (kolom file_key).
  `CREATE TABLE IF NOT EXISTS presentasi (
     user_id    TEXT PRIMARY KEY,
     nama       TEXT NOT NULL DEFAULT '',
     ukuran     INTEGER NOT NULL DEFAULT 0,
     file_key   TEXT NOT NULL DEFAULT '',
     canva_url  TEXT NOT NULL DEFAULT '',
     file_at    TEXT NOT NULL DEFAULT '',
     canva_at   TEXT NOT NULL DEFAULT '',
     updated_at TEXT NOT NULL
   )`,
  // ---- Fitur Fasilitator (aditif — data lama tidak tersentuh) ----
  // Peran akun: 'tim' (default, perilaku lama), 'fasilitator', atau 'dosen'
  // (Dosen Pendamping = fasilitator + wewenang ACC/pengesahan).
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'tim'`,
  // Assignment many-to-many: 1 tim ↔ banyak pendamping (fasilitator/dosen),
  // 1 pendamping ↔ banyak tim. Nama tabel dipertahankan agar data lama utuh.
  `CREATE TABLE IF NOT EXISTS fasilitator_tim (
     fasilitator_id TEXT NOT NULL,
     tim_user_id    TEXT NOT NULL,
     created_at     TEXT NOT NULL,
     PRIMARY KEY (fasilitator_id, tim_user_id)
   )`,
  `CREATE INDEX IF NOT EXISTS fastim_fas_idx ON fasilitator_tim (fasilitator_id)`,
  `CREATE INDEX IF NOT EXISTS fastim_tim_idx ON fasilitator_tim (tim_user_id)`,
  // Komentar fasilitator ↔ tim pada entri kegiatan/keuangan/laporan.
  `CREATE TABLE IF NOT EXISTS komentar (
     id          TEXT PRIMARY KEY,
     jenis       TEXT NOT NULL,
     target_id   TEXT NOT NULL,
     tim_user_id TEXT NOT NULL,
     penulis_id  TEXT NOT NULL,
     parent_id   TEXT NOT NULL DEFAULT '',
     isi         TEXT NOT NULL,
     selesai     BOOLEAN NOT NULL DEFAULT FALSE,
     edited_at   TEXT NOT NULL DEFAULT '',
     created_at  TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS komentar_target_idx ON komentar (tim_user_id, jenis, target_id)`,
  // Tanda "sudah dibaca" per pengguna (akurat untuk banyak fasilitator per tim).
  `CREATE TABLE IF NOT EXISTS komentar_baca (
     komentar_id TEXT NOT NULL,
     user_id     TEXT NOT NULL,
     PRIMARY KEY (komentar_id, user_id)
   )`,
  // Laporan .docx kini disimpan di ImageKit — kolom data lama dibiarkan
  // (baris lama tetap terbaca, dimigrasi malas saat pertama diakses).
  `ALTER TABLE laporan_docx ADD COLUMN IF NOT EXISTS file_key TEXT NOT NULL DEFAULT ''`,
  // ---- Fitur ACC / pengesahan oleh DOSEN PENDAMPING ----
  // Satu status per entri (PK jenis+target_id): baris ADA = sudah ditinjau
  // ('disetujui' atau 'revisi'); baris TIDAK ADA = masih 'menunggu'.
  // target_id: id entri kegiatan/keuangan; untuk laporan = tim_user_id.
  `CREATE TABLE IF NOT EXISTS persetujuan (
     jenis       TEXT NOT NULL,
     target_id   TEXT NOT NULL,
     tim_user_id TEXT NOT NULL,
     dosen_id    TEXT NOT NULL,
     status      TEXT NOT NULL,
     catatan     TEXT NOT NULL DEFAULT '',
     created_at  TEXT NOT NULL,
     updated_at  TEXT NOT NULL,
     PRIMARY KEY (jenis, target_id)
   )`,
  `CREATE INDEX IF NOT EXISTS persetujuan_tim_idx ON persetujuan (tim_user_id, jenis)`,
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

