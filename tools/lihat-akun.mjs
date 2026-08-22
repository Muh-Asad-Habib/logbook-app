/** Lihat seluruh data akun dari cloud DB (read-only).
 *  Pakai: node tools/lihat-akun.mjs "Amerta Sign" */
import { q } from "../backend/src/db.js";

const nama = process.argv[2] || "Amerta Sign";
const users = await q(
  "SELECT id, username, role, created_at FROM users WHERE username_lower = $1",
  [nama.toLowerCase()]
);
if (!users.length) {
  console.log("Akun tidak ditemukan:", nama);
  const semua = await q("SELECT username, role FROM users ORDER BY created_at");
  console.log("Daftar akun:", semua.map((u) => `${u.username} (${u.role})`).join(", "));
  process.exit(1);
}
const u = users[0];
console.log("=== AKUN ===");
console.log(JSON.stringify(u));

const keg = await q(
  "SELECT id, tanggal, kegiatan, capaian_delta, waktu_menit, foto_keys FROM kegiatan WHERE user_id = $1 ORDER BY tanggal, created_at",
  [u.id]
);
console.log(`\n=== KEGIATAN (${keg.length}) ===`);
let tot = 0;
for (const e of keg) {
  tot = Math.min(100, tot + e.capaian_delta);
  const fk = typeof e.foto_keys === "string" ? JSON.parse(e.foto_keys) : e.foto_keys || [];
  console.log(`\n[${e.id}] ${e.tanggal} | +${e.capaian_delta}% (tot ${tot}%) | ${e.waktu_menit} mnt | ${fk.length} foto`);
  console.log(e.kegiatan);
}

const keu = await q(
  "SELECT id, tanggal, item, harga_satuan, satuan_suffix, jumlah, total, bukti_key FROM keuangan WHERE user_id = $1 ORDER BY tanggal, created_at",
  [u.id]
);
console.log(`\n=== KEUANGAN (${keu.length}) ===`);
for (const e of keu) {
  console.log(`[${e.id}] ${e.tanggal} | ${e.item} | Rp${e.harga_satuan}${e.satuan_suffix || ""} x ${e.jumlah} = Rp${e.total} | bukti: ${e.bukti_key || "-"}`);
}

const set = await q("SELECT kunci, nilai FROM pengaturan WHERE user_id = $1", [u.id]);
console.log(`\n=== PENGATURAN ===`);
for (const s of set) console.log(`${s.kunci} = ${String(s.nilai).slice(0, 100)}`);

const lap = await q("SELECT nama, ukuran, file_key, updated_at FROM laporan_docx WHERE user_id = $1", [u.id]);
const pres = await q("SELECT nama, ukuran, file_key, canva_url, updated_at FROM presentasi WHERE user_id = $1", [u.id]);
console.log(`\n=== LAIN ===`);
console.log("laporan_docx:", lap.length ? JSON.stringify(lap[0]) : "-");
console.log("presentasi:", pres.length ? JSON.stringify(pres[0]) : "-");

