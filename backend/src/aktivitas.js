/**
 * Jejak aktivitas per pengguna aplikasi (bukan panel).
 *
 * Setiap aksi penting pengguna (login, logout, tambah/ubah/hapus kegiatan &
 * belanja, ganti profil) dicatat satu baris ke tabel `aktivitas` (Postgres).
 * Dibaca oleh halaman profil & panel pemeliharaan. Password TIDAK pernah dicatat.
 */
import { q, objek } from "./db.js";
import { siarkan } from "./bus.js";

const MAX_ROWS = 5000; // pangkas otomatis supaya tabel tidak membengkak

/**
 * Catat aksi pengguna. detail bebas (tanpa data sensitif).
 * Sengaja TIDAK di-await pemanggilnya (fire-and-forget) supaya respons API
 * tidak menunggu pencatatan log.
 */
export function catatAktivitas(userId, aksi, detail = {}) {
  q(
    "INSERT INTO aktivitas (ts, user_id, aksi, detail) VALUES ($1, $2, $3, $4)",
    [new Date().toISOString(), String(userId || ""), aksi, JSON.stringify(detail)]
  )
    .then(() => pangkas())
    .catch(() => {});
  siarkan("aktivitas"); // beri tahu panel — di luar promise agar tetap siar
}

/** Baca aktivitas terakhir milik satu pengguna (terbaru dulu). */
export async function bacaAktivitas(userId, n = 100) {
  try {
    const rows = await q(
      "SELECT ts, user_id, aksi, detail FROM aktivitas WHERE user_id = $1 ORDER BY id DESC LIMIT $2",
      [String(userId || ""), n]
    );
    return rows.map((r) => ({ ts: r.ts, userId: r.user_id, aksi: r.aksi, ...objek(r.detail) }));
  } catch {
    return [];
  }
}

/* Pangkas tabel bila melebihi batas (jarang-jarang saja, ±2% peluang per tulis). */
function pangkas() {
  if (Math.random() > 0.02) return;
  q(
    `DELETE FROM aktivitas WHERE id <= (
       SELECT COALESCE(MAX(id), 0) - $1 FROM aktivitas
     )`,
    [MAX_ROWS]
  ).catch(() => {});
}

