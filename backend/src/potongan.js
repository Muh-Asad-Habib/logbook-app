/**
 * Unggahan TERPOTONG (chunked) terpusat — dipakai laporan (.docx), impor
 * DOCX, dan presentasi (.pptx).
 *
 * PRINSIP HEMAT NEON: biner potongan TIDAK pernah menyentuh database.
 * Ia diunggah ke IMAGEKIT (kuota 20 GB) dengan kunci deterministik
 * `tmp-<id>-<idx>.bin`; tabel import_chunks hanya menyimpan KUNCI-nya
 * (±30 byte/baris). Dulu base64 utuh ikut masuk Neon — beberapa unggahan
 * besar saja sudah memakan puluhan MB dari kuota 0,5 GB.
 *
 * Baris kedaluwarsa (>1 jam) dibersihkan otomatis BESERTA berkas tmp-nya
 * di ImageKit setiap ada unggahan potongan pertama.
 */
import { q } from "./db.js";
import { putBlob, getFileBufferRetry, removeFiles } from "./files.js";

export const CHUNK_MAX_B64 = 3.5 * 1024 * 1024; // ±2,6 MB biner per potongan
export const CHUNK_MAX_IDX = 60;
export const ID_RE = /^[a-z0-9-]{8,64}$/;

const kunci = (id, idx) => `tmp-${id}-${idx}.bin`;

/** Validasi parameter potongan; kembalikan pesan error atau "" bila sah. */
export function cekPotongan(id, idx, data) {
  const i = Number(idx);
  if (!ID_RE.test(String(id || "")) || !Number.isInteger(i) || i < 0 || i > CHUNK_MAX_IDX) {
    return "id/idx potongan tidak valid";
  }
  if (typeof data !== "string" || !data || data.length > CHUNK_MAX_B64 ||
      !/^[A-Za-z0-9+/=]+$/.test(data)) {
    return "data potongan tidak valid (harus base64 ≤ 3,5 MB)";
  }
  return "";
}

/** Simpan SATU potongan: biner → ImageKit, katalog kunci → Neon. */
export async function simpanPotongan(id, idx, userId, base64) {
  const key = kunci(id, Number(idx));
  await putBlob(key, Buffer.from(base64, "base64"));
  await q(
    `INSERT INTO import_chunks (id, idx, user_id, data, created_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id, idx) DO UPDATE SET data = EXCLUDED.data,
       user_id = EXCLUDED.user_id, created_at = EXCLUDED.created_at`,
    [id, Number(idx), userId, key, new Date().toISOString()]
  );
  if (Number(idx) === 0) bersihkanKedaluwarsa(); // best-effort, tanpa await
}

/** Rakit seluruh potongan menjadi satu Buffer lalu bersihkan jejaknya. */
export async function rakitPotongan(id, userId, total) {
  const rows = await q(
    "SELECT idx, data FROM import_chunks WHERE id = $1 AND user_id = $2 ORDER BY idx",
    [id, userId]
  );
  if (rows.length !== total) {
    const e = new Error(`Potongan tidak lengkap (${rows.length}/${total}) — coba unggah ulang`);
    e.status = 400;
    throw e;
  }
  const bagian = [];
  for (const r of rows) {
    // Kompatibilitas: baris LAMA berisi base64 langsung, baris baru berisi kunci
    if (/^tmp-/.test(r.data)) {
      const buf = await getFileBufferRetry(r.data); // retry: tunggu propagasi CDN
      if (!buf) {
        const e = new Error(`Potongan #${r.idx} hilang di penyimpanan — coba unggah ulang`);
        e.status = 400;
        throw e;
      }
      bagian.push(buf);
    } else {
      bagian.push(Buffer.from(r.data, "base64"));
    }
  }
  await bersihkanPotongan(id, userId);
  return Buffer.concat(bagian);
}

/** Hapus baris katalog + berkas tmp di ImageKit (abaikan kegagalan). */
export async function bersihkanPotongan(id, userId) {
  try {
    const rows = await q(
      "SELECT data FROM import_chunks WHERE id = $1 AND user_id = $2", [id, userId]);
    await q("DELETE FROM import_chunks WHERE id = $1 AND user_id = $2", [id, userId]);
    await removeFiles(rows.map((r) => r.data).filter((k) => /^tmp-/.test(k)));
  } catch { /* best-effort */ }
}

/** Buang unggahan terbengkalai (>1 jam) — baris DB dan berkas ImageKit-nya. */
export function bersihkanKedaluwarsa() {
  const batas = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  (async () => {
    const rows = await q(
      "SELECT data FROM import_chunks WHERE created_at < $1", [batas]);
    if (!rows.length) return;
    await q("DELETE FROM import_chunks WHERE created_at < $1", [batas]);
    await removeFiles(rows.map((r) => r.data).filter((k) => /^tmp-/.test(k)));
  })().catch(() => {});
}

export const validTotal = (total) =>
  Number.isInteger(total) && total >= 1 && total <= CHUNK_MAX_IDX + 1;

