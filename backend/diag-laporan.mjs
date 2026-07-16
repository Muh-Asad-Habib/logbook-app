/**
 * Uji roundtrip Laporan Kemajuan (DB asli, memakai user uji sementara):
 * simpan → ganti (harus MENIMPA, bukan menambah) → ambil → hapus.
 * Jalankan: node backend/diag-laporan.mjs
 */
import { q } from "./src/db.js";
import * as store from "./src/storage.js";

const UJI = "uji-laporan-000";
let gagal = 0;
const cek = (nama, kondisi) => {
  console.log(`${kondisi ? "✅" : "❌"} ${nama}`);
  if (!kondisi) gagal += 1;
};

// dokumen docx palsu (cukup header ZIP "PK" untuk uji penyimpanan)
const dok1 = Buffer.concat([Buffer.from("PK\x03\x04"), Buffer.alloc(1000, 1)]);
const dok2 = Buffer.concat([Buffer.from("PK\x03\x04"), Buffer.alloc(2500, 2)]);

await store.saveLaporan(UJI, "laporan-v1.docx", dok1);
let info = await store.infoLaporan(UJI);
cek("simpan v1 → ada, nama & ukuran benar",
  info.ada && info.nama === "laporan-v1.docx" && info.ukuran === dok1.length);

await store.saveLaporan(UJI, "laporan-v2.docx", dok2);
info = await store.infoLaporan(UJI);
cek("simpan v2 → MENGGANTI (nama & ukuran baru)",
  info.ada && info.nama === "laporan-v2.docx" && info.ukuran === dok2.length);

const jumlah = await q("SELECT COUNT(*) AS n FROM laporan_docx WHERE user_id = $1", [UJI]);
cek("hanya SATU baris tersimpan (file lama terhapus)", Number(jumlah[0].n) === 1);

const ambil = await store.getLaporan(UJI);
cek("isi file v2 utuh (byte sama)", ambil && ambil.buffer.equals(dok2));

cek("hapus laporan", await store.deleteLaporan(UJI));
info = await store.infoLaporan(UJI);
cek("setelah hapus → tidak ada", info.ada === false);

console.log(gagal ? `\n${gagal} PENGUJIAN GAGAL` : "\nSEMUA PENGUJIAN LULUS");
process.exit(gagal ? 1 : 0);

