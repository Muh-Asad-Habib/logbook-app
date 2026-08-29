/**
 * Uji ekspor DOCX KHUSUS KEUANGAN memakai data NYATA di database.
 *
 * Memeriksa: paket .docx valid (zip + part wajib), tabel Belmawa dipisah
 * per kategori dengan baris pemisah & subtotal, tabel Perguruan Tinggi
 * terpisah, serta tidak ada gambar (dokumen teks murni agar mudah diedit).
 *
 * Pakai: node tools/test-ekspor-keuangan-docx.mjs ["Nama Akun"]
 */
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { q } from "../backend/src/db.js";
import * as store from "../backend/src/storage.js";
import { buildDocxKeuangan } from "../backend/src/export/keuangan-docx.js";
import { rekapDana, LABEL_KATEGORI } from "../backend/src/export/pkm.js";

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

const t0 = Date.now();
const buf = await buildDocxKeuangan(u.id, u.username);
const out = path.join(process.cwd(), "tools", "hasil-uji-keuangan.docx");
fs.writeFileSync(out, buf);
console.log(`DOCX : ${(buf.length / 1024).toFixed(0)} KB (${((Date.now() - t0) / 1000).toFixed(1)} dtk) → ${out}\n`);

const zip = await JSZip.loadAsync(buf);
const daftar = Object.keys(zip.files);
cek("paket .docx valid (zip terbaca)", daftar.length > 0, `${daftar.length} part`);
for (const p of ["[Content_Types].xml", "_rels/.rels", "word/document.xml",
  "word/styles.xml", "word/_rels/document.xml.rels"]) {
  cek(`part wajib ada: ${p}`, daftar.includes(p));
}

const doc = await zip.file("word/document.xml").async("string");
cek("document.xml diakhiri </w:document>", doc.trim().endsWith("</w:document>"));

// XML well-formed: telusuri seluruh tag, pastikan tiap penutup cocok urutannya
const susun = [];
let rusak = "";
for (const m of doc.matchAll(/<(\/?)([\w:]+)([^>]*?)(\/?)>/g)) {
  const [, tutup, tag, atribut, mandiri] = m;
  if (tag.startsWith("?") || tag.startsWith("!")) continue;
  if (mandiri || atribut.endsWith("/")) continue;
  if (tutup) {
    if (susun.pop() !== tag) { rusak = tag; break; }
  } else susun.push(tag);
}
cek("XML well-formed (semua tag berpasangan & bersarang benar)",
  !rusak && susun.length === 0, rusak ? `tag bermasalah: ${rusak}` : "");
cek("tag terbuka & tertutup seimbang (w:tbl)",
  (doc.match(/<w:tbl>/g) || []).length === (doc.match(/<\/w:tbl>/g) || []).length);
cek("tag terbuka & tertutup seimbang (w:tc)",
  (doc.match(/<w:tc>/g) || []).length === (doc.match(/<\/w:tc>/g) || []).length);
cek("tabel selalu diikuti paragraf (syarat Word)",
  !/<\/w:tbl>\s*(<w:tbl>|<w:sectPr)/.test(doc));
cek("tanpa gambar (dokumen teks murni, mudah diedit)",
  !doc.includes("<w:drawing>") && !daftar.some((p) => p.startsWith("word/media/")));

// Teks dokumen — entitas XML dikembalikan agar "Sewa &amp; jasa" cocok dibandingkan
const unesc = (s) => s
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const teks = unesc(
  [...doc.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("\n"));
cek("judul laporan tercetak", teks.includes("LAPORAN KEUANGAN LOGBOOK"));
cek("bagian A (Belmawa) ada", teks.includes("A. BELANJA DANA BELMAWA"));
cek("bagian B (Perguruan Tinggi) ada", teks.includes("B. BELANJA DANA PERGURUAN TINGGI"));
cek("tabel Belmawa & PT terpisah", (doc.match(/<w:tbl>/g) || []).length >= 3);

// Baris pemisah kategori hanya muncul untuk kategori yang memang ada entrinya
const perKategori = Object.fromEntries(
  Object.keys(LABEL_KATEGORI).map((id) => [id, keuangan.some(
    (e) => e.sumber === "belmawa" && e.kategori === id)]));
for (const [id, ada] of Object.entries(perKategori)) {
  const label = LABEL_KATEGORI[id].toUpperCase();
  cek(`pemisah "${label}" ${ada ? "tercetak" : "tidak dicetak (tak ada entri)"}`,
    teks.includes(label) === ada);
}
if (rekap.totalBelmawa > 0) {
  cek("baris subtotal kategori ada", /Subtotal /i.test(teks));
  cek("baris TOTAL DANA BELMAWA ada", teks.includes("TOTAL DANA BELMAWA"));
}
if (rekap.totalPt > 0) {
  cek("baris TOTAL DANA PERGURUAN TINGGI ada", teks.includes("TOTAL DANA PERGURUAN TINGGI"));
}
cek("rekap per kategori ikut tercetak",
  teks.includes("REKAP PEMAKAIAN DANA BELMAWA PER KATEGORI"));

console.log(gagal ? `\n${gagal} PENGUJIAN GAGAL` : "\nSEMUA PENGUJIAN LULUS");
process.exit(gagal ? 1 : 0);



