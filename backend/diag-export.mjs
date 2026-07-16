/**
 * Diagnosis ekspor DOCX dengan DATA & TEMPLATE ASLI (baca-saja, tanpa mengubah DB).
 * Jalankan: node tools/diag-export.mjs
 */
import JSZip from "jszip";
import * as store from "./src/storage.js";
import { buildDocx, entriesToExport } from "./src/export/docx.js";

const rowsOf = (t) => t.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) || [];
const textOf = (xml) => (xml.match(/<w:t[^>]*>[\s\S]*?<\/w:t>/g) || [])
  .map((x) => x.replace(/<[^>]+>/g, "")).join(" ");
const normText = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
const norm = (s) => normText(s).slice(0, 40);

const ownerId = await store.getMeta("templateOwnerId");
console.log("templateOwnerId:", ownerId || "(kosong!)");
if (!ownerId) process.exit(1);

const keg = await store.listKegiatan(ownerId);
const keu = await store.listKeuangan(ownerId);
console.log(`DB: ${keg.length} kegiatan, ${keu.length} keuangan`);
console.log("5 kegiatan terakhir di DB:");
for (const e of keg.slice(-5)) {
  console.log(`  - ${e.tanggal} | ${e.waktu_menit} mnt | ${e.kegiatan.slice(0, 60)}`);
}

console.log("\ninfo entriesToExport:", await entriesToExport(ownerId));

console.log("\nMenjalankan buildDocx …");
const t0 = Date.now();
const hasil = await buildDocx(ownerId);
console.log(`selesai ${Date.now() - t0} ms — kegBaru=${hasil.kegBaru} kegLewat=${hasil.kegLewat} keuBaru=${hasil.keuBaru} keuLewat=${hasil.keuLewat}`);
console.log(`ukuran berkas: ${(hasil.buffer.length / 1024 / 1024).toFixed(1)} MB`);

// Bongkar hasil & periksa isi tabel kegiatan
const zip = await JSZip.loadAsync(hasil.buffer);
const docXml = await zip.file("word/document.xml").async("string");
const tables = docXml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) || [];
console.log(`\ntabel di dokumen: ${tables.length}`);

const rows = rowsOf(tables[0]);
console.log(`baris tabel kegiatan (termasuk header): ${rows.length}`);

// setiap entri DB harus ada di dokumen
let hilang = 0;
const docNorm = normText(textOf(tables[0]));
for (const e of keg) {
  if (!docNorm.includes(norm(e.kegiatan))) {
    hilang += 1;
    console.log(`  ❌ TIDAK ADA di dokumen: ${e.tanggal} | ${e.kegiatan.slice(0, 60)}`);
  }
}
console.log(hilang === 0 ? "✅ semua entri kegiatan DB ada di dokumen" : `❌ ${hilang} entri hilang`);

// tampilkan 6 baris terakhir tabel kegiatan (tanggal + potongan kegiatan + waktu)
console.log("\n6 baris terakhir tabel kegiatan pada dokumen:");
for (const r of rows.slice(-6)) {
  const cells = (r.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || []).map((c) => textOf(c).trim());
  console.log(`  [${cells[0] || "-"}] waktu=${cells[3] || "-"} | ${(cells[1] || "").slice(0, 55)}`);
}

// validasi XML kasar: pastikan tag seimbang
for (const tag of ["w:tbl", "w:tr", "w:tc", "w:p"]) {
  const buka = (docXml.match(new RegExp(`<${tag}[ >]`, "g")) || []).length;
  const tutup = (docXml.match(new RegExp(`</${tag}>`, "g")) || []).length;
  console.log(`${buka === tutup ? "✅" : "❌"} tag <${tag}> seimbang: ${buka}/${tutup}`);
}

// simpan hasil untuk dibuka manual di Word
import fs from "node:fs";
fs.writeFileSync(new URL("../tools/hasil-ekspor-uji.docx", import.meta.url), hasil.buffer);
console.log("\n→ hasil disimpan: ../tools/hasil-ekspor-uji.docx (buka di Word untuk cek manual)");


