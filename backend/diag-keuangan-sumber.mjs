/**
 * Uji cepat fitur "sumber dana" pada keuangan — tanpa database.
 *
 * Yang diperiksa:
 *  1. Pembersihan nilai sumber/kategori (nilai asing → "" alias belum dipilih)
 *  2. Endpoint /:id/sumber terdaftar sebagai PATCH
 *  3. Perhitungan rekap dana (frontend & backend memberi angka yang sama)
 *
 * Jalankan: node backend/diag-keuangan-sumber.mjs
 */
import router from "./src/routes/keuangan.js";
import { rekapDana, teksSumber, BATAS_DANA_PT } from "./src/export/pkm.js";
import { rekapDana as rekapFe } from "../frontend/lib/pkm.js";

let gagal = 0;
const cek = (nama, kondisi, detail = "") => {
  console.log(`${kondisi ? "[ok]  " : "[GAGAL]"} ${nama}${detail ? ` — ${detail}` : ""}`);
  if (!kondisi) gagal += 1;
};

/* ---------- 1. Rute terdaftar ---------- */
const rute = router.stack
  .filter((l) => l.route)
  .map((l) => `${Object.keys(l.route.methods).join(",").toUpperCase()} ${l.route.path}`);
console.log("Rute keuangan:\n  " + rute.join("\n  ") + "\n");

cek("PATCH /:id/sumber terdaftar", rute.includes("PATCH /:id/sumber"));
cek("POST / tetap ada", rute.includes("POST /"));
cek("PUT /:id tetap ada", rute.includes("PUT /:id"));
cek("DELETE /:id tetap ada", rute.includes("DELETE /:id"));

/* ---------- 2. Label sumber ---------- */
cek("teksSumber: entri tanpa sumber → '-'", teksSumber({}) === "-");
cek("teksSumber: PT tanpa kategori",
  teksSumber({ sumber: "pt" }) === "Perguruan Tinggi");
cek("teksSumber: Belmawa + kategori",
  teksSumber({ sumber: "belmawa", kategori: "bahan" }) === "Belmawa · Bahan habis pakai");
cek("teksSumber: kategori diabaikan untuk PT",
  teksSumber({ sumber: "pt", kategori: "bahan" }) === "Perguruan Tinggi");

/* ---------- 3. Rekap dana ---------- */
const contoh = [
  { total: 600_000, sumber: "belmawa", kategori: "bahan" },
  { total: 200_000, sumber: "belmawa", kategori: "" },       // belum berkategori
  { total: 250_000, sumber: "belmawa", kategori: "sewa" },   // > batas 15%
  { total: 2_500_000, sumber: "pt" },                        // > batas PT
  { total: 100_000 },                                        // belum bersumber
];
const dana = { belmawa: 1_000_000, pt: 0 };
const r = rekapDana(contoh, dana);

cek("total Belmawa dijumlah benar", r.totalBelmawa === 1_050_000, `dapat ${r.totalBelmawa}`);
cek("total PT dijumlah benar", r.totalPt === 2_500_000, `dapat ${r.totalPt}`);
cek("entri tanpa sumber dihitung terpisah",
  r.nTanpaSumber === 1 && r.totalTanpaSumber === 100_000);
cek("entri Belmawa tanpa kategori dihitung terpisah",
  r.nBelmawaTanpaKategori === 1 && r.totalBelmawaTanpaKategori === 200_000);

const bahan = r.kategori.find((k) => k.id === "bahan");
const sewa = r.kategori.find((k) => k.id === "sewa");
cek("bahan habis pakai 60% → batas Rp600.000", bahan.batas === 600_000);
cek("bahan tepat di batas tidak dianggap lewat", bahan.lewat === false);
cek("sewa & jasa 15% → Rp250.000 melewati batas Rp150.000", sewa.lewat === true);
cek("persentase kategori benar", bahan.pct === 60, `dapat ${bahan.pct}`);
cek("dana PT melebihi batas terdeteksi",
  r.ptLewatBatas === true && BATAS_DANA_PT === 2_000_000);

/* ---------- 4. Backend & frontend sinkron ---------- */
const rf = rekapFe(contoh, dana);
cek("rekap backend = rekap frontend (Belmawa)", rf.totalBelmawa === r.totalBelmawa);
cek("rekap backend = rekap frontend (PT)", rf.totalPt === r.totalPt);
cek("rekap backend = rekap frontend (kategori bahan)",
  rf.kategori[0].terpakai === bahan.terpakai && rf.kategori[0].lewat === bahan.lewat);

/* ---------- 5. Tanpa penandaan apa pun ---------- */
const kosong = rekapDana([{ total: 50_000 }], {});
cek("tanpa penandaan → adaPenandaan = false", kosong.adaPenandaan === false);
cek("tanpa dana → batas kategori 0 (tidak dianggap lewat)",
  kosong.kategori.every((k) => k.batas === 0 && k.lewat === false));

console.log(gagal ? `\n${gagal} PENGUJIAN GAGAL` : "\nSEMUA PENGUJIAN LULUS");
process.exit(gagal ? 1 : 0);

