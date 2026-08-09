/**
 * Konversi PPTX ekspor Canva → PPTX "sama persis" & tetap bisa diedit.
 *
 * Masalah: PPTX hasil unduhan Canva tampil BEDA di PowerPoint karena font
 * Canva tidak ter-install di komputer pengguna (PowerPoint mengganti diam-diam
 * dengan font lain → tata letak bergeser).
 *
 * Solusi di modul ini:
 *  1. Pindai SEMUA nama font yang dipakai file (slide/master/layout/theme).
 *  2. Unduh berkas TTF-nya langsung dari Google Fonts (mayoritas font Canva
 *     adalah font Google) — tanpa API key: permintaan CSS tanpa User-Agent
 *     dibalas Google dengan URL format TrueType.
 *  3. TANAM font ke dalam PPTX (embeddedFontLst + bagian fntdata) sehingga
 *     tampil identik di komputer mana pun TANPA install font manual.
 *  4. Susun laporan: font tertanam / perlu diunduh manual, plus slide yang
 *     memuat gambar rasterisasi Canva (teks melengkung/efek khusus — tetap
 *     bisa digeser tapi tidak bisa diketik ulang; batasan dari Canva).
 *
 * Semua elemen, teks, dan grup TIDAK disentuh — tetap editable & terkelompok
 * persis seperti hasil ekspor Canva.
 */
import JSZip from "jszip";

/** Font bawaan Windows/Office — sudah pasti ada, tidak perlu ditanam. */
const FONT_SISTEM = new Set([
  "arial", "arial black", "calibri", "calibri light", "cambria", "cambria math",
  "candara", "comic sans ms", "consolas", "constantia", "corbel", "courier new",
  "ebrima", "franklin gothic", "gabriola", "gadugi", "georgia", "impact",
  "lucida console", "lucida sans unicode", "malgun gothic", "marlett",
  "microsoft sans serif", "mingliu", "ms gothic", "mv boli", "myanmar text",
  "palatino linotype", "segoe print", "segoe script", "segoe ui",
  "segoe ui light", "segoe ui semibold", "segoe ui symbol", "simsun",
  "sitka", "sylfaen", "symbol", "tahoma", "times new roman", "trebuchet ms",
  "verdana", "webdings", "wingdings", "yu gothic",
]);

const VARIAN = { regular: "regular", bold: "bold", italic: "italic", boldItalic: "boldItalic" };

/* ================= pemindaian ================= */

/** Kumpulkan semua nama font unik dari seluruh XML di dalam ppt/. */
async function pindaiFont(zip) {
  const nama = new Set();
  const berkas = Object.keys(zip.files).filter(
    (f) => f.startsWith("ppt/") && f.endsWith(".xml")
  );
  for (const f of berkas) {
    const xml = await zip.file(f).async("string");
    for (const m of xml.matchAll(/typeface="([^"]+)"/g)) {
      const t = m[1].trim();
      if (t && !t.startsWith("+")) nama.add(t);
    }
  }
  return [...nama].sort((a, b) => a.localeCompare(b));
}

/** Hitung gambar (p:pic) per slide → indikasi elemen rasterisasi Canva. */
async function pindaiRaster(zip) {
  const slides = Object.keys(zip.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => Number(a.match(/\d+/)) - Number(b.match(/\d+/)));
  const hasil = [];
  for (const f of slides) {
    const xml = await zip.file(f).async("string");
    const gambar = (xml.match(/<p:pic[ >]/g) || []).length;
    hasil.push({ slide: Number(f.match(/slide(\d+)\.xml/)[1]), gambar });
  }
  return hasil;
}

/* ================= Google Fonts ================= */

const TIMEOUT_MS = 15000;

async function ambil(url, opsi = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...opsi, signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Sufiks bobot pada nama font ekspor Canva ("Poppins SemiBold", "Open Sans
 * Light", …). PowerPoint memperlakukan nama itu sebagai KELUARGA tersendiri,
 * sedangkan Google Fonts mengenalnya sebagai keluarga dasar + bobot — tanpa
 * penguraian ini pencarian selalu gagal dan font tidak tertanam (penyebab
 * utama "hasil jauh dari desain Canva").
 */
const SUFIKS_BERAT = {
  thin: 100, hairline: 100,
  extralight: 200, "extra light": 200, ultralight: 200, "ultra light": 200,
  light: 300,
  regular: 400, normal: 400, book: 400,
  medium: 500,
  semibold: 600, "semi bold": 600, demibold: 600, "demi bold": 600,
  bold: 700,
  extrabold: 800, "extra bold": 800, ultrabold: 800, "ultra bold": 800,
  black: 900, heavy: 900,
};

/** Urai "Poppins SemiBold Italic" → { keluarga:"Poppins", berat:600, italic:true } */
export function uraiNamaFont(nama) {
  const kata = String(nama).trim().split(/\s+/);
  let berat = null;
  let italic = false;
  while (kata.length > 1) {
    const satu = kata[kata.length - 1].toLowerCase();
    const dua = kata.length > 2
      ? `${kata[kata.length - 2].toLowerCase()} ${satu}` : "";
    if (satu === "italic" || satu === "oblique") { italic = true; kata.pop(); continue; }
    if (dua && SUFIKS_BERAT[dua] != null) { berat = SUFIKS_BERAT[dua]; kata.splice(-2); continue; }
    if (SUFIKS_BERAT[satu] != null) { berat = SUFIKS_BERAT[satu]; kata.pop(); continue; }
    break;
  }
  return { keluarga: kata.join(" "), berat: berat ?? 400, italic };
}

/** Cache unduhan per proses konversi: "keluarga|berat|ital" → Buffer|null. */
function buatCacheTtf() {
  const peta = new Map();
  return async function ttf(keluarga, berat, italic) {
    const kunci = `${keluarga.toLowerCase()}|${berat}|${italic ? 1 : 0}`;
    if (peta.has(kunci)) return peta.get(kunci);
    const buf = await unduhSatuVarian(keluarga, berat, italic);
    peta.set(kunci, buf);
    return buf;
  };
}

/**
 * Unduh SATU varian TTF dari Google Fonts. Tanpa header User-Agent → Google
 * membalas URL format TrueType utuh (tanpa pecahan unicode-range). Bobot yang
 * tak tersedia dibalas error → coba bobot terdekat.
 */
async function unduhSatuVarian(keluarga, berat, italic) {
  const fam = keluarga.trim().replace(/ /g, "+");
  const kandidat = [...new Set([
    berat,
    berat - 100, berat + 100,
    berat - 200, berat + 200,
    400, 700,
  ])].filter((w) => w >= 100 && w <= 900);
  for (const w of kandidat) {
    try {
      const url = `https://fonts.googleapis.com/css2?family=${fam}:ital,wght@${italic ? 1 : 0},${w}`;
      const res = await ambil(url, { headers: { Accept: "text/css,*/*" } });
      if (!res.ok) continue;
      const css = await res.text();
      const src = (css.match(/src:\s*url\((https:[^)]+)\)/) || [])[1];
      if (!src) continue;
      const r2 = await ambil(src);
      if (!r2.ok) continue;
      const buf = Buffer.from(await r2.arrayBuffer());
      const valid = buf.length > 4 &&
        ((buf[0] === 0 && buf[1] === 1 && buf[2] === 0 && buf[3] === 0) ||
         buf.toString("ascii", 0, 4) === "OTTO");
      if (valid) return buf;
    } catch { /* coba bobot berikutnya */ }
  }
  return null;
}

/**
 * Kumpulkan varian TTF untuk SATU nama typeface persis seperti di slide.
 * - "Poppins"            → regular 400, bold 700, italic, boldItalic
 * - "Poppins SemiBold"   → regular = Poppins 600 (+bold 800, italic 600i, …)
 * - "Poppins Bold Italic"→ regular = Poppins 700 italic
 * @returns {Promise<{varian:Record<string,Buffer>, keluarga:string, berat:number}|null>}
 */
async function unduhFontGoogle(nama, ttf) {
  const { keluarga, berat, italic } = uraiNamaFont(nama);
  const beratBold = Math.min(berat + (berat >= 700 ? 100 : 300), 900);
  const dasar = await ttf(keluarga, berat, italic);
  if (!dasar) return null;
  const varian = { [VARIAN.regular]: dasar };
  const b = await ttf(keluarga, beratBold, italic);
  if (b && !b.equals(dasar)) varian[VARIAN.bold] = b;
  if (!italic) {
    const i = await ttf(keluarga, berat, true);
    if (i) varian[VARIAN.italic] = i;
    const bi = await ttf(keluarga, beratBold, true);
    if (bi && (!i || !bi.equals(i))) varian[VARIAN.boldItalic] = bi;
  }
  return { varian, keluarga, berat };
}

/* ================= penanaman ke PPTX ================= */

const REL_FONT =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/font";

function escXml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Tanam kumpulan font ke arsip PPTX (mutasi zip di tempat).
 * @param {JSZip} zip
 * @param {Array<{nama:string, varian:Record<string,Buffer>}>} daftar
 */
async function tanamFont(zip, daftar) {
  if (!daftar.length) return;

  // ---- 1. [Content_Types].xml: daftarkan ekstensi fntdata ----
  const ctPath = "[Content_Types].xml";
  let ct = await zip.file(ctPath).async("string");
  if (!/Extension="fntdata"/.test(ct)) {
    ct = ct.replace(
      "</Types>",
      `<Default Extension="fntdata" ContentType="application/x-fontdata"/></Types>`
    );
    zip.file(ctPath, ct);
  }

  // ---- 2. Relationship + berkas fntdata ----
  const relPath = "ppt/_rels/presentation.xml.rels";
  let rels = await zip.file(relPath).async("string");
  let maxId = 0;
  for (const m of rels.matchAll(/Id="rId(\d+)"/g)) {
    maxId = Math.max(maxId, Number(m[1]));
  }
  let nomorBerkas = 1;
  while (zip.file(`ppt/fonts/font${nomorBerkas}.fntdata`)) nomorBerkas++;

  const entriLst = [];
  let relBaru = "";
  for (const f of daftar) {
    const idVarian = {};
    for (const [v, buf] of Object.entries(f.varian)) {
      const rId = `rId${++maxId}`;
      const nf = `font${nomorBerkas++}.fntdata`;
      zip.file(`ppt/fonts/${nf}`, buf);
      relBaru += `<Relationship Id="${rId}" Type="${REL_FONT}" Target="fonts/${nf}"/>`;
      idVarian[v] = rId;
    }
    let e = `<p:embeddedFont><p:font typeface="${escXml(f.nama)}"/>`;
    if (idVarian.regular)    e += `<p:regular r:id="${idVarian.regular}"/>`;
    if (idVarian.bold)       e += `<p:bold r:id="${idVarian.bold}"/>`;
    if (idVarian.italic)     e += `<p:italic r:id="${idVarian.italic}"/>`;
    if (idVarian.boldItalic) e += `<p:boldItalic r:id="${idVarian.boldItalic}"/>`;
    e += `</p:embeddedFont>`;
    entriLst.push(e);
  }
  rels = rels.replace("</Relationships>", `${relBaru}</Relationships>`);
  zip.file(relPath, rels);

  // ---- 3. presentation.xml: atribut + embeddedFontLst ----
  const presPath = "ppt/presentation.xml";
  let pres = await zip.file(presPath).async("string");
  if (!/embedTrueTypeFonts=/.test(pres)) {
    pres = pres.replace("<p:presentation ", `<p:presentation embedTrueTypeFonts="1" `);
  }
  const lst = entriLst.join("");
  if (/<p:embeddedFontLst>/.test(pres)) {
    pres = pres.replace("<p:embeddedFontLst>", `<p:embeddedFontLst>${lst}`);
  } else {
    const blok = `<p:embeddedFontLst>${lst}</p:embeddedFontLst>`;
    // Urutan skema CT_Presentation: …sldIdLst, sldSz?, notesSz, embeddedFontLst…
    if (/<p:notesSz[^>]*\/>/.test(pres)) {
      pres = pres.replace(/(<p:notesSz[^>]*\/>)/, `$1${blok}`);
    } else if (/<p:sldSz[^>]*\/>/.test(pres)) {
      pres = pres.replace(/(<p:sldSz[^>]*\/>)/, `$1${blok}`);
    } else {
      pres = pres.replace("</p:sldIdLst>", `</p:sldIdLst>${blok}`);
    }
  }
  zip.file(presPath, pres);
}

/* ================= API utama ================= */

/**
 * Proses PPTX ekspor Canva: pindai font → unduh dari Google Fonts → tanam.
 *
 * @param {Buffer} buffer  isi berkas .pptx
 * @returns {Promise<{buffer: Buffer, laporan: object}>}
 *   laporan = {
 *     totalSlide, fonts: [{ nama, status: 'tertanam'|'sistem'|'manual',
 *                           varian: string[], url }],
 *     raster: [{ slide, gambar }],   // slide yang memuat gambar/rasterisasi
 *     sudahTertanam: boolean,        // file sumber sudah punya font tertanam
 *   }
 */
export async function prosesPptxCanva(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  if (!zip.file("ppt/presentation.xml")) {
    throw Object.assign(new Error("Berkas bukan PowerPoint (.pptx) yang valid"), { status: 400 });
  }

  const semuaFont = await pindaiFont(zip);
  const raster = await pindaiRaster(zip);
  const presXml = await zip.file("ppt/presentation.xml").async("string");
  const sudahTertanam = /<p:embeddedFontLst>/.test(presXml);

  const fonts = [];
  const untukDitanam = [];
  const ttf = buatCacheTtf(); // satu varian tidak diunduh dua kali
  for (const nama of semuaFont) {
    const { keluarga } = uraiNamaFont(nama);
    if (FONT_SISTEM.has(nama.toLowerCase()) || FONT_SISTEM.has(keluarga.toLowerCase())) {
      fonts.push({ nama, status: "sistem", varian: [], url: "" });
      continue;
    }
    const hasil = await unduhFontGoogle(nama, ttf);
    if (hasil) {
      untukDitanam.push({ nama, varian: hasil.varian });
      fonts.push({ nama, status: "tertanam", varian: Object.keys(hasil.varian), url: "" });
    } else {
      fonts.push({
        nama, status: "manual", varian: [],
        url: `https://fonts.google.com/?query=${encodeURIComponent(keluarga)}`,
      });
    }
  }

  await tanamFont(zip, untukDitanam);

  const keluar = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  return {
    buffer: keluar,
    laporan: {
      totalSlide: raster.length,
      fonts,
      raster: raster.filter((r) => r.gambar > 0),
      sudahTertanam,
    },
  };
}

