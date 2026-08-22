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

/* ---------------- lebar foto dari grid tabel ---------------- */
function lebarFotoDariGrid(tblXml, fallback) {
  const grid = (tblXml.match(/<w:gridCol[^>]*w:w="(\d+)"/g) || [])
    .map((g) => Number(g.match(/w:w="(\d+)"/)[1]));
  if (grid.length < 2) return fallback;
  const cm = grid[grid.length - 1] / 567 - 0.42;
  if (!(cm >= 1.2 && cm <= 12)) return fallback;
  const landscape = Math.round(cm * 100) / 100;
  return { landscape, potret: Math.round(landscape * 75) / 100 };
}

const FALLBACK = { landscape: 2.6, potret: 2.0 };
// grid 5 kolom, kolom foto terakhir 1985 twips ≈ 3,5 cm → 3,08 cm setelah margin
const tblGrid = `<w:tbl><w:tblGrid><w:gridCol w:w="1520"/><w:gridCol w:w="3260"/>` +
  `<w:gridCol w:w="1100"/><w:gridCol w:w="1100"/><w:gridCol w:w="1985"/></w:tblGrid></w:tbl>`;
const lg = lebarFotoDariGrid(tblGrid, FALLBACK);
cek("lebar landscape dari grid = kolom − margin (3,08 cm)", lg.landscape === 3.08);
cek("lebar potret = 3/4 landscape (2,31 cm)", lg.potret === 2.31);
cek("tinggi potret = lebar landscape (footprint diputar)",
  Math.abs(lg.potret * (4 / 3) - lg.landscape) < 0.01);
cek("grid tak terbaca → fallback",
  lebarFotoDariGrid("<w:tbl></w:tbl>", FALLBACK) === FALLBACK);
cek("kolom terlalu sempit (<1,2 cm) → fallback",
  lebarFotoDariGrid(`<w:tbl><w:tblGrid><w:gridCol w:w="500"/><w:gridCol w:w="600"/></w:tblGrid></w:tbl>`, FALLBACK) === FALLBACK);

/* ---------------- percantik header tabel ---------------- */
const esc = (s) => String(s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const rowsOf = (t) => t.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) || [];
const textOf = (xml) => (xml.match(/<w:t[^>]*>[\s\S]*?<\/w:t>/g) || [])
  .map((x) => x.replace(/<[^>]+>/g, "")).join(" ");
const isHeaderRow = (tr) => {
  const t = textOf(tr).toLowerCase();
  return t.includes("tanggal") && (t.includes("kegiatan") || t.includes("item") || t.includes("harga"));
};
function percantikHeader(tblXml) {
  let xml = tblXml;
  for (const row of rowsOf(tblXml)) {
    if (!isHeaderRow(row)) continue;
    let baru = row.replace(/<w:tc>[\s\S]*?<\/w:tc>/g, (cell) => {
      const teks = textOf(cell).replace(/\s+/g, " ").trim();
      let tcPr = (cell.match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/) || ["<w:tcPr></w:tcPr>"])[0];
      tcPr = tcPr
        .replace(/<w:shd [^>]*\/>/g, "")
        .replace(/<w:vAlign [^>]*\/>/g, "")
        .replace("</w:tcPr>",
          `<w:shd w:val="clear" w:color="auto" w:fill="4F46E5"/>` +
          `<w:vAlign w:val="center"/></w:tcPr>`);
      const p =
        `<w:p><w:pPr><w:spacing w:before="60" w:after="60"/><w:jc w:val="center"/></w:pPr>` +
        `<w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/><w:sz w:val="20"/></w:rPr>` +
        `<w:t xml:space="preserve">${esc(teks)}</w:t></w:r></w:p>`;
      return `<w:tc>${tcPr}${p}</w:tc>`;
    });
    if (!/<w:tblHeader\b/.test(baru)) {
      baru = /<w:trPr>/.test(baru)
        ? baru.replace("<w:trPr>", "<w:trPr><w:tblHeader/><w:cantSplit/>")
        : baru.replace(/<w:tr( [^>]*)?>/, (m) => `${m}<w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>`);
    }
    xml = xml.replace(row, () => baru);
  }
  return xml;
}

const tcU = (t) => `<w:tc><w:tcPr><w:tcW w:w="1000"/><w:shd w:val="clear" w:fill="D9D9D9"/></w:tcPr><w:p><w:r><w:t>${t}</w:t></w:r></w:p></w:tc>`;
const tblHdr = `<w:tbl><w:tr>${tcU("Tanggal")}${tcU("Kegiatan")}${tcU("Foto")}</w:tr>` +
  `<w:tr>${tcU("16 Juni 2026")}${tcU("Rapat")}${tcU("")}</w:tr></w:tbl>`;
const hasilHdr = percantikHeader(tblHdr);
const barisHdr = rowsOf(hasilHdr)[0];
cek("header dapat latar indigo 4F46E5", barisHdr.includes('w:fill="4F46E5"'));
cek("shading abu lama terganti (tidak dobel)", !barisHdr.includes('w:fill="D9D9D9"'));
cek("teks header putih tebal", barisHdr.includes("<w:b/>") && barisHdr.includes('w:val="FFFFFF"'));
cek("teks header rata tengah", barisHdr.includes('<w:jc w:val="center"/>'));
cek("header diulang tiap halaman (tblHeader)", barisHdr.includes("<w:tblHeader/>"));
cek("teks header tetap utuh", textOf(barisHdr).includes("Tanggal") && textOf(barisHdr).includes("Foto"));
cek("baris data TIDAK tersentuh", rowsOf(hasilHdr)[1].includes('w:fill="D9D9D9"'));

console.log(gagal ? `\n${gagal} PENGUJIAN GAGAL` : "\nSEMUA PENGUJIAN LULUS");
process.exit(gagal ? 1 : 0);


