/**
 * Diagnosis lanjutan: PDF, XLSX, dan DOCX untuk akun NON-pemilik template.
 * Baca-saja — tidak mengubah data. Jalankan: node backend/diag-export2.mjs
 */
import JSZip from "jszip";
import { q } from "./src/db.js";
import * as store from "./src/storage.js";
import { buildDocx, entriesToExport } from "./src/export/docx.js";
import { buildPdf } from "./src/export/pdf.js";
import { buildXlsx } from "./src/export/xlsx.js";

const ownerId = await store.getMeta("templateOwnerId");
const users = await q("SELECT id, username FROM users ORDER BY created_at");
console.log(`akun terdaftar: ${users.length}`);

// ---- PDF & XLSX pemilik template ----
const pdf = await buildPdf(ownerId);
console.log(`✅ PDF pemilik: ${(pdf.length / 1024 / 1024).toFixed(1)} MB — header %PDF: ${pdf.subarray(0, 5).toString() === "%PDF-"}`);

const xlsx = await buildXlsx(ownerId);
const zx = await JSZip.loadAsync(xlsx);
const shared = Object.keys(zx.files).some((f) => f.startsWith("xl/"));
console.log(`✅ XLSX pemilik: ${(xlsx.length / 1024).toFixed(0)} KB — struktur xl/: ${shared}`);

// ---- DOCX akun non-pemilik (bila ada) ----
const lain = users.find((u) => u.id !== ownerId);
if (lain) {
  const keg = await store.listKegiatan(lain.id);
  const keu = await store.listKeuangan(lain.id);
  const info = await entriesToExport(lain.id);
  console.log(`\nakun non-pemilik "${lain.username}": ${keg.length} kegiatan, ${keu.length} keuangan; info=${JSON.stringify(info)}`);
  const hasil = await buildDocx(lain.id);
  console.log(`buildDocx non-pemilik: kegBaru=${hasil.kegBaru} kegLewat=${hasil.kegLewat} keuBaru=${hasil.keuBaru} keuLewat=${hasil.keuLewat}`);
  const zip = await JSZip.loadAsync(hasil.buffer);
  const docXml = await zip.file("word/document.xml").async("string");
  const textOf = (xml) => (xml.match(/<w:t[^>]*>[\s\S]*?<\/w:t>/g) || [])
    .map((x) => x.replace(/<[^>]+>/g, "")).join(" ");
  const tables = docXml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) || [];
  const isiTabel = textOf(tables[0]);
  // dokumen non-pemilik TIDAK boleh berisi data pemilik template
  const kegOwner = await store.listKegiatan(ownerId);
  const bocor = kegOwner.filter((e) =>
    e.kegiatan.length > 20 && isiTabel.includes(e.kegiatan.slice(0, 30)));
  console.log(bocor.length === 0
    ? "✅ tidak ada data pemilik template yang bocor ke dokumen akun lain"
    : `❌ BOCOR ${bocor.length} entri pemilik template!`);
  const adaSemua = keg.every((e) => isiTabel.includes(e.kegiatan.slice(0, 30)));
  console.log(adaSemua || keg.length === 0
    ? "✅ semua entri akun non-pemilik ada di dokumennya"
    : "❌ ada entri akun non-pemilik yang hilang");
} else {
  console.log("\n(tidak ada akun non-pemilik untuk diuji)");
}

console.log("\nSELESAI");

