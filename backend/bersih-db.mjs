/**
 * Perawatan kuota Neon — jalankan kapan saja:
 *   npm run bersih:db --workspace backend
 *
 * 1. Hapus baris import_chunks terbengkalai (>1 jam) — termasuk sisa base64
 *    besar dari sistem lama — beserta berkas tmp-nya di ImageKit.
 * 2. Kosongkan kolom base64 lama laporan_docx yang sudah punya file_key
 *    (berkasnya sudah aman di ImageKit).
 * 3. VACUUM FULL tabel-tabel bekas data besar agar ruangnya benar-benar
 *    dikembalikan ke kuota (DELETE saja tidak mengecilkan file tabel).
 */
import { q } from "./src/db.js";
import { removeFiles } from "./src/files.js";

const MB = (b) => (Number(b) / 1024 / 1024).toFixed(2) + " MB";
const ukuranDb = async () =>
  Number((await q("SELECT pg_database_size(current_database()) AS s"))[0].s);

const sebelum = await ukuranDb();
console.log(`Ukuran database sebelum: ${MB(sebelum)}`);

/* 1. import_chunks terbengkalai (unggahan sah selalu selesai < 1 jam).
 * PENTING: jangan SELECT kolom data mentah — sisa base64 lama bisa puluhan MB
 * dan menabrak batas respons query Neon (64 MB). Ambil metadata saja. */
const batas = new Date(Date.now() - 60 * 60 * 1000).toISOString();
const basi = await q(
  `SELECT CASE WHEN data LIKE 'tmp-%' THEN data ELSE '' END AS kunci,
          length(data) AS n
     FROM import_chunks WHERE created_at < $1`, [batas]);
if (basi.length) {
  const kunciTmp = basi.map((r) => r.kunci).filter(Boolean);
  await q("DELETE FROM import_chunks WHERE created_at < $1", [batas]);
  await removeFiles(kunciTmp);
  const b64 = basi.filter((r) => !r.kunci).reduce((s, r) => s + Number(r.n), 0);
  console.log(`import_chunks: ${basi.length} baris basi dihapus ` +
    `(${MB(b64)} base64 lama, ${kunciTmp.length} berkas tmp ImageKit ikut dihapus)`);
} else {
  console.log("import_chunks: bersih, tidak ada baris basi");
}

/* 2. base64 lama laporan_docx yang sudah bermigrasi ke ImageKit */
const lap = await q(
  `UPDATE laporan_docx SET data = ''
    WHERE file_key <> '' AND data <> '' RETURNING user_id`);
console.log(`laporan_docx: ${lap.length} kolom base64 lama dikosongkan`);

/* 3. kembalikan ruang ke kuota (VACUUM FULL menulis ulang tabel) */
for (const t of ["import_chunks", "laporan_docx", "aktivitas", "audit", "sessions"]) {
  try {
    await q(`VACUUM FULL ${t}`);
    console.log(`VACUUM FULL ${t}: ok`);
  } catch (e) {
    console.log(`VACUUM FULL ${t}: ${e.message}`);
  }
}

const sesudah = await ukuranDb();
console.log(`\nUkuran database sesudah: ${MB(sesudah)} (hemat ${MB(sebelum - sesudah)})`);
console.log("Catatan: metrik storage di dashboard Neon menyusul beberapa saat " +
  "setelah checkpoint/riwayat WAL bergulir.");
process.exit(0);

