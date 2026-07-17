/**
 * Diagnosa ISI file laporan kemajuan asli milik user tertentu (produksi):
 * - temukan baris di laporan_docx (cari berdasar nama file)
 * - ambil buffer asli (lewat store.getLaporan → ImageKit/legacy base64)
 * - validasi ZIP + parse dengan JSZip, cek relationships & media
 * - deteksi elemen yang sering bikin Office Online/renderer gagal
 *   (text-frame/txbxContent, VML v:shape, OLEObject, gambar hilang)
 * - uji jalur publik end-to-end lewat URL produksi asli
 * Jalankan: node backend/diag-laporan-isi.mjs "kata kunci nama file"
 */
import { q } from "./src/db.js";
import * as store from "./src/storage.js";
import JSZip from "jszip";

const KATA_KUNCI = process.argv[2] || "PKM-KC";

const rows = await q(
  `SELECT l.user_id, l.nama, l.ukuran, l.updated_at, l.file_key, u.username
     FROM laporan_docx l JOIN users u ON u.id = l.user_id
    WHERE l.nama ILIKE $1 OR u.username ILIKE $1
    ORDER BY l.updated_at DESC`,
  [`%${KATA_KUNCI}%`]
);

console.log(`Ditemukan ${rows.length} baris cocok "${KATA_KUNCI}":`);
for (const r of rows) {
  console.log(`  - user=${r.username} (${r.user_id}) nama="${r.nama}" ukuran=${r.ukuran} file_key=${r.file_key || "(kosong/legacy)"} updated=${r.updated_at}`);
}
if (!rows.length) {
  console.log("Tidak ada baris cocok. Coba jalankan tanpa argumen untuk lihat semua:");
  const semua = await q(
    `SELECT l.user_id, l.nama, l.ukuran, u.username FROM laporan_docx l JOIN users u ON u.id = l.user_id`
  );
  semua.forEach((r) => console.log(`  * ${r.username}: ${r.nama} (${r.ukuran}B)`));
  process.exit(1);
}

const row = rows[0];
console.log(`\n=== Menganalisis laporan milik "${row.username}" ===`);

const lap = await store.getLaporan(row.user_id);
if (!lap) {
  console.log("❌ store.getLaporan() mengembalikan null — file tidak terbaca!");
  process.exit(1);
}
const buf = lap.buffer;
console.log(`✅ Buffer diambil: ${buf.length} bytes (DB mencatat ukuran=${row.ukuran})`);
console.log(`   Cocok dengan ukuran tercatat? ${buf.length === Number(row.ukuran) ? "YA" : "TIDAK <-- mencurigakan!"}`);
console.log(`   Header ZIP "PK"? ${buf[0] === 0x50 && buf[1] === 0x4b ? "YA" : "TIDAK <-- FILE RUSAK!"}`);

let zip;
try {
  zip = await JSZip.loadAsync(buf);
  console.log("✅ JSZip berhasil membuka arsip (ZIP valid)");
} catch (e) {
  console.log(`❌ JSZip GAGAL membuka arsip: ${e.message}`);
  process.exit(1);
}

const nama = Object.keys(zip.files).sort();
console.log(`\nIsi arsip (${nama.length} entri):`);
nama.forEach((n) => console.log(`   ${n}`));

// --- cek relationships vs media yang benar-benar ada ---
async function cekRels(relPath, label) {
  const f = zip.file(relPath);
  if (!f) return;
  const xml = await f.async("string");
  const targets = [...xml.matchAll(/Target="([^"]+)"/g)].map((m) => m[1]);
  console.log(`\n${label}: ${targets.length} relationship`);
  for (const t of targets) {
    if (t.startsWith("http")) {
      console.log(`   ℹ️  Relationship eksternal (URL): ${t}`);
      continue;
    }
    // Target relatif terhadap folder "word/" (pemilik rels ini) — "../x" naik ke root arsip.
    const norm = t.startsWith("../") ? t.replace(/^\.\.\//, "") : `word/${t.replace(/^\/+/, "")}`;
    const ada = !!zip.file(norm);
    if (!ada) console.log(`   ⚠️  Target hilang: ${t} (dicari sbg ${norm})`);
  }
}
await cekRels("word/_rels/document.xml.rels", "document.xml.rels");
await cekRels("word/_rels/header1.xml.rels", "header1.xml.rels");
await cekRels("word/_rels/header2.xml.rels", "header2.xml.rels");
await cekRels("word/_rels/header3.xml.rels", "header3.xml.rels");

// --- cek elemen yang sering bikin renderer web gagal ---
async function cekPola(fileName) {
  const f = zip.file(fileName);
  if (!f) return null;
  const xml = await f.async("string");
  const pola = {
    "text-frame (w:txbxContent)": /w:txbxContent/g,
    "VML shape (v:shape)": /<v:shape[ >]/g,
    "VML imagedata (v:imagedata)": /v:imagedata/g,
    "OLE object": /OLEObject|w:object/g,
    "gambar mengambang (wp:anchor)": /wp:anchor/g,
    "gambar sebaris (wp:inline)": /wp:inline/g,
    "content control (sdt)": /w:sdt[ >]/g,
    "AlternateContent (mc:)": /mc:AlternateContent/g,
    "field kompleks (TOC/PAGE)": /fldSimple|instrText/g,
  };
  const hasil = {};
  for (const [label, re] of Object.entries(pola)) {
    const n = (xml.match(re) || []).length;
    if (n > 0) hasil[label] = n;
  }
  return hasil;
}

for (const target of ["word/document.xml", "word/header1.xml", "word/header2.xml", "word/header3.xml"]) {
  if (!zip.file(target)) continue;
  const hasil = await cekPola(target);
  console.log(`\nPola di ${target}:`);
  if (!hasil || !Object.keys(hasil).length) console.log("   (tidak ada pola mencurigakan)");
  else for (const [k, v] of Object.entries(hasil)) console.log(`   - ${k}: ${v}x`);
}

// --- cek app.xml utk jumlah halaman tercatat ---
const appXml = zip.file("docProps/app.xml");
if (appXml) {
  const xml = await appXml.async("string");
  const pages = xml.match(/<Pages>(\d+)<\/Pages>/);
  const words = xml.match(/<Words>(\d+)<\/Words>/);
  console.log(`\ndocProps/app.xml → Pages=${pages?.[1]} Words=${words?.[1]}`);
}

// --- uji jalur publik end-to-end via URL produksi asli ---
console.log("\n=== Uji jalur publik (seperti dipakai Office Online) ===");
const crypto = await import("node:crypto");
const kunci = crypto.randomBytes(24).toString("hex");
const exp = Date.now() + 5 * 60 * 1000;
await q("DELETE FROM laporan_links WHERE kunci = $1", [kunci]);
await q("INSERT INTO laporan_links (kunci, user_id, exp) VALUES ($1, $2, $3)", [kunci, row.user_id, exp]);

const PROD = "https://URL-KAMU.vercel.app";
const url = `${PROD}/api/laporan/publik/${kunci}`;
console.log(`URL uji: ${url}`);
try {
  const head = await fetch(url, { method: "HEAD" });
  console.log(`HEAD → status=${head.status} content-type=${head.headers.get("content-type")} content-length=${head.headers.get("content-length")} accept-ranges=${head.headers.get("accept-ranges")}`);
  const get = await fetch(url);
  const remoteBuf = Buffer.from(await get.arrayBuffer());
  console.log(`GET  → status=${get.status} bytes=${remoteBuf.length} cocok dgn buffer asli? ${remoteBuf.equals(buf) ? "YA" : "TIDAK <-- beda!"}`);
} catch (e) {
  console.log(`❌ Gagal fetch URL produksi: ${e.message}`);
} finally {
  await q("DELETE FROM laporan_links WHERE kunci = $1", [kunci]);
}

process.exit(0);

