/**
 * Uji cepat pemisah halaman ekspor DOCX (tanpa database):
 * bagian keuangan harus dimulai di HALAMAN BARU, bukan menempel persis
 * di bawah tabel kegiatan.
 *
 * - memakai fungsi asli `sisipkanPemisahHalaman` dari backend/src/export/docx.js
 * - dicek pada template resmi + dua XML tiruan (dengan/ tanpa paragraf judul)
 * - idempoten: dijalankan dua kali tidak menambah break kedua
 *
 * Jalankan: node tools/test-pemisah-halaman.mjs
 */
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { sisipkanPemisahHalaman } from "../backend/src/export/docx.js";

let gagal = 0;
const cek = (nama, ok, detail = "") => {
  console.log(`${ok ? "✔" : "✘"} ${nama}${detail ? ` — ${detail}` : ""}`);
  if (!ok) gagal += 1;
};

const BREAK = '<w:br w:type="page"/>';
const jumlahBreak = (s) => (s.match(/<w:br[^>]*w:type="page"/g) || []).length;

/* ---------- 1. XML tiruan TANPA judul (hanya paragraf kosong) ---------- */
{
  const antara = "<w:p/>";
  const hasil = sisipkanPemisahHalaman(antara);
  cek("tanpa judul: satu pemisah halaman ditambahkan", jumlahBreak(hasil) === 1);
  cek("tanpa judul: pemisah berada PALING AKHIR (tabel mulai halaman baru)",
    hasil.endsWith(`<w:p><w:r>${BREAK}</w:r></w:p>`), hasil);
  cek("idempoten: pemanggilan kedua tidak menggandakan pemisah",
    jumlahBreak(sisipkanPemisahHalaman(hasil)) === 1);
}

/* ---------- 2. XML tiruan DENGAN paragraf judul bagian keuangan ---------- */
{
  const judul = "<w:p><w:r><w:t>LOGBOOK KEUANGAN</w:t></w:r></w:p>";
  const antara = `<w:p/>${judul}`;
  const hasil = sisipkanPemisahHalaman(antara);
  cek("dengan judul: satu pemisah halaman ditambahkan", jumlahBreak(hasil) === 1);
  cek("dengan judul: pemisah tepat SEBELUM judul (judul jadi awal halaman baru)",
    hasil.indexOf(BREAK) < hasil.indexOf("LOGBOOK KEUANGAN"), hasil);
  cek("dengan judul: idempoten",
    jumlahBreak(sisipkanPemisahHalaman(hasil)) === 1);
}

/* ---------- 3. Template resmi ---------- */
const TEMPLATE = path.resolve("backend/src/assets/template-logbook.docx");
if (!fs.existsSync(TEMPLATE)) {
  console.log("… template resmi tidak ditemukan, uji template dilewati");
} else {
  const zip = await JSZip.loadAsync(fs.readFileSync(TEMPLATE));
  const xml = await zip.file("word/document.xml").async("string");
  const tblRe = /<w:tbl>[\s\S]*?<\/w:tbl>/g;
  const pos = [...xml.matchAll(tblRe)].map((m) => ({ at: m.index, len: m[0].length }));
  cek("template resmi punya 2 tabel", pos.length >= 2, `ditemukan ${pos.length}`);

  const [t1, t2] = pos;
  const antara = sisipkanPemisahHalaman(xml.slice(t1.at + t1.len, t2.at));
  const baru = xml.slice(0, t1.at) + xml.substr(t1.at, t1.len) + antara + xml.slice(t2.at);

  cek("template: tepat satu pemisah halaman di antara kedua tabel",
    jumlahBreak(antara) === 1);
  const posBreak = baru.indexOf(BREAK);
  const posTbl2 = baru.lastIndexOf("<w:tbl>");
  cek("template: pemisah berada setelah tabel kegiatan & sebelum tabel keuangan",
    posBreak > t1.at && posBreak < posTbl2, `break@${posBreak} tbl2@${posTbl2}`);
  cek("template: jumlah tabel tetap 2 setelah dirakit ulang",
    (baru.match(/<w:tbl>/g) || []).length === 2);
}

console.log(gagal ? `\n${gagal} pemeriksaan GAGAL` : "\nSemua pemeriksaan lulus");
process.exit(gagal ? 1 : 0);

