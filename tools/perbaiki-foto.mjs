/**
 * PERBAIKI FOTO TERSIMPAN — upscale permanen foto beresolusi rendah.
 *
 * Latar belakang: foto yang masuk lewat IMPOR .docx tersimpan seadanya —
 * Word menyimpan gambar tabel dalam ukuran tampil (sering hanya ±220–420 px).
 * Akibatnya foto tampak pecah saat dibuka besar di web (Lightbox) maupun saat
 * disematkan kembali ke dokumen ekspor.
 *
 * Skrip ini memindai SELURUH foto yang dirujuk entri kegiatan & keuangan,
 * lalu untuk foto yang sisi terpanjangnya di bawah TARGET_SISI:
 *   - memperbesarnya dengan lanczos3 (maks FAKTOR_MAX×) + sharpen ringan,
 *   - menyimpannya sebagai JPEG mutu tinggi (mozjpeg),
 *   - MENIMPA berkas lama di tempat (kunci tidak berubah).
 * Karena kuncinya tetap, seluruh entri yang menunjuk foto itu langsung ikut
 * membaik — tidak ada perubahan database sama sekali.
 *
 * Pakai:
 *   node tools/perbaiki-foto.mjs --coba     # pratinjau, tidak mengubah apa pun
 *   node tools/perbaiki-foto.mjs            # jalankan sungguhan (menimpa berkas)
 *
 * Catatan: jalankan dengan env ImageKit/Neon yang sama seperti produksi
 * (mis. lewat logbook-app/.env) supaya yang diperbaiki adalah berkas produksi.
 */
import sharp from "sharp";
import { q } from "../backend/src/db.js";
import { getFileBuffer, timpaFile, pakaiCloud } from "../backend/src/files.js";

const COBA = process.argv.includes("--coba");

const TARGET_SISI = 1280; // sisi terpanjang yang dituju
const FAKTOR_MAX = 4;     // pembesaran maksimal agar tidak jadi "bubur"
const MUTU = 88;          // mutu JPEG hasil upscale
const PARALEL = 4;        // berkas diproses serentak (ramah kuota API)

const fmt = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.ceil(b / 1024)} KB`);

/** Ubah nilai kolom jsonb/array/teks menjadi larik kunci. */
function larik(v) {
  if (Array.isArray(v)) return v;
  if (!v) return [];
  try {
    const p = JSON.parse(v);
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

/** Kumpulkan seluruh kunci foto yang dipakai entri (tanpa duplikat). */
async function kumpulkanKunci() {
  const set = new Set();
  for (const r of await q("SELECT foto_keys FROM kegiatan")) {
    for (const k of larik(r.foto_keys)) if (k) set.add(k);
  }
  for (const r of await q("SELECT bukti_key, bukti_keys FROM keuangan")) {
    for (const k of larik(r.bukti_keys)) if (k) set.add(k);
    if (r.bukti_key) set.add(r.bukti_key);
  }
  return [...set];
}

/**
 * Periksa satu foto; upscale & timpa bila resolusinya di bawah target.
 * @returns {"naik"|"cukup"|"lewat"|"gagal"}
 */
async function perbaiki(key) {
  const asli = await getFileBuffer(key);
  if (!asli) {
    console.log(`  [x] ${key} - berkas tidak ditemukan`);
    return "gagal";
  }
  // GIF (bisa animasi) tidak disentuh agar animasinya tidak rusak.
  if (/\.gif$/i.test(key)) return "lewat";

  let md;
  try {
    md = await sharp(asli, { failOn: "none" }).metadata();
  } catch {
    console.log(`  [x] ${key} - gambar tidak terbaca`);
    return "gagal";
  }
  let w = md.width, h = md.height;
  if (!w || !h) return "gagal";
  if (md.orientation >= 5) [w, h] = [h, w]; // EXIF rotasi 90°

  const sisi = Math.max(w, h);
  if (sisi >= TARGET_SISI) return "cukup";

  const target = Math.min(TARGET_SISI, Math.round(sisi * FAKTOR_MAX));
  const skala = (target / sisi).toFixed(2);

  if (COBA) {
    console.log(`  [akan] ${key} - ${w}x${h} (${fmt(asli.length)}) -> ${skala}x ke ${target}px`);
    return "naik";
  }

  const baru = await sharp(asli, { failOn: "none" })
    .rotate()
    .resize(target, target, {
      fit: "inside",             // TANPA crop — gambar tetap utuh
      withoutEnlargement: false, // izinkan pembesaran (inti skrip ini)
      kernel: "lanczos3",
    })
    .sharpen()                   // pertegas hasil upscale
    .jpeg({ quality: MUTU, progressive: true, mozjpeg: true, chromaSubsampling: "4:4:4" })
    .toBuffer();

  await timpaFile(key, baru);
  console.log(`  [ok] ${key} - ${w}x${h} -> ${target}px (${fmt(asli.length)} -> ${fmt(baru.length)})`);
  return "naik";
}

/* ---------------- jalan ---------------- */

console.log(COBA ? "MODE COBA — tidak ada berkas yang diubah\n" : "MODE SUNGGUHAN — berkas akan ditimpa\n");
console.log(`Penyimpanan: ${pakaiCloud() ? "ImageKit (cloud)" : "lokal (uploads/)"}`);

const kunci = await kumpulkanKunci();
console.log(`Foto terdaftar: ${kunci.length}\n`);

const hitung = { naik: 0, cukup: 0, lewat: 0, gagal: 0 };
const antrean = [...kunci];
let diproses = 0;

await Promise.all(
  Array.from({ length: Math.min(PARALEL, antrean.length) }, async () => {
    for (;;) {
      const key = antrean.shift();
      if (!key) return;
      try {
        hitung[await perbaiki(key)] += 1;
      } catch (e) {
        hitung.gagal += 1;
        console.log(`  [x] ${key} - ${e.message}`);
      }
      diproses += 1;
      if (diproses % 25 === 0) console.log(`  ... ${diproses}/${kunci.length}`);
    }
  })
);

console.log("\nSelesai.");
console.log(`  di-upscale     : ${hitung.naik}`);
console.log(`  sudah cukup    : ${hitung.cukup}`);
console.log(`  dilewati (gif) : ${hitung.lewat}`);
console.log(`  gagal          : ${hitung.gagal}`);
if (COBA && hitung.naik) {
  console.log("\nJalankan tanpa --coba untuk menerapkan perubahan.");
}
process.exit(0);

