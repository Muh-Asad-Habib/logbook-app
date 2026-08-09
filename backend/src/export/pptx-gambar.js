/**
 * Mode "100% identik": susun PPTX dari GAMBAR render Canva (PNG/JPG per
 * halaman — hasil Unduh → PNG → Semua halaman di Canva, biasanya berupa ZIP).
 *
 * Tiap slide berisi SATU gambar halaman penuh — persis piksel render Canva,
 * jadi dijamin sama (font, efek, teks melengkung, semuanya). Trade-off yang
 * disengaja: isi slide tidak bisa diedit sebagai teks, tapi tiap slide tetap
 * bisa diberi ANIMASI PowerPoint (gambar = objek biasa) dan urutannya bebas
 * diatur. Pasangan dari mode "font tertanam" (pptx-canva.js) yang editable.
 */
import JSZip from "jszip";
import sharp from "sharp";

const EMU_PANJANG = 12192000; // sisi terpanjang slide (= 16:9 bawaan PowerPoint)

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

/* ---------- kerangka XML minimal namun valid (master/layout/theme) ---------- */

const XML_THEME = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Polos"><a:themeElements><a:clrScheme name="Polos"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="Polos"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Polos"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;

const xmlMaster = () => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:bg><p:bgPr><a:solidFill><a:schemeClr val="lt1"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>`;

const XML_LAYOUT = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank"><p:cSld name="Kosong"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;

const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

function xmlSlide(nama, cx, cy, off, ext) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:pic><p:nvPicPr><p:cNvPr id="2" name="${esc(nama)}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${off.x}" y="${off.y}"/><a:ext cx="${ext.cx}" cy="${ext.cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

/* ---------- urut alami: "Desain - 2.png" sebelum "Desain - 10.png" ---------- */
export function urutAlami(a, b) {
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

const EKST_GAMBAR = /\.(png|jpe?g|webp)$/i;

/**
 * Ambil daftar gambar dari input: ZIP Canva ([{nama,buffer}]) ATAU daftar
 * berkas gambar langsung. Diurutkan alami sesuai nama (halaman 1, 2, … 10).
 */
export async function kumpulkanGambar(berkas) {
  const hasil = [];
  for (const b of berkas) {
    if (/\.zip$/i.test(b.nama) || (b.buffer[0] === 0x50 && b.buffer[1] === 0x4b && !EKST_GAMBAR.test(b.nama))) {
      const zip = await JSZip.loadAsync(b.buffer).catch(() => null);
      if (!zip) continue;
      const nama = Object.keys(zip.files)
        .filter((f) => !zip.files[f].dir && EKST_GAMBAR.test(f) && !/__MACOSX/.test(f));
      for (const f of nama) {
        hasil.push({ nama: f.split("/").pop(), buffer: await zip.file(f).async("nodebuffer") });
      }
    } else if (EKST_GAMBAR.test(b.nama)) {
      hasil.push(b);
    }
  }
  hasil.sort((x, y) => urutAlami(x.nama, y.nama));
  return hasil;
}

/**
 * Susun PPTX: satu gambar = satu slide penuh (100% identik render Canva).
 * Ukuran slide mengikuti rasio gambar pertama; gambar lain diletakkan
 * fit-tengah. WebP dikonversi ke PNG (PowerPoint tidak paham webp).
 * @param {Array<{nama:string, buffer:Buffer}>} gambar
 * @returns {Promise<{buffer:Buffer, totalSlide:number}>}
 */
export async function buatPptxDariGambar(gambar) {
  if (!gambar.length) {
    throw Object.assign(new Error("Tidak ada gambar PNG/JPG di dalam unggahan"), { status: 400 });
  }

  // Ukuran piksel tiap gambar + normalisasi webp → png
  const info = [];
  for (const g of gambar) {
    let { buffer } = g;
    let meta = await sharp(buffer, { failOn: "none" }).metadata().catch(() => null);
    if (!meta?.width) continue;
    let ekst = /\.jpe?g$/i.test(g.nama) ? "jpeg" : meta.format === "jpeg" ? "jpeg" : "png";
    if (meta.format === "webp") {
      buffer = await sharp(buffer).png().toBuffer();
      ekst = "png";
    }
    info.push({ nama: g.nama, buffer, w: meta.width, h: meta.height, ekst });
  }
  if (!info.length) {
    throw Object.assign(new Error("Gambar tidak bisa dibaca — pastikan PNG/JPG"), { status: 400 });
  }

  const ar = info[0].w / info[0].h;
  const cx = ar >= 1 ? EMU_PANJANG : Math.round(EMU_PANJANG * ar);
  const cy = ar >= 1 ? Math.round(EMU_PANJANG / ar) : EMU_PANJANG;

  const zip = new JSZip();
  const n = info.length;

  /* Content types */
  let ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Default Extension="png" ContentType="image/png"/>` +
    `<Default Extension="jpeg" ContentType="image/jpeg"/>` +
    `<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>` +
    `<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>` +
    `<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>` +
    `<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>`;
  for (let i = 1; i <= n; i++) {
    ct += `<Override PartName="/ppt/slides/slide${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`;
  }
  zip.file("[Content_Types].xml", ct + `</Types>`);

  zip.file("_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="${REL}/officeDocument" Target="ppt/presentation.xml"/>` +
    `</Relationships>`);

  /* presentation.xml + rels */
  let sldIdLst = "";
  let presRels =
    `<Relationship Id="rId1" Type="${REL}/slideMaster" Target="slideMasters/slideMaster1.xml"/>`;
  for (let i = 1; i <= n; i++) {
    sldIdLst += `<p:sldId id="${255 + i}" r:id="rId${1 + i}"/>`;
    presRels += `<Relationship Id="rId${1 + i}" Type="${REL}/slide" Target="slides/slide${i}.xml"/>`;
  }
  zip.file("ppt/presentation.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ` +
    `xmlns:r="${REL}" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">` +
    `<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>` +
    `<p:sldIdLst>${sldIdLst}</p:sldIdLst>` +
    `<p:sldSz cx="${cx}" cy="${cy}"/><p:notesSz cx="6858000" cy="9144000"/>` +
    `</p:presentation>`);
  zip.file("ppt/_rels/presentation.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${presRels}</Relationships>`);

  /* master + layout + theme */
  zip.file("ppt/slideMasters/slideMaster1.xml", xmlMaster());
  zip.file("ppt/slideMasters/_rels/slideMaster1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="${REL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>` +
    `<Relationship Id="rId2" Type="${REL}/theme" Target="../theme/theme1.xml"/>` +
    `</Relationships>`);
  zip.file("ppt/slideLayouts/slideLayout1.xml", XML_LAYOUT);
  zip.file("ppt/slideLayouts/_rels/slideLayout1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="${REL}/slideMaster" Target="../slideMasters/slideMaster1.xml"/>` +
    `</Relationships>`);
  zip.file("ppt/theme/theme1.xml", XML_THEME);

  /* slides + media */
  info.forEach((g, idx) => {
    const i = idx + 1;
    // fit-tengah: gambar dengan rasio beda tidak digepengkan
    const skala = Math.min(cx / g.w, cy / g.h);
    const ext = { cx: Math.round(g.w * skala), cy: Math.round(g.h * skala) };
    const off = { x: Math.round((cx - ext.cx) / 2), y: Math.round((cy - ext.cy) / 2) };
    const media = `image${i}.${g.ekst === "jpeg" ? "jpeg" : "png"}`;
    zip.file(`ppt/media/${media}`, g.buffer);
    zip.file(`ppt/slides/slide${i}.xml`, xmlSlide(g.nama, cx, cy, off, ext));
    zip.file(`ppt/slides/_rels/slide${i}.xml.rels`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="${REL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>` +
      `<Relationship Id="rId2" Type="${REL}/image" Target="../media/${media}"/>` +
      `</Relationships>`);
  });

  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  return { buffer, totalSlide: n };
}

