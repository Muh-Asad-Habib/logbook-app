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
import { q, larik } from "./src/db.js";
import { removeFiles, kunciBagian } from "./src/files.js";

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

/* 3. tabel bekas fitur yang sudah dicabut (Canva Connect) */
for (const t of ["canva_oauth", "canva_oauth_state"]) {
  try {
    await q(`DROP TABLE IF EXISTS ${t}`);
    console.log(`DROP TABLE ${t}: ok`);
  } catch (e) { console.log(`DROP TABLE ${t}: ${e.message}`); }
}

/* 4. baris kedaluwarsa (tautan publik, sesi admin, penghitung login basi) */
const kadaluwarsa = [
  ["laporan_links", "exp < $1", [Date.now()]],
  ["admin_sessions", "exp < $1", [Date.now()]],
  ["admin_login_fails", "locked_until < $1 AND locked_until > 0", [Date.now()]],
];
for (const [tabel, syarat, param] of kadaluwarsa) {
  const r = await q(`DELETE FROM ${tabel} WHERE ${syarat} RETURNING 1`, param);
  if (r.length) console.log(`${tabel}: ${r.length} baris kedaluwarsa dihapus`);
}

/* 5. berkas YATIM di tabel files — kunci yang tidak dirujuk siapa pun lagi
 * (sisa kegagalan lama). Hapus baris katalognya SEKALIGUS berkasnya di
 * ImageKit, supaya dua-duanya sama-sama bersih. */
const dirujuk = new Set();
for (const r of await q("SELECT foto_keys FROM kegiatan")) {
  for (const k of larik(r.foto_keys)) dirujuk.add(k);
}
for (const r of await q("SELECT bukti_key FROM keuangan WHERE bukti_key <> ''")) {
  dirujuk.add(r.bukti_key);
}
for (const r of await q("SELECT file_key FROM laporan_docx WHERE file_key <> ''")) {
  for (const k of kunciBagian(r.file_key)) dirujuk.add(k);
}
for (const r of await q("SELECT file_key FROM presentasi WHERE file_key <> ''")) {
  for (const k of kunciBagian(r.file_key)) dirujuk.add(k);
}
for (const r of await q("SELECT data FROM import_chunks WHERE data LIKE 'tmp-%'")) {
  dirujuk.add(r.data); // potongan unggahan yang masih berjalan
}
const semuaKey = await q("SELECT key FROM files");
const yatim = semuaKey.map((r) => r.key).filter((k) => !dirujuk.has(k));
if (yatim.length) {
  await removeFiles(yatim); // hapus di ImageKit + baris files
  console.log(`files: ${yatim.length} berkas yatim dihapus (dari ${semuaKey.length} baris)`);
} else {
  console.log(`files: bersih, semua ${semuaKey.length} baris masih dirujuk`);
}

/* 6. kembalikan ruang ke kuota (VACUUM FULL menulis ulang tabel) */
for (const t of ["import_chunks", "laporan_docx", "aktivitas", "audit", "sessions", "files"]) {
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

