/**
 * Uji ekspor DOCX KHUSUS KEUANGAN memakai data NYATA di database.
 *
 * Memeriksa: paket .docx valid (zip + part wajib), tabel Belmawa dipisah
 * per kategori dengan baris pemisah & subtotal, tabel Perguruan Tinggi
 * terpisah, serta NOTA/bukti ikut disematkan (thumbnail di kolom Nota +
 * lampiran bernomor L-1, L-2, …) dengan tiap berkas gambar hanya disimpan
 * sekali di dalam paket.
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

// Teks dokumen — entitas XML dikembalikan agar "Sewa &amp; jasa" cocok dibandingkan
const unesc = (s) => s
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const teks = unesc(
  [...doc.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("\n"));

/* ---------- nota / bukti pembayaran ---------- */
const buktiKeys = (e) =>
  e.bukti_keys?.length ? e.bukti_keys : e.bukti_key ? [e.bukti_key] : [];
const keysUnik = [...new Set(keuangan.flatMap(buktiKeys))];
const entriBernota = keuangan.filter((e) => buktiKeys(e).length).length;
const media = daftar.filter((p) => p.startsWith("word/media/") && !zip.files[p].dir);
const drawing = (doc.match(/<w:drawing>/g) || []).length;

if (keysUnik.length) {
  cek("berkas nota tersimpan di word/media/", media.length > 0,
    `${media.length} berkas untuk ${keysUnik.length} nota`);
  cek("nota tidak digandakan (≤ jumlah nota unik)", media.length <= keysUnik.length);
  cek("gambar tersemat di dokumen", drawing > 0, `${drawing} gambar`);
  cek("thumbnail tabel + lampiran memakai berkas yang sama",
    drawing > media.length);
  cek("kolom Nota ada di tabel", teks.includes("Nota"));
  cek("bagian lampiran tercetak", teks.includes("LAMPIRAN — NOTA & BUKTI PEMBAYARAN"));
  cek("penomoran lampiran L-1 ada", /\bL-1\b/.test(teks));
  cek("jumlah lampiran = entri yang punya bukti",
    (teks.match(/\bL-\d+ · /g) || []).length === entriBernota,
    `${(teks.match(/\bL-\d+ · /g) || []).length} dari ${entriBernota}`);

  // relationship & content-type gambar harus lengkap, kalau tidak Word menolak
  const rels = await zip.file("word/_rels/document.xml.rels").async("string");
  const ctypes = await zip.file("[Content_Types].xml").async("string");
  const ridDoc = [...new Set([...doc.matchAll(/r:embed="(rId\d+)"/g)].map((m) => m[1]))];
  cek("setiap gambar punya relationship",
    ridDoc.every((r) => rels.includes(`Id="${r}"`)), `${ridDoc.length} rId`);
  cek("relationship menunjuk berkas media yang ada",
    [...rels.matchAll(/Target="(media\/[^"]+)"/g)]
      .every((m) => daftar.includes(`word/${m[1]}`)));
  cek("content-type gambar terdaftar",
    /Extension="(jpeg|png)"/.test(ctypes));
  cek("id docPr unik (syarat Word agar dokumen tidak 'perlu diperbaiki')",
    (() => {
      const ids = [...doc.matchAll(/<wp:docPr id="(\d+)"/g)].map((m) => m[1]);
      return new Set(ids).size === ids.length;
    })());
} else {
  cek("tanpa bukti → dokumen tetap dibuat tanpa gambar", media.length === 0);
}

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



