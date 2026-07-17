/**
 * Diagnosa penyimpanan LAPORAN .docx di ImageKit (+ migrasi malas dari base64).
 * Jalankan: node diag-laporan-imagekit.mjs   (server hidup di :4000)
 */
import * as store from "./src/storage.js";
import { pakaiCloud } from "./src/files.js";
import { q } from "./src/db.js";

const BASE = "http://localhost:4000";
const suf = Date.now().toString(36);
let lulus = 0, gagal = 0;
const cek = (nama, kondisi, info = "") => {
  if (kondisi) { lulus++; console.log(`  ✅ ${nama}`); }
  else { gagal++; console.log(`  ❌ ${nama} ${info}`); }
};

// .docx palsu yang valid secara header (ZIP "PK")
const DOCX = Buffer.concat([Buffer.from("PK\x03\x04"), Buffer.from("isi-uji-".repeat(64))]);

let timId = "";
try {
  console.log(`Mode penyimpanan: ${pakaiCloud() ? "ImageKit (cloud)" : "folder lokal uploads/"}`);

  const r = await fetch(`${BASE}/api/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: `uji-lap-${suf}`, password: "rahasia123" }),
  }).then((x) => x.json());
  timId = r.user.id;
  const H = { Authorization: `Bearer ${r.token}` };

  // 1. Unggah via API multipart
  const fd = new FormData();
  fd.append("file", new Blob([DOCX], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  }), "laporan-uji.docx");
  const up = await fetch(`${BASE}/api/laporan`, { method: "POST", headers: H, body: fd });
  const upJ = await up.json();
  cek("unggah laporan → ok", up.status === 200 && upJ.ok, JSON.stringify(upJ));

  // 2. Baris DB: data kosong + file_key terisi (bukan base64 di Neon)
  const row = (await q("SELECT data, file_key, ukuran FROM laporan_docx WHERE user_id = $1", [timId]))[0];
  cek("kolom data kosong (hemat Neon)", row && row.data === "");
  cek("file_key terisi", row && row.file_key.startsWith("lap_"), row?.file_key);

  // 3. Unduh kembali — isi identik
  const file = await fetch(`${BASE}/api/laporan/file`, { headers: H });
  const buf = Buffer.from(await file.arrayBuffer());
  cek("unduh kembali identik", file.status === 200 && buf.equals(DOCX));

  // 4. Migrasi malas: paksa baris jadi gaya lama (base64, tanpa file_key)
  await q("UPDATE laporan_docx SET data = $1, file_key = '' WHERE user_id = $2",
    [DOCX.toString("base64"), timId]);
  const lap = await store.getLaporan(timId);
  cek("baris lama tetap terbaca", lap && lap.buffer.equals(DOCX));
  const row2 = (await q("SELECT data, file_key FROM laporan_docx WHERE user_id = $1", [timId]))[0];
  cek("migrasi malas → file_key terisi lagi, data dikosongkan",
    row2 && row2.file_key.startsWith("lap_") && row2.data === "");

  // 5. Ganti laporan → file lama di cloud dibersihkan (tidak error)
  const fd2 = new FormData();
  fd2.append("file", new Blob([DOCX]), "laporan-uji-v2.docx");
  const up2 = await fetch(`${BASE}/api/laporan`, { method: "POST", headers: H, body: fd2 });
  cek("ganti laporan → ok", up2.status === 200);
  const info = await fetch(`${BASE}/api/laporan/info`, { headers: H }).then((x) => x.json());
  cek("info menunjukkan nama baru", info.ada && info.nama === "laporan-uji-v2.docx");

  // 6. Hapus
  const del = await fetch(`${BASE}/api/laporan`, { method: "DELETE", headers: H });
  cek("hapus laporan → ok", del.status === 200);
  const info2 = await fetch(`${BASE}/api/laporan/info`, { headers: H }).then((x) => x.json());
  cek("info kosong setelah hapus", info2.ada === false);

  console.log(`\n== HASIL: ${lulus} lulus, ${gagal} gagal ==`);
} finally {
  if (timId) await store.deleteUser(timId).catch(() => {});
  console.log("Akun uji dibersihkan.");
  process.exit(gagal ? 1 : 0);
}

