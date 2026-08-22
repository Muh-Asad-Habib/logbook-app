/**
 * Uji cepat keseragaman foto ekspor DOCX (tanpa database):
 * - foto landscape → dipangkas 620×465 (4:3), potret → 465×620 (3:4)
 * - ukuran tampil EMU seragam per orientasi (kegiatan & keuangan)
 * - format PNG dipertahankan; buffer non-gambar ditolak dengan aman
 * Jalankan: node tools/test-export-foto.mjs
 */
import sharp from "sharp";

const RASIO_FOTO = 4 / 3;
const LEBAR_FOTO = {
  kegiatan: { landscape: 2.6, potret: 2.0 },
  keuangan: { landscape: 2.2, potret: 1.7 },
};
const cmKeEmu = (cm) => Math.round(cm * 360000);
function ukuranSeragam(lebar, potret) {
  const cx = cmKeEmu(potret ? lebar.potret : lebar.landscape);
  const cy = Math.round(cx * (potret ? RASIO_FOTO : 1 / RASIO_FOTO));
  return { cx, cy };
}
async function cropSeragam(buf) {
  const isJpeg = buf?.[0] === 0xff && buf[1] === 0xd8;
  const isPng = buf?.[0] === 0x89 && buf[1] === 0x50;
  if (!isJpeg && !isPng) return null;
  try {
    const md = await sharp(buf).metadata();
    let w = md.width, h = md.height;
    if (!w || !h) return null;
    if (md.orientation >= 5) [w, h] = [h, w];
    const potret = h > w;
    const [tw, th] = potret ? [465, 620] : [620, 465];
    let s = sharp(buf, { failOn: "none" }).rotate()
      .resize(tw, th, { fit: "cover", position: "centre" });
    s = isPng
      ? s.png({ compressionLevel: 9 })
      : s.jpeg({ quality: 68, progressive: true, mozjpeg: true });
    return { buf: await s.toBuffer(), potret };
  } catch {
    return null;
  }
}

const buatFoto = (w, h, format = "jpeg") =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 120, g: 140, b: 200 } } })
    [format]().toBuffer();

let gagal = 0;
const cek = (nama, kondisi) => {
  console.log(`${kondisi ? "✅" : "❌"} ${nama}`);
  if (!kondisi) gagal += 1;
};

// landscape 1600×900 → 620×465
const L = await cropSeragam(await buatFoto(1600, 900));
const mdL = await sharp(L.buf).metadata();
cek("landscape terdeteksi (potret=false)", L.potret === false);
cek("landscape dipangkas ke 620×465 (4:3)", mdL.width === 620 && mdL.height === 465);
cek("landscape tetap JPEG", mdL.format === "jpeg");

// potret 900×1600 → 465×620
const Pt = await cropSeragam(await buatFoto(900, 1600));
const mdP = await sharp(Pt.buf).metadata();
cek("potret terdeteksi (potret=true)", Pt.potret === true);
cek("potret dipangkas ke 465×620 (3:4)", mdP.width === 465 && mdP.height === 620);

// persegi (1000×1000) → dianggap landscape
const Sq = await cropSeragam(await buatFoto(1000, 1000));
cek("persegi dianggap landscape", Sq.potret === false);

// PNG dipertahankan sebagai PNG
const Png = await cropSeragam(await buatFoto(800, 1200, "png"));
const mdPng = await sharp(Png.buf).metadata();
cek("PNG tetap PNG setelah dipangkas", mdPng.format === "png");
cek("PNG potret 465×620", mdPng.width === 465 && mdPng.height === 620);

// buffer bukan gambar → null (fallback aman)
cek("buffer non-gambar ditolak (null)", (await cropSeragam(Buffer.from("bukan gambar"))) === null);

// ukuran tampil EMU seragam
const kegL = ukuranSeragam(LEBAR_FOTO.kegiatan, false);
const kegP = ukuranSeragam(LEBAR_FOTO.kegiatan, true);
cek("kegiatan landscape 2,6×1,95 cm", kegL.cx === 936000 && kegL.cy === 702000);
cek("kegiatan potret 2,0×2,67 cm", kegP.cx === 720000 && kegP.cy === 960000);
const keuL = ukuranSeragam(LEBAR_FOTO.keuangan, false);
const keuP = ukuranSeragam(LEBAR_FOTO.keuangan, true);
cek("keuangan landscape 2,2×1,65 cm", keuL.cx === 792000 && keuL.cy === 594000);
cek("keuangan potret 1,7×2,27 cm", keuP.cx === 612000 && keuP.cy === 816000);
cek("rasio EMU landscape persis 4:3", kegL.cx / kegL.cy === RASIO_FOTO);
cek("rasio EMU potret persis 3:4", kegP.cy / kegP.cx === RASIO_FOTO);

// simulasi penjaga budget: fit-inside 480/360/260 harus mempertahankan rasio EKSAK
for (const dim of [480, 360, 260]) {
  const kecil = await sharp(Pt.buf)
    .resize(dim, dim, { fit: "inside", withoutEnlargement: true }).jpeg().toBuffer();
  const md = await sharp(kecil).metadata();
  cek(`budget ${dim}px: rasio potret tetap eksak 3:4 (${md.width}×${md.height})`,
    md.width * 4 === md.height * 3);
}

console.log(gagal ? `\n${gagal} PENGUJIAN GAGAL` : "\nSEMUA PENGUJIAN LULUS");
process.exit(gagal ? 1 : 0);


