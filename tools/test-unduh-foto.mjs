/**
 * Uji normalisasi resolusi unduhan JPG (?dl=1) — fungsi jpgUnduhan:
 * - foto kecil di-upscale ke sisi terpanjang 1280 px (maks 4×), rasio terjaga
 * - foto raksasa diturunkan ke 2000 px (selaras batas kompresi unggahan)

 * - JPEG yang sudah dalam rentang dikirim byte asli (tanpa rekompresi)
 * - PNG dikonversi ke JPEG; EXIF orientation diterapkan; buffer rusak aman
 * - seluruh sampel nyata di uploads/ memenuhi invarian di atas
 * Jalankan: node tools/test-unduh-foto.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { jpgUnduhan } from "../backend/src/files.js";

const UNDUH_MIN = 1280, UNDUH_MAX = 2000, FAKTOR = 4;
const targetSisi = (sisi) =>
  sisi < UNDUH_MIN ? Math.min(UNDUH_MIN, Math.round(sisi * FAKTOR))
  : sisi > UNDUH_MAX ? UNDUH_MAX
  : sisi;

const buatFoto = (w, h, format = "jpeg") =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 120, g: 140, b: 200 } } })
    [format]().toBuffer();

let gagal = 0;
const cek = (nama, kondisi) => {
  console.log(`${kondisi ? "✅" : "❌"} ${nama}`);
  if (!kondisi) gagal += 1;
};

// 1) kecil landscape 422×237 (ukuran khas impor DOCX) → 1280×719
const A = await jpgUnduhan(await buatFoto(422, 237));
const mdA = await sharp(A.buffer).metadata();
cek("422×237 di-upscale ke 1280×719", mdA.width === 1280 && mdA.height === 719);
cek("hasil upscale berformat JPEG", A.jpeg === true && mdA.format === "jpeg");
cek("rasio terjaga (±1 px pembulatan)",
  Math.abs(mdA.width / mdA.height - 422 / 237) < 0.01);

// 2) kecil potret 219×474 → 591×1280
const B = await jpgUnduhan(await buatFoto(219, 474));
const mdB = await sharp(B.buffer).metadata();
cek("219×474 di-upscale ke 591×1280", mdB.width === 591 && mdB.height === 1280);

// 3) sangat kecil 262×196 → dibatasi 4× (1048×784, bukan 1280)
const C = await jpgUnduhan(await buatFoto(262, 196));
const mdC = await sharp(C.buffer).metadata();
cek("262×196 dibatasi 4× → 1048×784", mdC.width === 1048 && mdC.height === 784);

// 4) raksasa 3000×2000 → turun ke 2000×1333
const D = await jpgUnduhan(await buatFoto(3000, 2000));
const mdD = await sharp(D.buffer).metadata();
cek("3000×2000 diturunkan ke 2000×1333", mdD.width === 2000 && mdD.height === 1333);

// 5) JPEG dalam rentang (1400×1000) → byte asli tak disentuh
const asli = await buatFoto(1400, 1000);
const E = await jpgUnduhan(asli);
cek("JPEG 1400×1000 dikirim byte asli (tanpa rekompresi)",
  E.jpeg === true && E.buffer === asli);

// 6) PNG dalam rentang → tetap dikonversi ke JPEG, dimensi tetap
const F = await jpgUnduhan(await buatFoto(1400, 1000, "png"));
const mdF = await sharp(F.buffer).metadata();
cek("PNG 1400×1000 dikonversi ke JPEG", mdF.format === "jpeg");
cek("dimensi PNG dalam rentang tidak berubah", mdF.width === 1400 && mdF.height === 1000);

// 7) EXIF orientation 6 (800×600 → efektif 600×800) → dirotasi & di-upscale 960×1280
const exif = await sharp(await buatFoto(800, 600))
  .withMetadata({ orientation: 6 }).jpeg().toBuffer();
const G = await jpgUnduhan(exif);
const mdG = await sharp(G.buffer).metadata();
cek("EXIF orientasi 6 diterapkan → 960×1280",
  mdG.width === 960 && mdG.height === 1280);
cek("EXIF orientation dibuang dari hasil", (mdG.orientation || 1) === 1);

// 8) buffer bukan gambar → fallback byte asli tanpa lempar error
const rusak = Buffer.from("bukan gambar");
const H = await jpgUnduhan(rusak);
cek("buffer rusak → byte asli, jpeg=false", H.buffer === rusak && H.jpeg === false);

// 9) sampel NYATA di uploads/ — semua memenuhi invarian resolusi & rasio
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS = path.join(__dirname, "..", "uploads");
if (fs.existsSync(UPLOADS)) {
  const files = fs.readdirSync(UPLOADS).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
  let salah = 0;
  for (const f of files) {
    const buf = fs.readFileSync(path.join(UPLOADS, f));
    const md0 = await sharp(buf).metadata();
    let w = md0.width, h = md0.height;
    if (md0.orientation >= 5) [w, h] = [h, w];
    const r = await jpgUnduhan(buf);
    const md1 = await sharp(r.buffer).metadata();
    const sisiHarap = targetSisi(Math.max(w, h));
    const okSisi = Math.max(md1.width, md1.height) === sisiHarap;
    const okRasio = Math.abs(md1.width / md1.height - w / h) < 0.02;
    if (!okSisi || !okRasio || md1.format !== "jpeg") {
      salah++;
      console.log(`   ✗ ${f}: ${w}×${h} → ${md1.width}×${md1.height} (harap sisi ${sisiHarap})`);
    }
  }
  cek(`${files.length} sampel nyata uploads/ memenuhi invarian resolusi & rasio`, salah === 0);
} else {
  console.log("ℹ️ folder uploads/ tidak ada — uji sampel nyata dilewati");
}

console.log(gagal ? `\n${gagal} PENGUJIAN GAGAL` : "\nSEMUA PENGUJIAN LULUS");
process.exit(gagal ? 1 : 0);
