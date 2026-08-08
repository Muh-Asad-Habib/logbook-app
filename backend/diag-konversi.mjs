/**
 * Diagnosa fitur Konversi Canva → PPTX (font tertanam).
 *
 * Menguji modul inti TANPA server: membuat PPTX mini di memori dengan font
 * Google ("Poppins") + font premium palsu, menjalankan pipeline, lalu
 * memeriksa hasil penanaman. Butuh internet (mengunduh font dari Google).
 *
 * Jalankan:  node diag-konversi.mjs   (atau: npm run diag:konversi)
 */
import JSZip from "jszip";
import { prosesPptxCanva } from "./src/export/pptx-canva.js";

let lulus = 0, gagal = 0;
const cek = (nama, kondisi, info = "") => {
  if (kondisi) { lulus++; console.log(`  ✔ ${nama}`); }
  else { gagal++; console.log(`  ✘ ${nama}${info ? ` — ${info}` : ""}`); }
};

/** PPTX minimal yang sah: 1 slide, teks memakai Poppins + font palsu. */
async function pptxUji() {
  const zip = new JSZip();
  zip.file("[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>` +
    `<Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>` +
    `</Types>`);
  zip.file("_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>` +
    `</Relationships>`);
  zip.file("ppt/presentation.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ` +
    `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    `<p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst>` +
    `<p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/>` +
    `</p:presentation>`);
  zip.file("ppt/_rels/presentation.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>` +
    `</Relationships>`);
  zip.file("ppt/slides/slide1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" ` +
    `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    `<p:cSld><p:spTree>` +
    `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>` +
    `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Judul"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/>` +
    `<p:txBody><a:bodyPr/><a:p><a:r><a:rPr lang="id"><a:latin typeface="Poppins"/></a:rPr>` +
    `<a:t>Halo</a:t></a:r></a:p></p:txBody></p:sp>` +
    `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Sub"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/>` +
    `<p:txBody><a:bodyPr/><a:p><a:r><a:rPr lang="id"><a:latin typeface="FontPremiumPalsu"/></a:rPr>` +
    `<a:t>Dunia</a:t></a:r></a:p></p:txBody></p:sp>` +
    `<p:sp><p:nvSpPr><p:cNvPr id="4" name="Sistem"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/>` +
    `<p:txBody><a:bodyPr/><a:p><a:r><a:rPr lang="id"><a:latin typeface="Arial"/></a:rPr>` +
    `<a:t>Arial</a:t></a:r></a:p></p:txBody></p:sp>` +
    `</p:spTree></p:cSld></p:sld>`);
  return zip.generateAsync({ type: "nodebuffer" });
}

try {
  console.log("== Konversi Canva → PPTX (font tertanam) ==");
  const masuk = await pptxUji();
  const { buffer, laporan } = await prosesPptxCanva(masuk);

  cek("hasil adalah arsip ZIP (PK)", buffer[0] === 0x50 && buffer[1] === 0x4b,
    `${buffer.length} B`);
  cek("laporan memuat 1 slide", laporan.totalSlide === 1, JSON.stringify(laporan));

  const f = Object.fromEntries(laporan.fonts.map((x) => [x.nama, x.status]));
  cek("Poppins → tertanam (unduhan Google Fonts, butuh internet)",
    f.Poppins === "tertanam", JSON.stringify(f));
  cek("Arial → sistem", f.Arial === "sistem");
  cek("FontPremiumPalsu → manual + tautan pencarian",
    f.FontPremiumPalsu === "manual" &&
    laporan.fonts.find((x) => x.nama === "FontPremiumPalsu").url.includes("fonts.google.com"));

  const zip = await JSZip.loadAsync(buffer);
  const pres = await zip.file("ppt/presentation.xml").async("string");
  cek("presentation.xml punya embedTrueTypeFonts=1", /embedTrueTypeFonts="1"/.test(pres));
  cek("embeddedFontLst berisi Poppins",
    /<p:embeddedFontLst>.*typeface="Poppins".*<\/p:embeddedFontLst>/s.test(pres));
  cek("embeddedFontLst di posisi sah (setelah notesSz)",
    /<p:notesSz[^>]*\/><p:embeddedFontLst>/.test(pres));

  const fntdata = Object.keys(zip.files).filter((n) => n.endsWith(".fntdata"));
  cek("ada berkas fntdata tertanam", fntdata.length >= 1, fntdata.join(", "));
  const ct = await zip.file("[Content_Types].xml").async("string");
  cek("[Content_Types] mendaftarkan fntdata", /Extension="fntdata"/.test(ct));
  const rels = await zip.file("ppt/_rels/presentation.xml.rels").async("string");
  cek("relationship font terdaftar", /relationships\/font/.test(rels));

  // Idempoten: memproses ulang hasil tidak menggandakan font
  const ulang = await prosesPptxCanva(buffer);
  cek("proses ulang mendeteksi font sudah tertanam", ulang.laporan.sudahTertanam === true);

  const bukanPptx = await prosesPptxCanva(Buffer.from("bukan pptx")).catch((e) => e);
  cek("buffer non-PPTX ditolak dengan pesan jelas",
    bukanPptx instanceof Error, bukanPptx.message || "");

  console.log(`\n== HASIL: ${lulus} lulus, ${gagal} gagal ==`);
  process.exit(gagal ? 1 : 0);
} catch (e) {
  console.error("ERROR:", e);
  process.exit(1);
}

