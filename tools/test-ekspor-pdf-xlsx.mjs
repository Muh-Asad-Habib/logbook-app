/**
 * Uji ekspor PDF & Excel memakai data NYATA di database.
 *
 * Memastikan bagian/sheet "Rekap dana PKM" ikut tercetak dan berkasnya
 * tetap valid setelah kolom sumber dana ditambahkan.
 *
 * Pakai: node tools/test-ekspor-pdf-xlsx.mjs ["Nama Akun"]
 */
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { q } from "../backend/src/db.js";
import * as store from "../backend/src/storage.js";
import { buildPdf } from "../backend/src/export/pdf.js";
import { buildXlsx } from "../backend/src/export/xlsx.js";
import { rekapDana } from "../backend/src/export/pkm.js";

let gagal = 0;
const cek = (nama, kondisi, detail = "") => {
  console.log(`${kondisi ? "[ok]  " : "[GAGAL]"} ${nama}${detail ? ` — ${detail}` : ""}`);
  if (!kondisi) gagal += 1;
};

const nama = process.argv[2] || "";
const rows = nama
  ? await q("SELECT id, username FROM users WHERE username_lower = $1", [nama.toLowerCase()])
  : await q("SELECT id, username FROM users WHERE role = 'tim' ORDER BY created_at LIMIT 1");
if (!rows.length) {
  console.error("Akun tidak ditemukan:", nama || "(tim pertama)");
  process.exit(1);
}
const u = rows[0];

const keuangan = await store.listKeuangan(u.id);
const dana = await store.hitungDana(u.id);
const rekap = rekapDana(keuangan, { belmawa: dana.belmawa, pt: dana.pt });

console.log(`Akun uji : ${u.username}`);
console.log(`Dana     : Belmawa ${dana.belmawa} · PT ${dana.pt} · total ${dana.total}`);
console.log(`Belanja  : ${keuangan.length} entri · Belmawa ${rekap.totalBelmawa}`
  + ` · PT ${rekap.totalPt} · belum ditandai ${rekap.nTanpaSumber}\n`);

/* ---------- PDF ---------- */
const t0 = Date.now();
const pdf = await buildPdf(u.id, u.username);
const pdfPath = path.join(process.cwd(), "tools", "hasil-uji.pdf");
fs.writeFileSync(pdfPath, pdf);
console.log(`PDF  : ${(pdf.length / 1024 / 1024).toFixed(2)} MB (${((Date.now() - t0) / 1000).toFixed(1)} dtk)`);

cek("PDF berformat valid (%PDF)", pdf.subarray(0, 4).toString() === "%PDF");
cek("PDF berukuran wajar", pdf.length > 20_000);

/* ---------- Excel ---------- */
const t1 = Date.now();
const xls = await buildXlsx(u.id, u.username);
const xlsPath = path.join(process.cwd(), "tools", "hasil-uji.xlsx");
fs.writeFileSync(xlsPath, xls);
console.log(`XLSX : ${(xls.length / 1024).toFixed(0)} KB (${((Date.now() - t1) / 1000).toFixed(1)} dtk)\n`);

const zip = await JSZip.loadAsync(xls);
const workbook = await zip.file("xl/workbook.xml").async("string");
const sheet = [...workbook.matchAll(/name="([^"]+)"/g)].map((m) => m[1]);
console.log("Sheet Excel:", sheet.join(", "));

cek("Excel valid (zip berisi workbook)", !!workbook);
cek("sheet Ringkasan ada", sheet.includes("Ringkasan"));
cek("sheet Keuangan ada", sheet.includes("Keuangan"));

const adaRekap = rekap.adaPenandaan || dana.belmawa > 0 || dana.pt > 0;
if (adaRekap) {
  cek("sheet 'Rekap Dana' tercetak", sheet.includes("Rekap Dana"));
  const shared = await zip.file("xl/sharedStrings.xml")?.async("string") || "";
  cek("teks 'Bahan habis pakai' ada di Excel", shared.includes("Bahan habis pakai"));
  cek("teks 'Perguruan Tinggi' ada di Excel", shared.includes("Perguruan Tinggi"));
  cek("kolom 'Sumber dana' ada di sheet Keuangan", shared.includes("Sumber dana"));
} else {
  cek("tim belum memakai penandaan → sheet Rekap Dana sengaja dilewati",
    !sheet.includes("Rekap Dana"));
}

console.log(gagal ? `\n${gagal} PENGUJIAN GAGAL` : "\nSEMUA PENGUJIAN LULUS");
process.exit(gagal ? 1 : 0);

