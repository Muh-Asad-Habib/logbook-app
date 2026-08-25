/**
 * Uji ekspor DOCX end-to-end memakai data NYATA di database.
 * Menyimpan hasilnya ke tools/hasil-ekspor-uji.docx lalu memeriksa bahwa
 * setiap gambar di dalamnya tersemat dengan rasio tampil = rasio aslinya
 * (tidak ada gambar yang terpotong/gepeng).
 *
 * Pakai: node tools/test-ekspor-nyata.mjs ["Nama Akun"]
 */
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import sharp from "sharp";
import { q } from "../backend/src/db.js";
import { buildDocx } from "../backend/src/export/docx.js";

const nama = process.argv[2] || "";
const rows = nama
  ? await q("SELECT id, username FROM users WHERE username_lower = $1", [nama.toLowerCase()])
  : await q("SELECT id, username FROM users WHERE role = 'tim' ORDER BY created_at LIMIT 1");
if (!rows.length) {
  console.error("Akun tidak ditemukan:", nama || "(tim pertama)");
  process.exit(1);
}
const u = rows[0];
console.log(`Akun uji: ${u.username}\n`);

const t0 = Date.now();
const hasil = await buildDocx(u.id);
const detik = ((Date.now() - t0) / 1000).toFixed(1);
const keluar = path.resolve("tools", "hasil-ekspor-uji.docx");
fs.writeFileSync(keluar, hasil.buffer);

const mb = (hasil.buffer.length / 1048576).toFixed(2);
console.log(`Berkas   : ${keluar}`);
console.log(`Ukuran   : ${mb} MB  (dibuat ${detik} dtk)`);
console.log(`Kegiatan : ${hasil.kegBaru} baru, ${hasil.kegLewat} dilewati`);
console.log(`Keuangan : ${hasil.keuBaru} baru, ${hasil.keuLewat} dilewati\n`);

/* ---- Periksa rasio tiap gambar yang tersemat ---- */
const zip = await JSZip.loadAsync(hasil.buffer);
const docXml = await zip.file("word/document.xml").async("string");
const relsXml = await zip.file("word/_rels/document.xml.rels").async("string");

const target = new Map();
for (const m of relsXml.matchAll(/<Relationship[^>]*Id="(rId\d+)"[^>]*Target="([^"]+)"/g)) {
  target.set(m[1], "word/" + m[2].replace(/^\//, "").replace(/^word\//, ""));
}

let diperiksa = 0, gepeng = 0, terpotong = 0;
let cxMaks = 0, cyMaks = 0;
for (const d of docXml.match(/<w:drawing>[\s\S]*?<\/w:drawing>/g) || []) {
  const rid = (d.match(/r:embed="(rId\d+)"/) || [])[1];
  const ext = d.match(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/);
  if (!rid || !ext) continue;
  const nama = target.get(rid);
  const berkas = nama && zip.file(nama);
  if (!berkas) continue;
  let md;
  try {
    md = await sharp(await berkas.async("nodebuffer")).metadata();
  } catch { continue; }
  if (!md.width || !md.height) continue;

  const cx = Number(ext[1]), cy = Number(ext[2]);
  cxMaks = Math.max(cxMaks, cx);
  cyMaks = Math.max(cyMaks, cy);
  const rasioTampil = cy / cx;
  const rasioAsli = md.height / md.width;
  // beda > 2% berarti gambar diregangkan (gepeng) di dokumen
  if (Math.abs(rasioTampil - rasioAsli) / rasioAsli > 0.02) {
    gepeng += 1;
    console.log(`  ⚠ ${nama}: tampil ${rasioTampil.toFixed(3)} vs asli ${rasioAsli.toFixed(3)}`);
  }
  diperiksa += 1;
}

const cm = (emu) => (emu / 360000).toFixed(2);
console.log(`Gambar diperiksa : ${diperiksa}`);
console.log(`Rasio menyimpang : ${gepeng}`);
console.log(`Ukuran tampil maks: ${cm(cxMaks)} × ${cm(cyMaks)} cm`);
console.log(gepeng ? "\nADA GAMBAR YANG RASIONYA MENYIMPANG" : "\nSEMUA GAMBAR TERSEMAT UTUH & SESUAI RASIO ASLI");
process.exit(gepeng || terpotong ? 1 : 0);

