/**
 * Uji perilaku foto pada ekspor DOCX — memakai fungsi ASLI dari kode produksi.
 *
 * Yang dijamin di sini:
 *  - foto TIDAK pernah dipangkas: rasio aslinya utuh (tangkapan layar lebar
 *    tidak kehilangan bagian tepi seperti pada versi lama yang memakai crop);
 *  - foto beresolusi rendah (mis. hasil impor .docx) di-UPSCALE agar tidak
 *    pecah, foto raksasa diturunkan ke batas sematan;
 *  - ukuran tampil di dokumen mengikuti rasio asli, dibatasi TINGGI_MAKS;
 *  - lebar foto mengikuti lebar kolom Foto/Bukti pada template.
 *
 * Jalankan: node tools/test-export-foto.mjs
 */
import sharp from "sharp";
import { siapkanEmbed } from "../backend/src/files.js";
import { ukuranMuat, lebarFotoDariGrid, TINGGI_MAKS } from "../backend/src/export/docx.js";

const EMU_PER_CM = 360000;
const cm = (emu) => emu / EMU_PER_CM;

/** Gambar uji polos berukuran tertentu. */
const buatFoto = (w, h, format = "jpeg") =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 120, g: 140, b: 200 } } })
    [format]().toBuffer();

let gagal = 0;
const cek = (nama, kondisi) => {
  console.log(`${kondisi ? "✅" : "❌"} ${nama}`);
  if (!kondisi) gagal += 1;
};
/** Bandingkan dua pecahan dengan toleransi (pembulatan EMU/piksel). */
const dekat = (a, b, tol = 0.02) => Math.abs(a - b) <= tol;

/* ============ 1. Penyiapan foto: utuh, tanpa dipangkas ============ */

// Tangkapan layar lebar 1920×620 (rasio 3,1:1) — kasus yang dulu terpotong.
const lebarBuf = await buatFoto(1920, 620);
const lebarHasil = await siapkanEmbed(lebarBuf);
const mdLebar = await sharp(lebarHasil.buffer).metadata();
cek("gambar lebar dikenali (ok)", lebarHasil.ok === true);
cek("dimensi asli dilaporkan apa adanya (1920×620)",
  lebarHasil.w === 1920 && lebarHasil.h === 620);
cek("rasio 3,1:1 dipertahankan — TIDAK dipangkas",
  dekat(mdLebar.width / mdLebar.height, 1920 / 620, 0.05));
cek("sisi terpanjang diturunkan ke batas sematan (1000px)", mdLebar.width === 1000);

// Potret 900×1600
const potretHasil = await siapkanEmbed(await buatFoto(900, 1600));
const mdPotret = await sharp(potretHasil.buffer).metadata();
cek("potret: rasio 9:16 tetap utuh",
  dekat(mdPotret.width / mdPotret.height, 900 / 1600, 0.02));
cek("potret: sisi terpanjang 1000px", mdPotret.height === 1000);

// Foto kecil hasil impor .docx (mis. 320×240) → di-upscale
const kecilHasil = await siapkanEmbed(await buatFoto(320, 240));
const mdKecil = await sharp(kecilHasil.buffer).metadata();
cek("foto kecil di-upscale (320px → 1000px, maks 4×)", mdKecil.width === 1000);
cek("foto kecil: rasio 4:3 tetap", dekat(mdKecil.width / mdKecil.height, 4 / 3));
cek("dimensi ASLI foto kecil tetap dilaporkan (320×240)",
  kecilHasil.w === 320 && kecilHasil.h === 240);

// Terlalu kecil untuk 1000px → dibatasi faktor 4×
const mungilHasil = await siapkanEmbed(await buatFoto(200, 150));
const mdMungil = await sharp(mungilHasil.buffer).metadata();
cek("pembesaran dibatasi 4× (200px → 800px, bukan 1000px)", mdMungil.width === 800);

// PNG tetap PNG (relationship/content-type dokumen tidak berubah)
const pngHasil = await siapkanEmbed(await buatFoto(800, 1200, "png"));
const mdPng = await sharp(pngHasil.buffer).metadata();
cek("PNG tetap PNG", mdPng.format === "png");

// Bukan gambar → ditolak dengan aman (buffer asli dikembalikan)
const bukan = await siapkanEmbed(Buffer.from("bukan gambar"));
cek("buffer non-gambar ditolak dengan aman (ok=false)", bukan.ok === false);
cek("buffer non-gambar dikembalikan apa adanya",
  bukan.buffer.toString() === "bukan gambar");

/* ============ 2. Ukuran tampil di dokumen ============ */

const LEBAR = 3.08; // cm — lebar kolom Foto contoh

// Gambar lebar: memenuhi kolom, tingginya kecil mengikuti rasio
const uLebar = ukuranMuat(LEBAR, 1920, 620);
cek("gambar lebar memenuhi lebar kolom (3,08 cm)", dekat(cm(uLebar.cx), LEBAR));
cek("gambar lebar: tinggi mengikuti rasio asli",
  dekat(uLebar.cy / uLebar.cx, 620 / 1920, 0.01));

// Landscape biasa 4:3
const uLand = ukuranMuat(LEBAR, 1600, 1200);
cek("landscape 4:3 memenuhi lebar kolom", dekat(cm(uLand.cx), LEBAR));
cek("landscape 4:3: tinggi = 3/4 lebar", dekat(uLand.cy / uLand.cx, 3 / 4, 0.01));

// Potret 9:16 pada kolom 3,08 cm → tinggi ±5,48 cm, masih di bawah batas
const uPot = ukuranMuat(LEBAR, 900, 1600);
cek("potret biasa memenuhi lebar kolom", dekat(cm(uPot.cx), LEBAR));
cek("potret biasa: tinggi mengikuti rasio (±5,48 cm)", dekat(cm(uPot.cy), 5.48, 0.02));
cek("potret biasa masih di bawah batas tinggi", cm(uPot.cy) <= TINGGI_MAKS);

// Potret tinggi → dibatasi TINGGI_MAKS, lebarnya menyesuaikan (tetap tanpa potong)
const uTinggi = ukuranMuat(LEBAR, 900, 2000);
cek(`potret tinggi dibatasi TINGGI_MAKS (${TINGGI_MAKS} cm)`,
  dekat(cm(uTinggi.cy), TINGGI_MAKS));
cek("potret tinggi: lebar menyusut mengikuti rasio (tidak gepeng)",
  dekat(uTinggi.cx / uTinggi.cy, 900 / 2000, 0.01));
cek("potret tinggi: lebar tetap di dalam kolom", cm(uTinggi.cx) <= LEBAR + 0.01);

// Foto sangat panjang (potret ekstrem) tetap muat
const uPanjang = ukuranMuat(LEBAR, 400, 2000);
cek("potret ekstrem tetap dibatasi tingginya", dekat(cm(uPanjang.cy), TINGGI_MAKS));
cek("potret ekstrem: rasio tetap benar",
  dekat(uPanjang.cx / uPanjang.cy, 400 / 2000, 0.01));

// Dimensi tak terbaca → cadangan aman (tetap menghasilkan ukuran wajar)
const uCadangan = ukuranMuat(LEBAR, 0, 0);
cek("dimensi tak terbaca → ukuran cadangan wajar",
  uCadangan.cx > 0 && uCadangan.cy > 0 && cm(uCadangan.cy) <= TINGGI_MAKS + 0.01);

/* ============ 3. Lebar foto dari grid tabel ============ */

const FALLBACK = 2.6;
// grid 5 kolom, kolom foto terakhir 1985 twips ≈ 3,5 cm → 3,08 cm setelah margin
const tblGrid = `<w:tbl><w:tblGrid><w:gridCol w:w="1520"/><w:gridCol w:w="3260"/>` +
  `<w:gridCol w:w="1100"/><w:gridCol w:w="1100"/><w:gridCol w:w="1985"/></w:tblGrid></w:tbl>`;
cek("lebar foto = lebar kolom − margin (3,08 cm)",
  lebarFotoDariGrid(tblGrid, FALLBACK) === 3.08);
cek("grid tak terbaca → fallback",
  lebarFotoDariGrid("<w:tbl></w:tbl>", FALLBACK) === FALLBACK);
cek("kolom terlalu sempit (<1,2 cm) → fallback",
  lebarFotoDariGrid(
    `<w:tbl><w:tblGrid><w:gridCol w:w="500"/><w:gridCol w:w="600"/></w:tblGrid></w:tbl>`,
    FALLBACK) === FALLBACK);

/* ============ 4. Penjaga ukuran tetap menjaga rasio ============ */
for (const dim of [800, 640]) {
  const r = await siapkanEmbed(lebarHasil.buffer, dim, 80);
  const md = await sharp(r.buffer).metadata();
  cek(`penjaga ${dim}px: rasio gambar lebar tetap utuh (${md.width}×${md.height})`,
    dekat(md.width / md.height, 1920 / 620, 0.05));
}

console.log(gagal ? `\n${gagal} PENGUJIAN GAGAL` : "\nSEMUA PENGUJIAN LULUS");
process.exit(gagal ? 1 : 0);


